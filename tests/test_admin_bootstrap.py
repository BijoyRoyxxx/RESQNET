from pydantic import SecretStr
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from backend.admin_bootstrap import bootstrap_admin
from backend.auth import password_hash
from backend.config import settings
from backend.db import Account, Base


def test_bootstrap_creates_admin_once_without_storing_plaintext(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bootstrap_admin_email", "resqnet@gmail.com")
    monkeypatch.setattr(settings, "bootstrap_admin_password", SecretStr("different-test-secret"))
    engine = create_engine(f"sqlite:///{tmp_path / 'bootstrap.db'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)

    assert bootstrap_admin(sessions) is True
    assert bootstrap_admin(sessions) is False
    with sessions() as db:
        account = db.scalar(select(Account).where(Account.email == "resqnet@gmail.com"))
        assert account.role == "admin"
        assert account.password_hash.startswith("scrypt$")
        assert account.password_hash != "different-test-secret"


def test_bootstrap_promotes_existing_user_only_with_matching_password(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bootstrap_admin_email", "resqnet@gmail.com")
    monkeypatch.setattr(settings, "bootstrap_admin_password", SecretStr("correct-test-secret"))
    engine = create_engine(f"sqlite:///{tmp_path / 'existing.db'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add(
            Account(
                email="resqnet@gmail.com",
                name="RESQNET Administrator",
                password_hash=password_hash("correct-test-secret"),
                role="user",
            )
        )
        db.commit()

    assert bootstrap_admin(sessions) is True
    with sessions() as db:
        account = db.scalar(select(Account).where(Account.email == "resqnet@gmail.com"))
        assert account.role == "admin"


def test_bootstrap_does_not_promote_user_with_another_password(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bootstrap_admin_email", "resqnet@gmail.com")
    monkeypatch.setattr(settings, "bootstrap_admin_password", SecretStr("wrong-test-secret"))
    engine = create_engine(f"sqlite:///{tmp_path / 'mismatch.db'}")
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add(
            Account(
                email="resqnet@gmail.com",
                name="RESQNET Administrator",
                password_hash=password_hash("actual-user-password"),
                role="user",
            )
        )
        db.commit()

    assert bootstrap_admin(sessions) is False
    with sessions() as db:
        account = db.scalar(select(Account).where(Account.email == "resqnet@gmail.com"))
        assert account.role == "user"


def test_bootstrap_ignores_empty_configuration(monkeypatch):
    monkeypatch.setattr(settings, "bootstrap_admin_email", "")
    monkeypatch.setattr(settings, "bootstrap_admin_password", SecretStr(""))

    assert bootstrap_admin() is False
