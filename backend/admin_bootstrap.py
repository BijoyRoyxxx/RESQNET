"""Provision the first administrator from deployment secrets, never source constants."""

import secrets
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.auth import Registration, password_hash
from backend.config import settings
from backend.db import Account, SessionLocal


def bootstrap_admin(session_factory: Callable[[], Session] = SessionLocal) -> bool:
    email = settings.bootstrap_admin_email.strip().lower()
    password = settings.bootstrap_admin_password.get_secret_value()
    if not email or not password:
        return False

    with session_factory() as db:
        account = db.scalar(select(Account).where(Account.email == email))
        if account and account.role == "admin":
            return False
        credentials = Registration(
            email=email,
            name=settings.bootstrap_admin_name,
            password=password,
        )
        if account:
            salt = account.password_hash.split("$")[1]
            candidate = password_hash(credentials.password, salt)
            if secrets.compare_digest(candidate, account.password_hash):
                account.role = "admin"
                db.commit()
                return True
            return False

        db.add(
            Account(
                email=credentials.email,
                name=credentials.name,
                password_hash=password_hash(credentials.password),
                role="admin",
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return False
    return True
