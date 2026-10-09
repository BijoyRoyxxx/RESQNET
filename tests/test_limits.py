from fastapi.testclient import TestClient

from backend.main import app


def test_chunked_request_limit():
    def chunks():
        for _ in range(12):
            yield b"x" * 1024 * 1024

    with TestClient(app) as client:
        result = client.post("/api/reports", content=chunks(), headers={"Content-Type": "application/json"})
    assert result.status_code == 413


def test_oversize_content_length_rejected():
    with TestClient(app) as client:
        result = client.post("/api/reports", content=b"{}", headers={"Content-Length": str(20 * 1024 * 1024)})
    assert result.status_code == 413
