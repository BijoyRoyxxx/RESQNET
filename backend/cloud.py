"""Serve the built frontend and API from one hosted origin."""

import json
import os
from pathlib import Path
from urllib.parse import urlparse

import uvicorn
from fastapi.staticfiles import StaticFiles


def create_app():
    origin = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
    if origin:
        parsed = urlparse(origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.path:
            raise ValueError("RENDER_EXTERNAL_URL must be an HTTPS origin")
        os.environ.setdefault("RESQ_ALLOWED_HOSTS", json.dumps([parsed.hostname, "localhost", "127.0.0.1"]))
        os.environ.setdefault("RESQ_CORS_ORIGINS", json.dumps([origin]))
    from backend.main import app

    frontend = Path(__file__).resolve().parents[1] / "frontend/dist"
    app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app


if __name__ == "__main__":
    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "10000")))
