"""Exercise the running API and optional local speech inference without fabricating results."""

import json
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8000/api"


def run():
    with httpx.Client(timeout=180) as client:
        health = client.get(f"{BASE}/health")
        health.raise_for_status()
        output = {"health": health.json(), "media": []}
        for filename, mime in [("demo-en.wav", "audio/wav"), ("silence.wav", "audio/wav")]:
            path = ROOT / "data" / filename
            if not path.exists():
                continue
            with path.open("rb") as file:
                uploaded = client.post(f"{BASE}/media", files={"file": (filename, file, mime)})
            uploaded.raise_for_status()
            result = client.post(f"{BASE}/media/{uploaded.json()['id']}/transcribe?language=en")
            output["media"].append(
                {"file": filename, "status": result.status_code, "response": result.json()}
            )
        (ROOT / "runtime/live-smoke.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    run()
