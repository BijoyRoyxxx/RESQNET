import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from backend.auth import password_hash
from backend.config import settings
from backend.db import Account, Base, get_db, make_engine
from backend.main import app


@pytest.fixture(scope="session")
def admin_password_hash():
    return password_hash("Test admin password 2026")


@pytest.fixture
def anonymous_client(tmp_path, monkeypatch, admin_password_hash):
    monkeypatch.setattr(settings, "ai_mode", "rules")
    monkeypatch.setattr(settings, "media_dir", str(tmp_path / "media"))
    monkeypatch.setattr(settings, "voice_enabled", False)
    test_engine = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(test_engine)
    factory = sessionmaker(bind=test_engine, expire_on_commit=False)
    with factory() as db:
        db.add(
            Account(
                email="admin@test.local", name="Test Admin", password_hash=admin_password_hash, role="admin"
            )
        )
        db.commit()

    def db_override():
        with factory() as db:
            try:
                yield db
                db.commit()
            except Exception:
                db.rollback()
                raise

    app.dependency_overrides[get_db] = db_override
    with TestClient(app) as test_client:
        test_client.test_engine = test_engine
        yield test_client
    app.dependency_overrides.clear()
    test_engine.dispose()


@pytest.fixture
def client(anonymous_client):
    response = anonymous_client.post(
        "/api/auth/login", json={"email": "admin@test.local", "password": "Test admin password 2026"}
    )
    assert response.status_code == 200
    anonymous_client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return anonymous_client


@pytest.fixture
def payload():
    return {
        "text": "Flooding near Barasat. 2 people trapped. Water rising. Rescue needed.",
        "location_text": "Barasat",
        "latitude": 22.7229,
        "longitude": 88.4806,
        "occurred_at": "2026-10-08T08:00:00+05:30",
        "synthetic": True,
    }
