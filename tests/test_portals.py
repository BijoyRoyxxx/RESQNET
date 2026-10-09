from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import Account, LoginSession, now

PASSWORD = "Private report passphrase 2026"


def test_deleted_message_author_keeps_cases_readable_without_granting_ownership(client):
    import sqlite3

    from backend.db import CaseMessage

    report = client.post("/api/reports", json={"text": "Fire at station"}).json()
    with Session(client.test_engine) as db:
        admin = db.scalar(select(Account).where(Account.role == "admin"))
        db.add(CaseMessage(report_id=report["id"], account_id=admin.id, body="Existing explanation"))
        db.commit()
    # Reproduce a dropped parent table without inventing a replacement identity.
    with sqlite3.connect(client.test_engine.url.database) as connection:
        connection.execute("UPDATE case_messages SET account_id='deleted-account'")
        connection.execute("UPDATE report_cases SET account_id='deleted-account'")
    response = client.get("/api/admin/cases")
    assert response.status_code == 200
    case = response.json()[0]
    assert case["reporter"] is None
    assert case["messages"][0]["author"] == "Deleted account"
    assert case["messages"][0]["body"] == "Existing explanation"
    assert case["messages"][0]["role"] == "unknown"
    register(client)
    assert client.get("/api/portal/reports").json() == []
    assert client.get(f"/api/reports/{report['id']}").status_code == 404


def test_case_and_dashboard_query_counts_stay_constant(client):
    from sqlalchemy import event

    for _ in range(12):
        assert client.post("/api/reports", json={"text": "Medical help required"}).status_code == 201
    queries = []

    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            queries.append(statement)

    event.listen(client.test_engine, "before_cursor_execute", record)
    try:
        response = client.get("/api/admin/cases")
        assert response.status_code == 200
        assert len(response.json()) == 12
        assert len(queries) <= 9, len(queries)
        queries.clear()
        response = client.get("/api/dashboard")
        assert response.status_code == 200
        assert response.json()["summary"]["total_reports"] == 12
        assert len(response.json()["incidents"]) == 12
        assert len(queries) <= 12, len(queries)
    finally:
        event.remove(client.test_engine, "before_cursor_execute", record)


def register(client, email="reporter@test.local"):
    client.cookies.clear()
    response = client.post(
        "/api/auth/register", json={"email": email, "password": PASSWORD, "name": "Reporting Person"}
    )
    assert response.status_code == 201, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return response.json()


def login_admin(client):
    response = client.post(
        "/api/auth/login", json={"email": "admin@test.local", "password": "Test admin password 2026"}
    )
    assert response.status_code == 200
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return response.json()


def test_no_anonymous_data_access(anonymous_client):
    for path in [
        "/api/reports",
        "/api/incidents",
        "/api/matches",
        "/api/analytics/summary",
        "/api/admin/cases",
        "/api/portal/reports",
        "/api/media/missing",
    ]:
        assert anonymous_client.get(path).status_code == 401


def test_role_escalation_is_rejected_and_sessions_revoke(anonymous_client):
    client = anonymous_client
    bad = client.post(
        "/api/auth/register",
        json={"email": "hacker@test.local", "name": "Tester", "password": PASSWORD, "role": "admin"},
    )
    assert bad.status_code == 422
    session = register(client)
    assert session["account"]["role"] == "user"
    for path in ["/api/admin/cases", "/api/admin/accounts", "/api/incidents", "/api/matches", "/api/reports"]:
        assert client.get(path).status_code == 403
    token = client.cookies.get("resq_session")
    assert client.post("/api/auth/logout").status_code == 200
    client.cookies.set("resq_session", token)
    assert client.get("/api/auth/session").status_code == 401


