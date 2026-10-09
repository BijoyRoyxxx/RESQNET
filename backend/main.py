import asyncio
import hashlib
import importlib.util
import logging
from collections import Counter
from contextlib import asynccontextmanager
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import delete, func, select, text, update
from sqlalchemy.orm import Session
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.admin_bootstrap import bootstrap_admin
from backend.auth import User, authorize, owned_media
from backend.auth import router as auth_router
from backend.config import settings
from backend.db import (
    Association,
    Audit,
    Base,
    CaseMessage,
    Extraction,
    Incident,
    LoginAttempt,
    Match,
    Media,
    MediaOwner,
    Report,
    ReportCase,
    ResponderAlert,
    Review,
    ServiceSearch,
    engine,
    get_db,
)
from backend.limits import RequestSizeLimit
from backend.live import updates
from backend.media import delete_media, read_media, store_upload, transcribe
from backend.portal import router as portal_router
from backend.responders import alert_dict, prepare_alert, search_services, send_alert
from backend.schemas import (
    AlertInput,
    DataResetInput,
    IncidentPatch,
    MergeInput,
    NearbyInput,
    ReportInput,
    ReviewInput,
    SendAlertInput,
    VerificationInput,
)
from backend.service import (
    approve_match,
    audit,
    close_empty_incident,
    create_report,
    incident_dict,
    report_dict,
    report_dicts,
    require,
    review,
    row,
    separate_report,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
logger = logging.getLogger("resq.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    bootstrap_admin()
    yield


app = FastAPI(
    title="RESQNET",
    version="1.0.0",
    description="User and administrator incident workspace. Not emergency dispatch.",
    lifespan=lifespan,
    dependencies=[Depends(authorize)],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
app.add_middleware(RequestSizeLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Idempotency-Key", "X-CSRF-Token"],
    allow_credentials=True,
)
app.include_router(auth_router)
app.include_router(portal_router)
DB = Annotated[Session, Depends(get_db, scope="function")]


@app.middleware("http")
async def local_write_guard(request: Request, call_next):
    if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin not in settings.cors_origins:
            return JSONResponse(
                {"error": {"code": "untrusted_origin", "message": "Write origin is not allowed"}},
                status_code=403,
            )
        content_length = request.headers.get("content-length")
        if content_length and (not content_length.isdigit() or int(content_length) > 11 * 1024 * 1024):
            return JSONResponse(
                {"error": {"code": "too_large", "message": "Request exceeds 11 MB"}}, status_code=413
            )
    response = await call_next(request)
    if (
        request.method in {"POST", "PATCH", "PUT", "DELETE"}
        and response.status_code < 400
        and request.url.path not in {"/api/services/nearby", "/api/auth/login", "/api/auth/logout"}
    ):
        await updates.publish()
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/live")
async def live_updates(request: Request, account: User):
    """Keep a small event stream open and let each portal refetch only after a save."""

    async def events():
        subscriber = await updates.subscribe()
        yield "retry: 1000\nevent: ready\ndata: {}\n\n"
        try:
            while not await request.is_disconnected():
                try:
                    await asyncio.wait_for(subscriber.get(), timeout=15)
                    yield "event: update\ndata: {}\n\n"
                except TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            await updates.unsubscribe(subscriber)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.delete("/api/admin/data")
def clear_operational_data(payload: DataResetInput, db: DB, account: User):
    """Remove reports and evidence while retaining every portal account."""

    if account.role != "admin":
        raise HTTPException(403, "Administrator access required")

    media = db.scalars(select(Media)).all()
    for item in media:
        delete_media(item.path)

    deleted = {}
    db.execute(update(Incident).values(merged_into=None))
    for model in (
        ResponderAlert,
        MediaOwner,
        CaseMessage,
        ReportCase,
        Association,
        Match,
        Extraction,
        Media,
        ServiceSearch,
        Review,
        Audit,
        Report,
        Incident,
        LoginAttempt,
    ):
        deleted[model.__tablename__] = db.scalar(select(func.count()).select_from(model)) or 0
        db.execute(delete(model))
    return {"cleared": deleted, "retained": "all user and administrator accounts"}


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        {"error": {"code": str(exc.status_code), "message": exc.detail}}, status_code=exc.status_code
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    issues = [{"field": ".".join(str(v) for v in e["loc"]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(
        {"error": {"code": "validation", "message": "Check the submitted fields", "issues": issues}},
        status_code=422,
    )


@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    logger.error("request_failed method=%s error_type=%s", request.method, type(exc).__name__)
    return JSONResponse(
        {"error": {"code": "internal", "message": "Request failed; no partial review was committed"}},
        status_code=500,
    )


@app.post("/api/reports", status_code=201)
def submit_report(
    payload: ReportInput,
    db: DB,
    response: Response,
    account: User,
    idempotency_key: Annotated[str | None, Header(max_length=100)] = None,
):
    for media_id in payload.media_ids:
        owned_media(db, account, media_id)
    key = hashlib.sha256(f"{account.id}:{idempotency_key}".encode()).hexdigest() if idempotency_key else None
    report, created = create_report(db, payload, key)
    if created:
        db.add(
            ReportCase(
                report_id=report.id,
                account_id=account.id,
                category=payload.category,
                immediate_danger=payload.immediate_danger,
            )
        )
        db.flush()
    if not created:
        response.status_code = 200
    return report_dict(db, report)


@app.get("/api/reports")
def reports(db: DB, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    records = list(db.scalars(select(Report).order_by(Report.created_at.desc()).offset(offset).limit(limit)))
    data = report_dicts(db, records)
    return [data[r.id] for r in records]


@app.get("/api/reports/{report_id}")
def report_detail(report_id: str, db: DB):
    return report_dict(db, require(db, Report, report_id))


@app.post("/api/reports/{report_id}/verification")
def verify_report(report_id: str, payload: VerificationInput, db: DB):
    report = require(db, Report, report_id)
    before = report.review_status
    report.review_status = payload.status
    review(db, "report_reviewed", report.id, payload.reason, {"status": before}, {"status": payload.status})
    return report_dict(db, report)


@app.post("/api/reports/{report_id}/separate")
def separate(report_id: str, payload: ReviewInput, db: DB):
    return incident_dict(db, separate_report(db, report_id, payload.reason), True)


@app.get("/api/incidents")
def incidents(db: DB):
    all_reports = list(db.scalars(select(Report).order_by(Report.created_at)))
    grouped: dict[str, list] = {}
    for report in report_dicts(db, all_reports).values():
        grouped.setdefault(report["incident_id"], []).append(report)
    return [
        incident_dict(db, i, reports=grouped.get(i.id, []))
        for i in db.scalars(
            select(Incident).where(Incident.merged_into.is_(None)).order_by(Incident.created_at.desc())
        )
    ]


@app.get("/api/incidents/{incident_id}")
def incident_detail(incident_id: str, db: DB):
    return incident_dict(db, require(db, Incident, incident_id), True)


@app.get("/api/incidents/{incident_id}/evidence")
def evidence(incident_id: str, db: DB):
    incident = require(db, Incident, incident_id)
    result = incident_dict(db, incident, True)
    ids = [r["id"] for r in result["reports"]]
    result["matches"] = [row(m) for m in db.scalars(select(Match).where(Match.report_id.in_(ids)))]
    return result


@app.patch("/api/incidents/{incident_id}")
def correct(incident_id: str, payload: IncidentPatch, db: DB):
    incident = require(db, Incident, incident_id)
    if incident.merged_into:
        raise HTTPException(409, "Cannot edit a merged incident")
    changes = payload.model_dump(exclude_unset=True, exclude={"reason"})
    for field in ("incident_type", "summary", "status"):
        if field in changes and changes[field] is None:
            raise HTTPException(422, f"{field} cannot be null")
    lat, lon = changes.get("latitude", incident.latitude), changes.get("longitude", incident.longitude)
    if (lat is None) != (lon is None):
        raise HTTPException(422, "Provide both coordinates or clear both")
    before = {k: getattr(incident, k) for k in changes}
    for key, value in changes.items():
        setattr(incident, key, value)
    review(db, "incident_corrected", incident.id, payload.reason, before, changes)
    return incident_dict(db, incident, True)


@app.post("/api/incidents/{incident_id}/merge")
def merge(incident_id: str, payload: MergeInput, db: DB):
    source, target = require(db, Incident, incident_id), require(db, Incident, payload.target_id)
    if source.id == target.id or source.merged_into or target.merged_into:
        raise HTTPException(409, "Choose two different active incidents")
    moved = []
    for link in db.scalars(select(Association).where(Association.incident_id == source.id)):
        link.incident_id = target.id
        moved.append(link.report_id)
    for match in db.scalars(select(Match).where(Match.report_id.in_(moved), Match.status == "pending")):
        match.status = "superseded"
    close_empty_incident(db, source.id, target.id)
    review(db, "incidents_merged", source.id, payload.reason, {"report_ids": moved}, {"target_id": target.id})
    audit(
        db,
        "incidents_merged",
        target.id,
        {"source_id": source.id, "report_ids": moved, "reason": payload.reason},
    )
    return incident_dict(db, target, True)


@app.get("/api/matches")
def matches(db: DB, status: str = "pending"):
    query = select(Match).order_by(Match.score.desc())
    if status != "all":
        query = query.where(Match.status == status)
    return [
        {
            **row(m),
            "report": report_dict(db, require(db, Report, m.report_id)),
            "incident": incident_dict(db, require(db, Incident, m.incident_id)),
        }
        for m in db.scalars(query)
    ]


@app.post("/api/matches/{match_id}/approve")
def approve(match_id: str, payload: ReviewInput, db: DB):
    match = require(db, Match, match_id)
    approve_match(db, match, payload.reason)
    return row(match)


@app.post("/api/matches/{match_id}/reject")
def reject(match_id: str, payload: ReviewInput, db: DB):
    match = require(db, Match, match_id)
    if match.status != "pending":
        raise HTTPException(409, "Match already reviewed")
    match.status = "rejected"
    review(
        db,
        "match_rejected",
        match.report_id,
        payload.reason,
        {"match_status": "pending"},
        {"match_status": "rejected", "match_id": match.id},
    )
    return row(match)


@app.post("/api/media", status_code=201)
def upload(db: DB, account: User, file: UploadFile = File(...)):
    path, mime, kind = store_upload(file)
    media = Media(path=path, mime=mime, kind=kind)
    try:
        db.add(media)
        db.flush()
        db.add(MediaOwner(media_id=media.id, account_id=account.id))
        db.commit()
    except Exception:
        delete_media(path)
        raise
    return {"id": media.id, "kind": kind, "url": f"/api/media/{media.id}"}


@app.get("/api/media/{media_id}")
def media_file(media_id: str, db: DB):
    media = require(db, Media, media_id)
    return Response(
        read_media(media.path), media_type=media.mime, headers={"Cache-Control": "private, no-store"}
    )


@app.post("/api/media/{media_id}/transcribe")
def transcribe_media(media_id: str, db: DB, language: str | None = Query(None, pattern="^(en|bn|hi)$")):
    media = require(db, Media, media_id)
    if media.kind != "audio":
        raise HTTPException(422, "Choose an audio file")
    result = transcribe(media.path, language)
    media.transcript = result["transcript"]
    audit(
        db,
        "audio_transcribed",
        media.report_id or media.id,
        {"media_id": media.id, "engine": result["engine"]},
    )
    return result


@app.post("/api/reports/{report_id}/transcribe")
def transcribe_report(report_id: str, db: DB, language: str | None = Query(None, pattern="^(en|bn|hi)$")):
    require(db, Report, report_id)
    media = db.scalar(select(Media).where(Media.report_id == report_id, Media.kind == "audio"))
    if media is None:
        raise HTTPException(404, "Report has no audio attachment")
    return transcribe_media(media.id, db, language)


@app.get("/api/analytics/summary")
def analytics(db: DB):
    return analytics_summary(db, incidents(db))


@app.get("/api/dashboard")
def dashboard(db: DB):
    active = incidents(db)
    return {"incidents": active, "summary": analytics_summary(db, active)}


def analytics_summary(db: Session, active: list):
    all_reports = db.scalars(select(Report)).all()
    times = Counter(r.created_at.strftime("%Y-%m-%d %H:00") for r in all_reports)
    engines = Counter(db.scalars(select(Extraction.engine)).all())
    return {
        "total_reports": len(all_reports),
        "unique_incidents": len(active),
        "awaiting_review": sum(r.review_status != "verified" for r in all_reports),
        "high_priority": sum(i["priority"]["level"] == "high" and i["status"] != "resolved" for i in active),
        "pending_matches": db.scalar(
            select(func.count()).select_from(Match).where(Match.status == "pending")
        ),
        "synthetic_reports": sum(r.synthetic for r in all_reports),
        "types": [
            {"name": key, "value": value}
            for key, value in Counter(i["incident_type"] for i in active).items()
        ],
        "languages": [
            {"name": key, "value": value} for key, value in Counter(r.language for r in all_reports).items()
        ],
        "volume": [{"time": k, "reports": v} for k, v in sorted(times.items())],
        "engines": dict(engines),
        "activity": [row(a) for a in db.scalars(select(Audit).order_by(Audit.created_at.desc()).limit(20))],
    }


@app.get("/api/health")
def health(db: DB):
    db.execute(text("SELECT 1"))
    available, reachable = False, False
    try:
        if settings.ai_mode == "rules":
            raise ValueError("Local model disabled")
        response = httpx.get(f"{settings.ollama_url}/api/tags", timeout=2)
        response.raise_for_status()
        reachable = True
        available = settings.ollama_model in {m["name"] for m in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError, KeyError):
        pass
    voice_installed = importlib.util.find_spec("faster_whisper") is not None
    return {
        "status": "ok",
        "database": "connected",
        "deployment": "local user and admin portals",
        "ai_mode": settings.ai_mode,
        "ollama_reachable": reachable,
        "model": settings.ollama_model,
        "model_available": available,
        "effective_engine": "Gemma (fallback on invalid output)"
        if available and settings.ai_mode != "rules"
        else "Deterministic fallback",
        "voice_enabled": settings.voice_enabled and voice_installed,
        "voice_installed": voice_installed,
        "whisper_model": settings.whisper_model,
        "match_threshold": settings.match_threshold,
        "notice": "Research demonstration. Human review required. Not an emergency dispatch service.",
    }


@app.post("/api/services/nearby")
def nearby_services(payload: NearbyInput, db: DB):
    return search_services(db, payload)


@app.post("/api/reports/{report_id}/alerts", status_code=201)
def prepare_responder_alert(report_id: str, payload: AlertInput, db: DB):
    return prepare_alert(db, report_id, payload)


@app.get("/api/reports/{report_id}/alerts")
def responder_alerts(report_id: str, db: DB):
    require(db, Report, report_id)
    return [
        alert_dict(a)
        for a in db.scalars(
            select(ResponderAlert)
            .where(ResponderAlert.report_id == report_id)
            .order_by(ResponderAlert.created_at.desc())
        )
    ]


@app.post("/api/alerts/{alert_id}/send")
def deliver_responder_alert(alert_id: str, payload: SendAlertInput, db: DB):
    return send_alert(db, alert_id)
