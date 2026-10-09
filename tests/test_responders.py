from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select

from backend.config import settings
from backend.db import ResponderAlert, ServiceSearch, now
from backend.responders import facility_rows, provider_cooldown, recommended_service, safe_phone


@pytest.fixture(autouse=True)
def reset_provider_cooldown():
    provider_cooldown.clear()
    yield
    provider_cooldown.clear()


def test_lookup_uses_fallback_and_cools_down_failed_provider(client, monkeypatch):
    calls = []

    def post(url, **kwargs):
        calls.append(url)
        if url == settings.overpass_url:
            return httpx.Response(429, request=httpx.Request("POST", url))
        return httpx.Response(200, json={"elements": ELEMENTS}, request=httpx.Request("POST", url))

    monkeypatch.setattr("backend.responders.httpx.get", post)
    result = search(client)
    assert result["facilities"] and not result["stale"]
    assert calls == [settings.overpass_url, settings.overpass_fallback_urls[0]]
    client.post("/api/services/nearby", json={"latitude": 22.723, "longitude": 88.4806})
    assert calls.count(settings.overpass_url) == 1


def test_lookup_returns_labelled_stale_data_without_refreshing_timestamp(client, monkeypatch):
    from sqlalchemy.orm import Session

    mock_map(monkeypatch)
    first = search(client)
    with Session(client.test_engine) as db:
        cached = db.get(ServiceSearch, first["id"])
        cached.created_at = now() - timedelta(hours=1)
        db.commit()

    def offline(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr("backend.responders.httpx.get", offline)
    second = search(client)
    assert second["id"] == first["id"]
    assert second["cached"] is True and second["stale"] is True
    assert second["created_at"] != first["created_at"]


ELEMENTS = [
    {
        "type": "way",
        "id": 20,
        "center": {"lat": 22.74, "lon": 88.49},
        "tags": {"amenity": "police", "name": "Further test station"},
    },
    {
        "type": "node",
        "id": 10,
        "lat": 22.723,
        "lon": 88.481,
        "tags": {"amenity": "police", "name": "Nearest test station", "phone": "+91 333 444 5555"},
    },
]


@pytest.mark.parametrize(
    "text,service",
    [
        ("My car was stolen", "police"),
        ("গাড়ি চুরি হয়েছে", "police"),
        ("मेरी कार चोरी हो गई", "police"),
        ("Fire in a house", "fire"),
        ("Fire in a house. Medical help needed", "fire"),
        ("Flood water rising", "rescue"),
        ("Medical help needed", "medical"),
        ("No theft reported", "police"),
        ("I need assistance", "police"),
        ("No fire reported. Medical help needed", "medical"),
    ],
)
def test_need_routing(text, service):
    assert recommended_service(text)[0] == service


def test_selected_category_routes_to_correct_facility():
    assert recommended_service("Please send help", "fire")[0] == "fire"
    assert recommended_service("Please send help", "medical")[0] == "medical"
    assert recommended_service("Please send help", "unknown")[0] == "police"


def test_fire_and_medical_queries_use_specific_facility_types(client, monkeypatch):
    calls = mock_map(monkeypatch, [])
    for category, expected_tag in [("fire", '"fire_station"'), ("medical", '"hospital"')]:
        response = client.post(
            "/api/services/nearby", json={"latitude": 22, "longitude": 88, "category": category}
        )
        assert response.status_code == 200
        assert response.json()["service"] == category
        assert expected_tag in calls[-1][1]["params"]["data"]
        assert '"ambulance_station"' not in calls[-1][1]["params"]["data"]


def mock_map(monkeypatch, elements=None):
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(
            200,
            json={"elements": ELEMENTS if elements is None else elements},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("backend.responders.httpx.get", post)
    return calls


def search(client):
    response = client.post(
        "/api/services/nearby", json={"latitude": 22.7229, "longitude": 88.4806, "text": "My car was stolen"}
    )
    assert response.status_code == 200, response.text
    return response.json()


def prepare(client, synthetic=True):
    result = search(client)
    report = client.post(
        "/api/reports",
        json={
            "text": "My car was stolen near the railway station",
            "latitude": 22.7229,
            "longitude": 88.4806,
            "synthetic": synthetic,
        },
    ).json()
    assert report["extraction"]["incident_type"] == "crime"
    body = {"search_id": result["id"], "facility_id": result["facilities"][0]["id"]}
    response = client.post(f"/api/reports/{report['id']}/alerts", json=body)
    assert response.status_code == 201, response.text
    return response.json(), report, body


def test_lookup_sorts_caches_and_does_not_forward_report_text(client, monkeypatch):
    calls = mock_map(monkeypatch)
    first = search(client)
    assert first["service"] == "police"
    assert first["facilities"][0]["id"] == "node/10"
    assert first["facilities"][0]["distance_km"] < first["facilities"][1]["distance_km"]
    assert first["distance_method"] == "straight_line"
    assert "stolen" not in calls[0][1]["params"]["data"]
    assert "[timeout:8]" in calls[0][1]["params"]["data"]
    assert "[maxsize:" not in calls[0][1]["params"]["data"]
    assert "around:10000," in calls[0][1]["params"]["data"]
    assert calls[0][1]["timeout"] == 12
    assert search(client)["cached"] is True
    assert len(calls) == 1


def test_empty_and_failure_are_not_fake_stations(client, monkeypatch):
    calls = mock_map(monkeypatch, [])
    assert search(client)["facilities"] == []
    assert len(calls) == 1
    assert "around:10000," in calls[0][1]["params"]["data"]

    def offline(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr("backend.responders.httpx.get", offline)
    result = client.post("/api/services/nearby", json={"latitude": 23, "longitude": 88, "service": "rescue"})
    assert result.status_code == 503
    assert "No station was contacted" in result.json()["error"]["message"]


def test_input_validation_and_manual_override(client, monkeypatch):
    mock_map(monkeypatch)
    assert (
        client.post(
            "/api/services/nearby", json={"latitude": 91, "longitude": 88, "service": "police"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/services/nearby", json={"latitude": 22, "longitude": 88, "text": "unclear"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/services/nearby",
            json={"latitude": 22, "longitude": 88, "service": "medical", "text": "unclear"},
        ).status_code
        == 200
    )


def test_prepare_is_persistent_idempotent_and_never_sends(client, monkeypatch):
    calls = mock_map(monkeypatch)
    alert, report, body = prepare(client)
    assert alert["status"] == "prepared_not_sent"
    assert "DO NOT DISPATCH" in alert["message"]
    replay = client.post(f"/api/reports/{report['id']}/alerts", json=body).json()
    assert replay["id"] == alert["id"]
    assert len(client.get(f"/api/reports/{report['id']}/alerts").json()) == 1
    assert len(calls) == 1
    assert client.post(f"/api/alerts/{alert['id']}/send", json={"consent": True}).status_code == 409


def test_unconnected_cannot_send(client, monkeypatch):
    mock_map(monkeypatch)
    monkeypatch.setattr(settings, "responder_webhooks", {})
    alert, _, _ = prepare(client, synthetic=False)
    assert client.post(f"/api/alerts/{alert['id']}/send", json={"consent": True}).status_code == 503
    assert client.post(f"/api/alerts/{alert['id']}/send", json={"consent": False}).status_code == 422


@pytest.mark.parametrize(
    "outcome,status",
    [
        (202, "delivered_to_gateway"),
        (403, "rejected_by_gateway"),
        (500, "delivery_unknown"),
        (None, "delivery_unknown"),
    ],
)
def test_authorized_gateway_state_and_no_duplicate_send(client, monkeypatch, outcome, status):
    mock_map(monkeypatch)
    monkeypatch.setattr(settings, "responder_webhooks", {"node/10": "https://authorized.example.test/alerts"})
    alert, report, _ = prepare(client, synthetic=False)
    calls = []

    def gateway(url, **kwargs):
        calls.append(kwargs)
        if outcome is None:
            raise httpx.ReadTimeout("uncertain delivery")
        return httpx.Response(outcome, request=httpx.Request("POST", url))

    monkeypatch.setattr("backend.responders.httpx.post", gateway)
    delivered = client.post(f"/api/alerts/{alert['id']}/send", json={"consent": True})
    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["status"] == status
    assert calls[0]["headers"]["Idempotency-Key"] == alert["id"]
    assert client.post(f"/api/alerts/{alert['id']}/send", json={"consent": True}).status_code == 409
    assert len(calls) == 1
    assert client.get(f"/api/reports/{report['id']}/alerts").json()[0]["status"] == status


def test_stale_search_and_changed_location_rejected(client, monkeypatch):
    from sqlalchemy.orm import Session

    mock_map(monkeypatch)
    result = search(client)
    report = client.post(
        "/api/reports", json={"text": "My car was stolen", "latitude": 24, "longitude": 88, "synthetic": True}
    ).json()
    body = {"search_id": result["id"], "facility_id": "node/10"}
    assert client.post(f"/api/reports/{report['id']}/alerts", json=body).status_code == 409
    with Session(client.test_engine) as db:
        db.get(ServiceSearch, result["id"]).created_at = now() - timedelta(minutes=20)
        db.commit()
    assert client.post(f"/api/reports/{report['id']}/alerts", json=body).status_code == 409
    with Session(client.test_engine) as db:
        assert db.scalar(select(ResponderAlert)) is None


def test_facility_validation_and_phone_safety():
    assert safe_phone("javascript:alert(1)") is None
    assert safe_phone("+91 333-444-5555") == "+913334445555"
    assert facility_rows([{"type": "node", "id": 1, "lat": float("nan"), "lon": 88}], 22, 88, 25) == []
