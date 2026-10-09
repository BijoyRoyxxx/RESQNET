import io
import wave

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.db import Report, Review


def post(client, payload):
    response = client.post("/api/reports", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize(
    "change",
    [
        {"text": "short"},
        {"latitude": 92},
        {"longitude": None},
        {"people_affected": -2},
        {"language": "xx"},
        {"occurred_at": "2026-10-08T08:00:00"},
        {"unexpected": "field"},
    ],
)
def test_validation(client, payload, change):
    response = client.post("/api/reports", json={**payload, **change})
    assert response.status_code == 422
    assert "error" in response.json()
    assert client.get("/api/reports").json() == []


def test_persistence_and_idempotency(client, payload):
    result = client.post("/api/reports", json=payload, headers={"Idempotency-Key": "first"})
    assert result.status_code == 201
    repeat = client.post("/api/reports", json=payload, headers={"Idempotency-Key": "first"})
    assert repeat.status_code == 200
    assert result.json()["id"] == repeat.json()["id"]
    # A new SQLAlchemy session reads the file-backed record after the request transaction is closed.
    client.test_engine.dispose()
    with Session(client.test_engine) as db:
        assert db.scalar(select(Report)).text == payload["text"]
    conflict = client.post(
        "/api/reports",
        json={**payload, "text": "Different flood report"},
        headers={"Idempotency-Key": "first"},
    )
    assert conflict.status_code == 409
    assert len(client.get("/api/reports").json()) == 1


def test_match_approval_separation_and_audit(client, payload):
    first, second = post(client, payload), post(client, payload)
    assert len(client.get("/api/incidents").json()) == 2
    matches = client.get("/api/matches").json()
    assert len(matches) == 1
    match = matches[0]
    assert match["factors"]["geographic"] == 1
    approved = client.post(
        f"/api/matches/{match['id']}/approve", json={"reason": "Same place and observation time"}
    )
    assert approved.status_code == 200
    assert len(client.get("/api/incidents").json()) == 1
    detail = client.get(f"/api/incidents/{first['incident_id']}/evidence").json()
    assert detail["report_count"] == 2
    assert detail["reports"][1]["text"] == payload["text"]
    assert client.post(f"/api/matches/{match['id']}/approve", json={"reason": "Replay"}).status_code == 409
    separated = client.post(
        f"/api/reports/{second['id']}/separate", json={"reason": "Different building after verification"}
    )
    assert separated.status_code == 200
    assert len(client.get("/api/incidents").json()) == 2
    with Session(client.test_engine) as db:
        actions = list(db.scalars(select(Review.action)))
        assert actions == ["match_approved", "report_separated"]


def test_rejection_keeps_incidents_separate(client, payload):
    post(client, payload)
    post(client, payload)
    match = client.get("/api/matches").json()[0]
    assert (
        client.post(f"/api/matches/{match['id']}/reject", json={"reason": "Different site"}).status_code
        == 200
    )
    assert client.get("/api/matches").json() == []
    assert len(client.get("/api/incidents").json()) == 2
    assert (
        client.post(f"/api/matches/{match['id']}/approve", json={"reason": "Cannot replay"}).status_code
        == 409
    )


def test_correction_merge_verification(client, payload):
    first = post(client, payload)
    second = post(client, {**payload, "latitude": 23.1})
    correction = client.patch(
        f"/api/incidents/{first['incident_id']}",
        json={
            "status": "verified",
            "location_text": "Corrected location",
            "reason": "Operator checked source",
        },
    )
    assert correction.status_code == 200
    assert client.get(f"/api/reports/{first['id']}").json()["location_text"] == "Barasat"
    assert (
        client.patch(
            f"/api/incidents/{first['incident_id']}", json={"latitude": None, "reason": "Bad pair"}
        ).status_code
        == 422
    )
    merged = client.post(
        f"/api/incidents/{second['incident_id']}/merge",
        json={"target_id": first["incident_id"], "reason": "Corrected duplicate"},
    )
    assert merged.status_code == 200
    assert merged.json()["report_count"] == 2
    assert (
        client.post(
            f"/api/incidents/{first['incident_id']}/merge",
            json={"target_id": first["incident_id"], "reason": "Self merge"},
        ).status_code
        == 409
    )
    result = client.post(
        f"/api/reports/{first['id']}/verification",
        json={"status": "needs_verification", "reason": "Location uncertain"},
    )
    assert result.json()["review_status"] == "needs_verification"
    assert client.get("/api/analytics/summary").json()["unique_incidents"] == 1


def test_missing_coordinates_not_matched_as_perfect(client, payload):
    post(client, {**payload, "latitude": None, "longitude": None, "occurred_at": None})
    post(client, {**payload, "latitude": None, "longitude": None, "occurred_at": None})
    assert client.get("/api/matches").json() == []
    incident = client.get("/api/incidents").json()[0]
    assert any("missing" in u for u in incident["priority"]["uncertainties"])


def test_image_validation_metadata_and_link(client, payload):
    raw = io.BytesIO()
    image = Image.new("RGB", (30, 30), "blue")
    exif = Image.Exif()
    exif[270] = "Private metadata"
    image.save(raw, "JPEG", exif=exif)
    response = client.post("/api/media", files={"file": ("../../danger.jpg", raw.getvalue(), "image/jpeg")})
    assert response.status_code == 201
    media = response.json()
    downloaded = client.get(media["url"])
    assert downloaded.headers["x-content-type-options"] == "nosniff"
    assert len(Image.open(io.BytesIO(downloaded.content)).getexif()) == 0
    report = post(client, {**payload, "media_ids": [media["id"]]})
    assert report["media"][0]["id"] == media["id"]
    assert client.post("/api/reports", json={**payload, "media_ids": [media["id"]]}).status_code == 409


def test_response_referrer_policy_allows_map_provider_origin(client):
    response = client.get("/api/health")
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


@pytest.mark.parametrize(
    "name,content,mime,code",
    [
        ("x.jpg", b"not an image", "image/jpeg", 415),
        ("x.html", b"<script>alert(1)</script>", "text/html", 415),
        ("x.wav", b"bogus", "audio/wav", 415),
        ("x.png", b"x" * (10 * 1024 * 1024 + 1), "image/png", 413),
    ],
    ids=["invalid-image", "html", "invalid-audio", "oversize"],
)
def test_reject_bad_uploads(client, name, content, mime, code):
    assert client.post("/api/media", files={"file": (name, content, mime)}).status_code == code


def test_mismatched_mime(client):
    raw = io.BytesIO()
    Image.new("RGB", (20, 20)).save(raw, "PNG")
    assert (
        client.post("/api/media", files={"file": ("x.jpg", raw.getvalue(), "image/jpeg")}).status_code == 415
    )


def test_audio_disabled_honest_error(client, payload):
    pytest.importorskip("av")
    raw = io.BytesIO()
    with wave.open(raw, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(b"\0\0" * 16000)
    media = client.post("/api/media", files={"file": ("test.wav", raw.getvalue(), "audio/wav")})
    assert media.status_code == 201
    result = client.post(f"/api/media/{media.json()['id']}/transcribe")
    assert result.status_code == 503
    assert "disabled" in result.json()["error"]["message"]
    report = post(client, {**payload, "media_ids": [media.json()["id"]]})
    assert client.post(f"/api/reports/{report['id']}/transcribe").status_code == 503


def test_health_analytics_and_unknown_id(client, payload, monkeypatch):
    import httpx

    monkeypatch.setattr(
        "backend.main.httpx.get",
        lambda *a, **k: httpx.Response(
            200, json={"models": []}, request=httpx.Request("GET", "http://local")
        ),
    )
    assert client.get("/api/health").json()["database"] == "connected"
    assert client.get("/api/reports/no-such-id").status_code == 404
    post(client, payload)
    summary = client.get("/api/analytics/summary").json()
    assert summary["total_reports"] == summary["high_priority"] == summary["synthetic_reports"] == 1
    assert summary["engines"] == {"deterministic-rules": 1}


def test_cross_origin_write_denied(client, payload):
    assert (
        client.post("/api/reports", json=payload, headers={"Origin": "https://attacker.invalid"}).status_code
        == 403
    )
    assert client.get("/api/reports").json() == []


def test_transaction_rolls_back_failed_request(client, payload):
    assert client.post("/api/reports", json={**payload, "media_ids": ["missing"]}).status_code == 404
    assert client.get("/api/reports").json() == []
