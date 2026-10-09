import hashlib
import json

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import Association, Audit, Extraction, Incident, Match, Media, Report, ReportCase, Review
from backend.intelligence import extract, matching, priority
from backend.schemas import ReportInput


def require(db: Session, model, entity_id: str):
    obj = db.get(model, entity_id)
    if obj is None:
        raise HTTPException(404, "Record not found")
    return obj


def row(obj) -> dict:
    return {column.name: getattr(obj, column.name) for column in obj.__table__.columns}


def report_dicts(db: Session, reports: list[Report]) -> dict[str, dict]:
    if not reports:
        return {}
    ids = [r.id for r in reports]
    attachments: dict[str, list] = {}
    for media in db.scalars(select(Media).where(Media.report_id.in_(ids))):
        if media.report_id is not None:
            attachments.setdefault(media.report_id, []).append(media)
    return {
        report.id: serialize_report(report, case, extraction, association, attachments.get(report.id, []))
        for report, case, extraction, association in db.execute(
            select(Report, ReportCase, Extraction, Association)
            .outerjoin(ReportCase, ReportCase.report_id == Report.id)
            .outerjoin(Extraction, Extraction.report_id == Report.id)
            .outerjoin(Association, Association.report_id == Report.id)
            .where(Report.id.in_(ids))
        )
    }


def report_dict(db: Session, report: Report) -> dict:
    return report_dicts(db, [report])[report.id]


def serialize_report(report, case, extraction, association, media) -> dict:
    data = row(report)
    data.pop("payload_hash")
    data.pop("idempotency_key")
    return {
        **data,
        "category": case.category if case else None,
        "extraction": extraction.result if extraction else {},
        "engine": extraction.engine if extraction else "pending",
        "latency_ms": extraction.latency_ms if extraction else None,
        "incident_id": association.incident_id if association else None,
        "media": [
            {"id": m.id, "kind": m.kind, "url": f"/api/media/{m.id}", "transcript": m.transcript}
            for m in media
        ],
    }


def incident_reports(db: Session, incident_id: str) -> list[dict]:
    reports = db.scalars(
        select(Report)
        .join(Association, Report.id == Association.report_id)
        .where(Association.incident_id == incident_id)
        .order_by(Report.created_at)
    ).all()
    data = report_dicts(db, list(reports))
    return [data[r.id] for r in reports]


def incident_dict(db: Session, incident: Incident, detail: bool = False, reports=None) -> dict:
    if reports is None:
        reports = incident_reports(db, incident.id)
    result = {
        **row(incident),
        "report_count": len(reports),
        "synthetic": bool(reports) and all(r["synthetic"] for r in reports),
        "priority": priority(reports, incident.latitude is not None),
        "languages": sorted({r["language"] for r in reports}),
    }
    if detail:
        result["reports"] = reports
        ids = [incident.id] + [r["id"] for r in reports]
        result["history"] = [
            row(a)
            for a in db.scalars(
                select(Audit).where(Audit.entity_id.in_(ids)).order_by(Audit.created_at.desc())
            )
        ]
        result["reviews"] = [
            row(r)
            for r in db.scalars(
                select(Review).where(Review.entity_id.in_(ids)).order_by(Review.created_at.desc())
            )
        ]
    return result


def audit(db: Session, action: str, entity_id: str, detail: dict | None = None):
    db.add(
        Audit(
            action=action,
            entity_id=entity_id,
            detail={**(detail or {}), "actor": db.info.get("actor", "local-operator")},
        )
    )


def review(db: Session, action: str, entity_id: str, reason: str, before: dict, after: dict):
    db.add(
        Review(
            action=action,
            entity_id=entity_id,
            actor=db.info.get("actor", "local-operator"),
            reason=reason,
            before=before,
            after=after,
        )
    )
    audit(db, action, entity_id, {"reason": reason, "before": before, "after": after})


