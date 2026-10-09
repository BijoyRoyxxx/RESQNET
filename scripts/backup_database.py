"""Consistent SQLite backup, including committed data in the WAL."""

import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.engine import make_url

from backend.config import settings


def main():
    url = make_url(settings.database_url)
    if url.drivername != "sqlite" or not url.database or url.database == ":memory:":
        raise SystemExit("This backup command requires a file-backed SQLite database.")
    source = Path(url.database).resolve()
    if not source.is_file():
        raise SystemExit("Database does not exist yet.")
    folder = source.parent / "backups"
    folder.mkdir(exist_ok=True)
    target = folder / f"resq-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}.db"
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original:
        with sqlite3.connect(target) as backup:
            original.backup(backup)
            if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise SystemExit("Backup integrity check failed")
    print(f"Database backup verified: {target}")


if __name__ == "__main__":
    main()
