import logging
import re
from datetime import timedelta, timezone
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import Report, ResponderAlert, ServiceSearch, now
from backend.intelligence import KEYWORDS, haversine, signal
from backend.schemas import AlertInput, NearbyInput
from backend.service import audit, require, row

SERVICE_TAGS = {
    "fire": ['["amenity"="fire_station"]'],
    "police": ['["amenity"="police"]'],
    "rescue": [
        '["amenity"="fire_station"]',
        '["emergency"="rescue_station"]',
        '["emergency"="disaster_response"]',
    ],
    "medical": ['["amenity"="hospital"]["emergency"!="no"]'],
}

logger = logging.getLogger(__name__)


def recommended_service(text: str, category: str | None = None) -> tuple[str, str]:
    if category is not None:
        service = {"fire": "fire", "medical": "medical", "flood": "rescue"}.get(category, "police")
        return service, f"Routed from the selected {category} category. You can change the service."
    for category, service in [
        ("fire", "fire"),
        ("medical", "medical"),
        ("flood", "rescue"),
    ]:
        if signal(text, KEYWORDS[category])[0] is True:
            return (
                service,
                f"Suggested from a reported {category} indicator. Change the service if it does not fit.",
            )
    return (
        "police",
        "General cases are routed to the nearest mapped police station. Change the service if needed.",
    )


def safe_phone(value: str) -> str | None:
    value = value.split(";")[0].strip()
    if not re.fullmatch(r"\+?[\d ()\-.]{7,25}", value):
        return None
    number = re.sub(r"[^\d+]", "", value)
    return number if 7 <= len(number.lstrip("+")) <= 15 else None


def facility_rows(elements: list, lat: float, lon: float, radius: int) -> list[dict]:
    found = {}
    for element in elements:
        try:
            if element["type"] not in {"node", "way", "relation"}:
                continue
            coordinates = element if "lat" in element else element.get("center", {})
            flat, flon = float(coordinates["lat"]), float(coordinates["lon"])
            if not (-90 <= flat <= 90 and -180 <= flon <= 180):
                continue
            distance = haversine((lat, lon), (flat, flon))
            if distance > radius:
                continue
            tags = element.get("tags", {})
            if any(tags.get(k) == "yes" for k in ("disused", "abandoned")) or tags.get("access") == "no":
                continue
            facility_id = f"{element['type']}/{int(element['id'])}"
            found[facility_id] = {
                "id": facility_id,
                "name": str(tags.get("name:en") or tags.get("name") or "Unnamed mapped facility")[:250],
                "latitude": flat,
                "longitude": flon,
                "distance_km": round(distance, 3),
                "phone": safe_phone(str(tags.get("contact:phone") or tags.get("phone") or "")),
                "address": ", ".join(
                    str(tags[key])
                    for key in ("addr:housenumber", "addr:street", "addr:city")
                    if tags.get(key)
                )[:400],
                "kind": str(tags.get("amenity") or tags.get("emergency") or "facility")[:60],
                "source_url": f"https://www.openstreetmap.org/{facility_id}",
            }
        except (KeyError, ValueError, TypeError):
            continue
    return sorted(found.values(), key=lambda x: (x["distance_km"], x["id"]))[:12]


def search_services(db: Session, payload: NearbyInput) -> dict:
    suggested, reason = recommended_service(payload.text, payload.category)
    service = suggested if payload.service == "auto" else payload.service
    if payload.service != "auto":
        reason = "Service selected by you. Results are ordered by straight-line distance."
    # Cache an exact search for ten minutes; no raw report text is stored or sent to the map provider.
    existing = db.scalar(
        select(ServiceSearch)
        .where(
            ServiceSearch.latitude == payload.latitude,
            ServiceSearch.longitude == payload.longitude,
            ServiceSearch.service == service,
            ServiceSearch.radius_km == payload.radius_km,
            ServiceSearch.created_at >= now() - timedelta(minutes=10),
        )
        .order_by(ServiceSearch.created_at.desc())
    )
    if existing and service == "medical" and any(f.get("kind") != "hospital" for f in existing.facilities):
        existing = None
    cached = existing is not None
    if existing is None:
        facilities = []
        for search_radius in (radius for radius in (5, 10, 25, 50) if radius <= payload.radius_km):
            center = f"around:{search_radius * 1000},{payload.latitude:.6f},{payload.longitude:.6f}"
            # Start close and expand only when no facilities were found. This
            # keeps common lookups small enough for public Overpass instances.
            query = (
                "[out:json][timeout:25];("
                + "".join(f"nwr{tag}({center});" for tag in SERVICE_TAGS[service])
                + ");out center tags;"
            )
            try:
                response = httpx.post(
                    settings.overpass_url,
                    data={"data": query},
                    timeout=40,
                    headers={"User-Agent": "RESQNET/1.1 (+https://github.com/BijoyRoyxxx/RESQNET)"},
                )
                response.raise_for_status()
                result = response.json()
                if result.get("remark") or not isinstance(result.get("elements"), list):
                    raise ValueError("Incomplete provider response")
                facilities = facility_rows(
                    result["elements"], payload.latitude, payload.longitude, search_radius
                )
            except httpx.HTTPStatusError as exc:
                logger.warning("Overpass lookup failed with HTTP %s", exc.response.status_code)
                raise HTTPException(
                    503,
                    "Nearby-service lookup is unavailable. No station was contacted. Retry later or use your local emergency number.",
                ) from None
            except httpx.HTTPError as exc:
                logger.warning("Overpass lookup failed (%s)", type(exc).__name__)
                raise HTTPException(
                    503,
                    "Nearby-service lookup is unavailable. No station was contacted. Retry later or use your local emergency number.",
                ) from None
            except (ValueError, TypeError, AttributeError) as exc:
                logger.warning("Overpass returned unusable data (%s)", type(exc).__name__)
                raise HTTPException(
                    503,
                    "Nearby-service lookup is unavailable. No station was contacted. Retry later or use your local emergency number.",
                ) from None
            if facilities:
                break
        existing = ServiceSearch(
            latitude=payload.latitude,
            longitude=payload.longitude,
            service=service,
            radius_km=payload.radius_km,
            facilities=facilities,
        )
        db.add(existing)
        db.flush()
    return {
        **row(existing),
        "cached": cached,
        "suggested_service": suggested,
        "routing_reason": reason,
        "distance_method": "straight_line",
        "source": "OpenStreetMap / Overpass",
        "facilities": [
            {**f, "connected": f["id"] in settings.responder_webhooks} for f in existing.facilities
        ],
        "notice": "Nearest mapped facilities within the search radius, not a guarantee of jurisdiction, staffing, or response. Distances are straight-line, not road distance or arrival time.",
    }