def create_report(db: Session, payload: ReportInput, key: str | None = None) -> tuple[Report, bool]:
    digest = hashlib.sha256(json.dumps(payload.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    if key:
        existing = db.scalar(select(Report).where(Report.idempotency_key == key))
        if existing:
            if existing.payload_hash != digest:
                raise HTTPException(409, "Idempotency key was already used with different content")
            return existing, False
    attachments = []
    for media_id in payload.media_ids:
        media = require(db, Media, media_id)
        if media.report_id is not None:
            raise HTTPException(409, "Media already belongs to a report")
        attachments.append(media)
    result, engine, latency = extract(payload)
    report = Report(
        **payload.model_dump(exclude={"media_ids", "language", "category", "immediate_danger"}),
        language=result.language,
        idempotency_key=key,
        payload_hash=digest,
    )
    db.add(report)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Report).where(Report.idempotency_key == key)) if key else None
        if existing and existing.payload_hash == digest:
            return existing, False
        raise HTTPException(409, "Conflicting report request") from None
    db.add(Extraction(report_id=report.id, result=result.model_dump(), engine=engine, latency_ms=latency))
    source = {**payload.model_dump(), "incident_type": result.incident_type}
    candidates = db.scalars(
        select(Incident).where(Incident.merged_into.is_(None), Incident.status != "resolved")
    ).all()
    for candidate in candidates:
        comparisons = []
        for previous in incident_reports(db, candidate.id):
            comparison = matching(
                source,
                {
                    **previous,
                    "incident_type": candidate.incident_type,
                    "latitude": candidate.latitude,
                    "longitude": candidate.longitude,
                },
            )
            comparison["compared_report_id"] = previous["id"]
            comparisons.append(comparison)
        if comparisons:
            best = max(comparisons, key=lambda c: c["score"])
            if best["score"] >= settings.match_threshold:
                db.add(
                    Match(report_id=report.id, incident_id=candidate.id, score=best["score"], factors=best)
                )
    incident = Incident(
        incident_type=result.incident_type,
        location_text=result.location_text,
        latitude=payload.latitude,
        longitude=payload.longitude,
        summary=result.summary,
    )
    db.add(incident)
    db.flush()
    db.add(Association(report_id=report.id, incident_id=incident.id))
    for media in attachments:
        media.report_id = report.id
    audit(db, "report_received", report.id, {"engine": engine, "synthetic": report.synthetic})
    audit(db, "incident_created", incident.id, {"report_id": report.id})
    db.flush()
    return report, True


def close_empty_incident(db: Session, old_id: str, target_id: str):
    db.flush()
    remaining = db.scalar(select(Association).where(Association.incident_id == old_id))
    if remaining is None:
        require(db, Incident, old_id).merged_into = target_id
        for match in db.scalars(select(Match).where(Match.incident_id == old_id, Match.status == "pending")):
            match.status = "superseded"


def approve_match(db: Session, match: Match, reason: str):
    if match.status != "pending":
        raise HTTPException(409, "Match already reviewed")
    target = require(db, Incident, match.incident_id)
    if target.merged_into:
        raise HTTPException(409, "Target incident has been merged; refresh the queue")
    association = db.scalar(select(Association).where(Association.report_id == match.report_id))
    if association is None or association.incident_id == target.id:
        raise HTTPException(409, "Report is already linked or has no source incident")
    old_id = association.incident_id
    association.incident_id = target.id
    match.status = "approved"
    require(db, Report, match.report_id).review_status = "verified"
    for other in db.scalars(
        select(Match).where(
            Match.report_id == match.report_id, Match.id != match.id, Match.status == "pending"
        )
    ):
        other.status = "superseded"
    close_empty_incident(db, old_id, target.id)
    review(
        db,
        "match_approved",
        match.report_id,
        reason,
        {"incident_id": old_id},
        {"incident_id": target.id, "match_id": match.id},
    )
    audit(db, "report_linked", target.id, {"report_id": match.report_id, "source_incident": old_id})


def separate_report(db: Session, report_id: str, reason: str) -> Incident:
    report = require(db, Report, report_id)
    association = db.scalar(select(Association).where(Association.report_id == report_id))
    if association is None or len(incident_reports(db, association.incident_id)) < 2:
        raise HTTPException(409, "Report is already in its own incident")
    old_id = association.incident_id
    result = report_dict(db, report)["extraction"]
    incident = Incident(
        incident_type=result["incident_type"],
        location_text=report.location_text,
        latitude=report.latitude,
        longitude=report.longitude,
        summary=result["summary"],
    )
    db.add(incident)
    db.flush()
    association.incident_id = incident.id
    report.review_status = "needs_verification"
    review(db, "report_separated", report_id, reason, {"incident_id": old_id}, {"incident_id": incident.id})
    audit(db, "report_separated", old_id, {"report_id": report_id, "new_incident": incident.id})
    db.flush()
    return incident
