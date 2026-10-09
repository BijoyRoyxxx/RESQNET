from collections.abc import Generator
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    create_engine,
    event,
)
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from backend.config import settings


def now() -> datetime:
    return datetime.now(timezone.utc)


def uid() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Report(Record, Base):
    __tablename__ = "reports"
    text: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(8))
    location_text: Mapped[str | None] = mapped_column(String(200))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    people_affected: Mapped[int | None] = mapped_column(Integer)
    requested_assistance: Mapped[list] = mapped_column(JSON, default=list)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    review_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), unique=True)
    payload_hash: Mapped[str] = mapped_column(String(64))


class Extraction(Record, Base):
    __tablename__ = "extractions"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), unique=True)
    result: Mapped[dict] = mapped_column(JSON)
    engine: Mapped[str] = mapped_column(String(60))
    latency_ms: Mapped[float] = mapped_column(Float)


class Incident(Record, Base):
    __tablename__ = "incidents"
    incident_type: Mapped[str] = mapped_column(String(30), index=True)
    location_text: Mapped[str | None] = mapped_column(String(200))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    summary: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="unreviewed", index=True)
    merged_into: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"))


class Association(Record, Base):
    __tablename__ = "associations"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), unique=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)


class Match(Record, Base):
    __tablename__ = "matches"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    score: Mapped[float] = mapped_column(Float)
    factors: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    __table_args__ = (Index("match_pair", "report_id", "incident_id", unique=True),)


class Media(Record, Base):
    __tablename__ = "media"
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id"), index=True)
    kind: Mapped[str] = mapped_column(String(10))
    mime: Mapped[str] = mapped_column(String(50))
    path: Mapped[str] = mapped_column(String(200))
    transcript: Mapped[str | None] = mapped_column(Text)


class Review(Record, Base):
    __tablename__ = "reviews"
    action: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    actor: Mapped[str] = mapped_column(String(60), default="local-operator")
    reason: Mapped[str] = mapped_column(Text)
    before: Mapped[dict] = mapped_column(JSON, default=dict)
    after: Mapped[dict] = mapped_column(JSON, default=dict)


class Audit(Record, Base):
    __tablename__ = "audit"
    action: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)


class ServiceSearch(Record, Base):
    __tablename__ = "service_searches"
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    service: Mapped[str] = mapped_column(String(20))
    radius_km: Mapped[int] = mapped_column(Integer)
    facilities: Mapped[list] = mapped_column(JSON)


class ResponderAlert(Record, Base):
    __tablename__ = "responder_alerts"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    search_id: Mapped[str] = mapped_column(ForeignKey("service_searches.id"))
    facility_id: Mapped[str] = mapped_column(String(80))
    facility: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(40), default="prepared_not_sent")
    message: Mapped[str] = mapped_column(Text)
    __table_args__ = (Index("report_facility_alert", "report_id", "facility_id", unique=True),)


class Account(Record, Base):
    __tablename__ = "accounts"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(10), default="user")


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginAttempt(Record, Base):
    __tablename__ = "login_attempts"
    address: Mapped[str] = mapped_column(String(64), index=True)


class ReportCase(Record, Base):
    __tablename__ = "report_cases"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), unique=True)
    account_id: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"), index=True)
    category: Mapped[str | None] = mapped_column(String(30))
    immediate_danger: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    urgency_override: Mapped[str | None] = mapped_column(String(10))
    assigned_to: Mapped[str | None] = mapped_column(ForeignKey("accounts.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)


class CaseMessage(Record, Base):
    __tablename__ = "case_messages"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    body: Mapped[str] = mapped_column(Text)
    changes: Mapped[dict] = mapped_column(JSON, default=dict)


class MediaOwner(Base):
    __tablename__ = "media_owners"
    media_id: Mapped[str] = mapped_column(ForeignKey("media.id"), primary_key=True)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))


def make_engine(url: str):
    if url.startswith("sqlite"):
        path = make_url(url).database
        if path and path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
    db_engine = create_engine(
        url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {}
    )
    if url.startswith("sqlite"):

        @event.listens_for(db_engine, "connect")
        def configure_sqlite(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=10000")
            connection.execute("PRAGMA journal_mode=WAL")

    return db_engine


engine = make_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
