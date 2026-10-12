from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from backend.db import ReportCase, make_engine
from backend.departments import department_for_category
from backend.migrations import upgrade_department_routing


def add_report(client, category, text):
    response = client.post(
        "/api/reports",
        json={"text": text, "category": category, "location_text": "Barasat station"},
    )
    assert response.status_code == 201
    return response.json()


def issue_account(client, department, email):
    response = client.post(
        "/api/admin/department-accounts",
        json={
            "name": f"{department.title()} Desk",
            "email": email,
            "password": "Department desk password 2026",
            "department": department,
        },
    )
    assert response.status_code == 201
    return response.json()


def sign_in(client, email):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": "Department desk password 2026"}
    )
    assert response.status_code == 200
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    return response.json()["account"]


def test_category_routes_cover_specialist_desks_and_police_fallback():
    assert department_for_category("women_safety") == "women_safety"
    assert department_for_category("fire") == "fire"
    assert department_for_category("medical") == "health"
    assert department_for_category("crime") == "police"
    assert department_for_category("unknown") == "police"
    assert department_for_category(None) == "police"
    assert department_for_category("flood") == "disaster"
    assert department_for_category("infrastructure") == "municipal"


def test_department_reads_and_updates_only_its_assigned_cases(anonymous_client, client):
    fire = add_report(client, "fire", "A fire is burning near the market.")
    medical = add_report(client, "medical", "An injured person needs medical help.")
    issue_account(client, "fire", "fire-desk@test.local")
    account = sign_in(anonymous_client, "fire-desk@test.local")

    assert account["role"] == "department"
    assert account["department"] == "fire"
    cases = anonymous_client.get("/api/department/cases")
    assert cases.status_code == 200
    assert [case["report"]["id"] for case in cases.json()] == [fire["id"]]

    updated = anonymous_client.patch(
        f"/api/department/cases/{fire['id']}",
        json={
            "version": 1,
            "status": "acknowledged",
            "urgency": None,
            "body": "Fire desk has acknowledged this report and dispatched a review.",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "acknowledged"

    solved = anonymous_client.patch(
        f"/api/department/cases/{fire['id']}",
        json={
            "version": updated.json()["version"],
            "status": "resolved",
            "urgency": None,
            "body": "Fire crew confirmed the area is safe and closed the response.",
        },
    )
    assert solved.status_code == 200
    assert solved.json()["status"] == "resolved"
    assert solved.json()["messages"][-1]["body"].startswith("Fire crew confirmed")

    assert anonymous_client.get(f"/api/reports/{medical['id']}").status_code == 404
    denied = anonymous_client.patch(
        f"/api/department/cases/{medical['id']}",
        json={"version": 1, "status": "acknowledged", "body": "Not assigned to this desk"},
    )
    assert denied.status_code == 404
    assert anonymous_client.get("/api/admin/cases").status_code == 403
    assert anonymous_client.post(
        "/api/admin/department-accounts",
        json={"name": "Other desk", "email": "other@test.local", "password": "Department desk password 2026", "department": "police"},
    ).status_code == 403


def test_department_can_use_nearby_lookup_without_reading_other_cases(anonymous_client, client, monkeypatch):
    issue_account(client, "fire", "fire-nearby@test.local")
    sign_in(anonymous_client, "fire-nearby@test.local")
    monkeypatch.setattr(
        "backend.main.search_services",
        lambda db, payload: {"service": payload.service, "facilities": []},
    )

    response = anonymous_client.post(
        "/api/services/nearby",
        json={"latitude": 22.72, "longitude": 88.48, "service": "fire"},
    )

    assert response.status_code == 200
    assert response.json() == {"service": "fire", "facilities": []}
    assert anonymous_client.get("/api/admin/cases").status_code == 403


def test_womens_safety_and_uncategorized_reports_route_to_their_desks(client):
    women = client.post(
        "/api/reports",
        json={"text": "A woman reported harassment near the station."},
    )
    assert women.status_code == 201
    women = women.json()
    unknown = add_report(client, "unknown", "Something unusual was reported near the station.")

    cases = {case["report"]["id"]: case for case in client.get("/api/admin/cases").json()}
    assert women["extraction"]["incident_type"] == "women_safety"
    assert cases[women["id"]]["department"] == "women_safety"
    assert cases[unknown["id"]]["department"] == "police"


def test_startup_migration_adds_routing_to_existing_database(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'previous-schema.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE accounts (id VARCHAR(36) PRIMARY KEY, email VARCHAR(254), name VARCHAR(80), "
            "password_hash VARCHAR(200), role VARCHAR(10))"
        )
        connection.exec_driver_sql(
            "CREATE TABLE reports (id VARCHAR(36) PRIMARY KEY, text TEXT, language VARCHAR(8), "
            "location_text VARCHAR(200), latitude FLOAT, longitude FLOAT, occurred_at DATETIME, "
            "people_affected INTEGER, requested_assistance JSON, synthetic BOOLEAN, "
            "review_status VARCHAR(30), idempotency_key VARCHAR(100), payload_hash VARCHAR(64), "
            "created_at DATETIME, updated_at DATETIME)"
        )
        connection.exec_driver_sql(
            "CREATE TABLE extractions (id VARCHAR(36) PRIMARY KEY, report_id VARCHAR(36), "
            "result JSON, engine VARCHAR(60), latency_ms FLOAT, created_at DATETIME, updated_at DATETIME)"
        )
        connection.exec_driver_sql(
            "CREATE TABLE report_cases (id VARCHAR(36) PRIMARY KEY, report_id VARCHAR(36), "
            "account_id VARCHAR(36), category VARCHAR(30), immediate_danger BOOLEAN, status VARCHAR(30), "
            "urgency_override VARCHAR(10), assigned_to VARCHAR(36), version INTEGER, "
            "created_at DATETIME, updated_at DATETIME)"
        )
        connection.exec_driver_sql(
            "INSERT INTO reports (id, text, language, requested_assistance, synthetic, review_status, payload_hash) "
            "VALUES ('report-legacy', 'A fire near the market', 'en', '[]', 0, 'pending', 'hash')"
        )
        connection.exec_driver_sql(
            "INSERT INTO extractions (id, report_id, result, engine, latency_ms) "
            "VALUES ('extract-legacy', 'report-legacy', '{\"incident_type\": \"fire\"}', 'rules', 1)"
        )
        connection.exec_driver_sql(
            "INSERT INTO report_cases (id, report_id, immediate_danger, status, version) "
            "VALUES ('case-legacy', 'report-legacy', 0, 'submitted', 1)"
        )

    upgrade_department_routing(engine)
    columns = {column["name"] for column in inspect(engine).get_columns("accounts")}
    assert "department" in columns
    with Session(engine) as db:
        case = db.scalar(select(ReportCase).where(ReportCase.report_id == "report-legacy"))
        assert case is not None
        assert case.department == "fire"

    upgrade_department_routing(engine)
    engine.dispose()