def test_ownership_covers_reports_media_alerts_and_messages(anonymous_client):
    client = anonymous_client
    register(client)
    from io import BytesIO

    from PIL import Image

    image = BytesIO()
    Image.new("RGB", (2, 2)).save(image, format="PNG")
    media = client.post("/api/media", files={"file": ("proof.png", image.getvalue(), "image/png")}).json()
    created = client.post(
        "/api/reports", json={"text": "My car was stolen near the station", "media_ids": [media["id"]]}
    ).json()
    register(client, "other@test.local")
    assert client.get("/api/portal/reports").json() == []
    report_id = created["id"]
    for path in [
        f"/api/reports/{report_id}",
        f"/api/reports/{report_id}/alerts",
        f"/api/media/{media['id']}",
    ]:
        assert client.get(path).status_code == 404
    assert (
        client.post(
            f"/api/portal/reports/{report_id}/messages", json={"body": "Attempting access"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/reports/{report_id}/alerts", json={"search_id": "none", "facility_id": "none"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/reports",
            json={"text": "Trying to attach another person's evidence", "media_ids": [media["id"]]},
        ).status_code
        == 404
    )
    assert client.patch(f"/api/admin/cases/{report_id}", json={}).status_code == 403


def test_shared_case_lifecycle_priority_and_stale_edit(anonymous_client):
    client = anonymous_client
    register(client)
    normal = client.post(
        "/api/reports", json={"text": "A car theft was reported at the station", "category": "crime"}
    ).json()
    urgent = client.post(
        "/api/reports",
        json={
            "text": "Someone is in danger near the building",
            "category": "medical",
            "immediate_danger": True,
        },
    ).json()
    client.post(
        f"/api/portal/reports/{urgent['id']}/messages", json={"body": "We are waiting near the main gate."}
    )
    admin = login_admin(client)
    cases = client.get("/api/admin/cases").json()
    assert [c["report"]["id"] for c in cases] == [urgent["id"], normal["id"]]
    assert cases[0]["urgency"] == "critical"
    patch = {
        "version": 1,
        "category": "medical",
        "status": "in_progress",
        "urgency": "high",
        "assigned_to": admin["account"]["id"],
        "body": "Review started. Please confirm your exact location.",
    }
    response = client.patch(f"/api/admin/cases/{urgent['id']}", json=patch)
    assert response.status_code == 200, response.text
    assert response.json()["version"] == 2
    assert client.patch(f"/api/admin/cases/{urgent['id']}", json=patch).status_code == 409
    login = client.post("/api/auth/login", json={"email": "reporter@test.local", "password": PASSWORD}).json()
    client.headers["X-CSRF-Token"] = login["csrf"]
    case = next(c for c in client.get("/api/portal/reports").json() if c["report"]["id"] == urgent["id"])
    assert case["status"] == "in_progress"
    assert case["assigned_to"]["name"] == "Test Admin"
    assert case["messages"][-1]["body"] == patch["body"]
    assert case["messages"][-1]["role"] == "admin"
    assert case["category"] == "medical"


def test_csrf_credentials_and_cookie_security(anonymous_client):
    client = anonymous_client
    register(client)
    client.headers.pop("X-CSRF-Token")
    assert client.post("/api/reports", json={"text": "Private incident test"}).status_code == 403
    response = client.post("/api/auth/login", json={"email": "REPORTER@test.local", "password": PASSWORD})
    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/api" in cookie
    assert response.headers["cache-control"] == "no-store"
    wrong = client.post(
        "/api/auth/login", json={"email": "reporter@test.local", "password": "A wrong password 2026"}
    )
    assert wrong.status_code == 401
    with Session(client.test_engine) as db:
        user = db.scalar(select(Account).where(Account.email == "reporter@test.local"))
        assert user.password_hash.startswith("scrypt$") and PASSWORD not in user.password_hash
        session = db.scalar(select(LoginSession).where(LoginSession.account_id == user.id))
        assert session.token_hash != client.cookies.get("resq_session")
        session.expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/auth/session").status_code == 401


def test_idempotency_scoped_to_each_account(anonymous_client):
    client = anonymous_client
    register(client)
    payload = {"text": "Independent report of a vehicle theft", "category": "crime"}
    headers = {"Idempotency-Key": "same-browser-key"}
    first = client.post("/api/reports", json=payload, headers=headers)
    repeat = client.post("/api/reports", json=payload, headers=headers)
    assert repeat.status_code == 200 and first.json()["id"] == repeat.json()["id"]
    register(client, "separate@test.local")
    second = client.post("/api/reports", json=payload, headers=headers)
    assert second.status_code == 201 and first.json()["id"] != second.json()["id"]


def test_legacy_reports_stay_admin_only(client):
    report = client.post("/api/reports", json={"text": "Legacy private report at the station"}).json()
    with Session(client.test_engine) as db:
        from backend.db import ReportCase

        case = db.scalar(select(ReportCase).where(ReportCase.report_id == report["id"]))
        db.delete(case)
        db.commit()
    assert client.get("/api/admin/cases").json()[0]["reporter"] is None
    register(client)
    assert client.get("/api/portal/reports").json() == []
    assert client.get(f"/api/reports/{report['id']}").status_code == 404


def test_solved_case_requires_explanation_and_preserves_source_location(anonymous_client):
    client = anonymous_client
    register(client)
    report = client.post(
        "/api/reports",
        json={
            "text": "Medical assistance requested near the station",
            "category": "medical",
            "location_text": "Barasat station",
            "latitude": 22.7229123,
            "longitude": 88.4806123,
            "occurred_at": "2026-01-01T10:11:12+05:30",
        },
    ).json()
    login_admin(client)
    patch = {"version": 1, "category": "medical", "status": "resolved", "body": "   "}
    assert client.patch(f"/api/admin/cases/{report['id']}", json=patch).status_code == 422
    patch["body"] = "Patient reached the hospital; the reporter confirmed assistance."
    saved = client.patch(f"/api/admin/cases/{report['id']}", json=patch)
    assert saved.status_code == 200
    persisted = next(c for c in client.get("/api/admin/cases").json() if c["report"]["id"] == report["id"])
    assert persisted["status"] == "resolved"
    assert persisted["report"]["latitude"] == 22.7229123
    assert persisted["report"]["longitude"] == 88.4806123
    assert persisted["report"]["location_text"] == "Barasat station"
    assert persisted["report"]["occurred_at"].removesuffix("+00:00") == "2026-01-01T04:41:12"
    assert persisted["report"]["created_at"].removesuffix("+00:00") == report["created_at"].removesuffix(
        "+00:00"
    )
    assert persisted["messages"][-1]["body"] == patch["body"]
    login = client.post("/api/auth/login", json={"email": "reporter@test.local", "password": PASSWORD}).json()
    client.headers["X-CSRF-Token"] = login["csrf"]
    shared = client.get("/api/portal/reports").json()[0]
    assert shared["status"] == "resolved"
    assert shared["messages"][-1]["body"] == patch["body"]


def test_admin_can_clear_operational_data_without_losing_admin_access(client, payload):
    report = client.post("/api/reports", json=payload)
    assert report.status_code == 201
    response = client.request("DELETE", "/api/admin/data", json={"confirmation": "CLEAR RESQNET DATA"})
    assert response.status_code == 200, response.text
    assert response.json()["cleared"]["reports"] == 1
    assert client.get("/api/reports").json() == []
    assert client.get("/api/auth/session").json()["account"]["role"] == "admin"
