import hashlib
import secrets
from datetime import timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import (
    Account,
    LoginAttempt,
    LoginSession,
    MediaOwner,
    ReportCase,
    ResponderAlert,
    get_db,
    now,
)

DB = Annotated[Session, Depends(get_db, scope="function")]
router = APIRouter(prefix="/api/auth")
COOKIE = "resq_session"


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=2**17, r=8, p=1, maxmem=256 * 1024 * 1024
    ).hex()
    return f"scrypt${salt}${digest}"


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def public_account(account: Account):
    return {"id": account.id, "name": account.name, "email": account.email, "role": account.role}


def current_account(request: Request, db: DB) -> Account:
    session = db.get(LoginSession, token_hash(request.cookies.get(COOKIE, "")))
    if session is None or session.expires_at.replace(tzinfo=timezone.utc) <= now():
        raise HTTPException(401, "Sign in to continue")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and not secrets.compare_digest(
        request.headers.get("X-CSRF-Token", ""), session.csrf
    ):
        raise HTTPException(403, "Session verification failed. Refresh and try again.")
    account = db.get(Account, session.account_id)
    if account is None:
        raise HTTPException(401, "Sign in to continue")
    request.state.session = session
    db.info["actor"] = account.id
    return account


User = Annotated[Account, Depends(current_account)]


def owned_report(db: Session, account: Account, report_id: str):
    case = db.scalar(select(ReportCase).where(ReportCase.report_id == report_id))
    if account.role != "admin" and (case is None or case.account_id != account.id):
        raise HTTPException(404, "Report not found")


def owned_media(db: Session, account: Account, media_id: str):
    owner = db.get(MediaOwner, media_id)
    if account.role != "admin" and (owner is None or owner.account_id != account.id):
        raise HTTPException(404, "Attachment not found")


def authorize(request: Request, db: DB):
    path = request.url.path
    if path in {"/api/auth/login", "/api/auth/register", "/api/health"}:
        return
    account = current_account(request, db)
    if account.role == "admin":
        return
    parts = path.strip("/").split("/")
    if path.startswith(("/api/auth/", "/api/portal/")) or path == "/api/services/nearby":
        return
    if path in {"/api/reports", "/api/media"} and request.method == "POST":
        return
    if len(parts) >= 3 and parts[1] == "reports":
        if len(parts) == 3 or (len(parts) == 4 and parts[3] in {"alerts", "transcribe"}):
            owned_report(db, account, parts[2])
            return
    if len(parts) >= 3 and parts[1] == "media":
        owned_media(db, account, parts[2])
        return
    if len(parts) == 4 and parts[1] == "alerts" and parts[3] == "send":
        alert = db.get(ResponderAlert, parts[2])
        if alert is None:
            raise HTTPException(404, "Alert not found")
        owned_report(db, account, alert.report_id)
        return
    raise HTTPException(403, "Administrator access required")


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=3, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class Registration(Credentials):
    name: str = Field(min_length=2, max_length=80)

    @field_validator("name")
    @classmethod
    def meaningful_name(cls, value):
        if len(value.strip()) < 2:
            raise ValueError("Enter your name")
        return value.strip()


def throttle(request: Request, db: Session):
    address = token_hash(request.client.host if request.client else "unknown")
    cutoff = now() - timedelta(minutes=15)
    db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < cutoff))
    attempts = db.scalar(
        select(func.count()).select_from(LoginAttempt).where(LoginAttempt.address == address)
    )
    if attempts and attempts >= 30:
        raise HTTPException(429, "Too many sign-in attempts. Try again in 15 minutes.")
    db.add(LoginAttempt(address=address))
    db.commit()


def start_session(db: Session, account: Account, response: Response, request: Request):
    old = token_hash(request.cookies.get(COOKIE, ""))
    db.execute(
        delete(LoginSession).where((LoginSession.token_hash == old) | (LoginSession.expires_at < now()))
    )
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    db.add(
        LoginSession(
            token_hash=token_hash(token),
            account_id=account.id,
            csrf=csrf,
            expires_at=now() + timedelta(hours=8),
        )
    )
    response.set_cookie(
        COOKIE,
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
        max_age=8 * 3600,
        path="/api",
    )
    return {"account": public_account(account), "csrf": csrf}


@router.post("/register", status_code=201)
def register(payload: Registration, request: Request, response: Response, db: DB):
    throttle(request, db)
    account = Account(
        email=payload.email, name=payload.name, password_hash=password_hash(payload.password), role="user"
    )
    db.add(account)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Unable to create account with this email. Try signing in.") from None
    return start_session(db, account, response, request)


@router.post("/login")
def login(payload: Credentials, request: Request, response: Response, db: DB):
    throttle(request, db)
    account = db.scalar(select(Account).where(Account.email == payload.email))
    stored = account.password_hash if account else f"scrypt${'00' * 16}${'00' * 64}"
    candidate = password_hash(payload.password, stored.split("$")[1])
    if not account or not secrets.compare_digest(candidate, stored):
        raise HTTPException(401, "Email or password is incorrect")
    return start_session(db, account, response, request)


@router.get("/session")
def session_info(request: Request, account: User):
    return {"account": public_account(account), "csrf": request.state.session.csrf}


@router.post("/logout")
def logout(request: Request, response: Response, db: DB, account: User):
    db.delete(request.state.session)
    response.delete_cookie(COOKIE, path="/api")
    return {"signed_out": True}