def prepare_alert(db: Session, report_id: str, payload: AlertInput) -> dict:
    report = require(db, Report, report_id)
    search = require(db, ServiceSearch, payload.search_id)
    created = (
        search.created_at.replace(tzinfo=timezone.utc)
        if search.created_at.tzinfo is None
        else search.created_at
    )
    if now() - created > timedelta(minutes=15):
        raise HTTPException(
            409, "Search results expired. Find nearby services again before preparing an alert."
        )
    facility = next((f for f in search.facilities if f["id"] == payload.facility_id), None)
    if facility is None:
        raise HTTPException(422, "Choose a facility from these search results")
    if report.latitude is None or report.longitude is None:
        raise HTTPException(422, "Add an incident location before preparing an alert")
    if haversine((report.latitude, report.longitude), (search.latitude, search.longitude)) > 0.1:
        raise HTTPException(409, "Search around the report's saved location before preparing an alert")
    existing = db.scalar(
        select(ResponderAlert).where(
            ResponderAlert.report_id == report_id, ResponderAlert.facility_id == facility["id"]
        )
    )
    if existing:
        return alert_dict(existing)
    marker = "SYNTHETIC DEMONSTRATION, DO NOT DISPATCH" if report.synthetic else "UNVERIFIED SOURCE REPORT"
    message = f"{marker}\nReport {report.id}\nRequested service: {search.service}\nDestination: {facility['name']}\nIncident coordinates: {report.latitude}, {report.longitude}\nSource: {report.text}\nNo response has been confirmed."
    alert = ResponderAlert(
        report_id=report_id,
        search_id=search.id,
        facility_id=facility["id"],
        facility=facility,
        message=message,
        status="prepared_not_sent",
    )
    db.add(alert)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(ResponderAlert).where(
                ResponderAlert.report_id == report_id, ResponderAlert.facility_id == facility["id"]
            )
        )
        if existing:
            return alert_dict(existing)
        raise HTTPException(409, "Alert preparation conflicted; reload the report") from None
    audit(
        db,
        "responder_alert_prepared",
        report_id,
        {"alert_id": alert.id, "facility_id": facility["id"], "sent": False},
    )
    return alert_dict(alert)


def alert_dict(alert: ResponderAlert) -> dict:
    return {**row(alert), "connected": alert.facility_id in settings.responder_webhooks}


def send_alert(db: Session, alert_id: str) -> dict:
    alert = require(db, ResponderAlert, alert_id)
    report = require(db, Report, alert.report_id)
    if report.synthetic:
        raise HTTPException(409, "Synthetic reports cannot be sent to external responders")
    endpoint = settings.responder_webhooks.get(alert.facility_id)
    if not endpoint:
        raise HTTPException(
            503,
            "This station has no authorized alert connection. No alert was sent. Use the contact handoff.",
        )
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(503, "Responder connection must use an operator-configured HTTPS endpoint")
    claimed = db.execute(
        update(ResponderAlert)
        .where(ResponderAlert.id == alert.id, ResponderAlert.status == "prepared_not_sent")
        .values(status="sending")
        .returning(ResponderAlert.id)
    )
    if claimed.scalar_one_or_none() is None:
        raise HTTPException(
            409, "This alert already has a delivery attempt. Check its status; do not send duplicates."
        )
    # Commit the claim before network I/O so reloads and concurrent requests cannot duplicate dispatch.
    audit(
        db, "responder_alert_attempted", report.id, {"alert_id": alert.id, "facility_id": alert.facility_id}
    )
    db.commit()
    try:
        headers = {"Idempotency-Key": alert.id}
        if settings.responder_token.get_secret_value():
            headers["Authorization"] = f"Bearer {settings.responder_token.get_secret_value()}"
        response = httpx.post(
            endpoint,
            json={
                "alert_id": alert.id,
                "facility_id": alert.facility_id,
                "report_id": report.id,
                "message": alert.message,
            },
            headers=headers,
            timeout=12,
            follow_redirects=False,
        )
        if 200 <= response.status_code < 300:
            alert.status = "delivered_to_gateway"
        elif 400 <= response.status_code < 500:
            alert.status = "rejected_by_gateway"
        else:
            alert.status = "delivery_unknown"
    except httpx.HTTPError:
        alert.status = "delivery_unknown"
    audit(db, "responder_alert_result", report.id, {"alert_id": alert.id, "status": alert.status})
    db.commit()
    return alert_dict(alert)
