"""Pin direct dependencies to the versions verified in the active environment."""

from importlib.metadata import version
from pathlib import Path

root = Path(__file__).resolve().parents[1]
packages = [
    "fastapi",
    "starlette",
    "uvicorn",
    "sqlalchemy",
    "pydantic",
    "pydantic-settings",
    "python-multipart",
    "httpx",
    "rapidfuzz",
    "pillow",
    "pytest",
    "ruff",
    "mypy",
    "pip-audit",
]
(root / "backend/requirements.txt").write_text(
    "".join(f"{p}=={version(p)}\n" for p in packages), encoding="utf-8"
)
(root / "backend/requirements-voice.txt").write_text(
    f"-r requirements.txt\nfaster-whisper=={version('faster-whisper')}\nav=={version('av')}\n",
    encoding="utf-8",
)
