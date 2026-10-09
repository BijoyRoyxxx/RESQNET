import argparse
import json
from pathlib import Path

from sqlalchemy import select

from backend.config import settings
from backend.db import Base, Incident, Match, SessionLocal, engine
from backend.schemas import ReportInput
from backend.service import approve_match, audit, create_report

ROOT = Path(__file__).resolve().parents[1]


def seed(reset: bool = False, blank: bool = False):
    settings.ai_mode = "rules"
    if reset:
        # Reset only the explicitly configured application database, never arbitrary files.
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    if blank:
        print("Empty demo database ready. Uploaded files were retained; use the cleanup command if needed.")
        return
    with SessionLocal() as db:
        if db.scalar(select(Incident).limit(1)):
            raise SystemExit("Database contains incidents. Use --reset to replace demo records explicitly.")
        for item in json.loads((ROOT / "data" / "reports.json").read_text(encoding="utf-8")):
            source_id = item.pop("source_id")
            report, _ = create_report(db, ReportInput(**item), source_id)
            # Scripted operator rehearsal: approvals use predictions, never expected-label files.
            suggestions = db.scalars(
                select(Match)
                .where(Match.report_id == report.id, Match.status == "pending")
                .order_by(Match.score.desc())
            ).all()
            if suggestions:
                approve_match(
                    db,
                    suggestions[0],
                    "Synthetic demo rehearsal: scripted operator accepted the highest-scoring candidate. Not a real human review.",
                )
            db.flush()
        audit(db, "demo_seeded", "demo", {"mode": "deterministic", "scripted_reviews": True, "reports": 30})
        db.commit()
        total = len(db.scalars(select(Incident).where(Incident.merged_into.is_(None))).all())
        print(
            f"Loaded 30 synthetic reports, {total} incident records. Extraction: deterministic. Seed approvals: scripted demo actions."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument(
        "--blank", action="store_true", help="Create an empty database for the three-report rehearsal"
    )
    args = parser.parse_args()
    if args.blank and not args.reset:
        parser.error("--blank requires --reset")
    seed(args.reset, args.blank)
