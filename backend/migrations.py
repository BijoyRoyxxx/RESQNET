from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from backend.db import Extraction, Report, ReportCase
from backend.departments import department_for_category


def upgrade_department_routing(engine: Engine) -> None:
    """Add department routing to existing deployments and route their open reports."""
    with engine.begin() as connection:
        columns = {item["name"] for item in inspect(connection).get_columns("accounts")}
        if "department" not in columns:
            connection.execute(text("ALTER TABLE accounts ADD COLUMN department VARCHAR(30)"))
        if "official_id" not in columns:
            connection.execute(text("ALTER TABLE accounts ADD COLUMN official_id VARCHAR(100)"))
        if "verification_media_id" not in columns:
            connection.execute(
                text("ALTER TABLE accounts ADD COLUMN verification_media_id VARCHAR(36) REFERENCES media(id)")
            )
        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_official_id ON accounts (official_id)")
        )

        columns = {item["name"] for item in inspect(connection).get_columns("report_cases")}
        if "department" not in columns:
            connection.execute(text("ALTER TABLE report_cases ADD COLUMN department VARCHAR(30)"))
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_report_cases_department ON report_cases (department)")
        )

    with Session(engine) as db:
        needs_routing = db.scalar(
            select(Report.id)
            .outerjoin(ReportCase, ReportCase.report_id == Report.id)
            .where(ReportCase.report_id.is_(None) | ReportCase.department.is_(None))
            .limit(1)
        )
        if needs_routing is None:
            return
        for report, extraction, case in db.execute(
            select(Report, Extraction, ReportCase)
            .outerjoin(Extraction, Extraction.report_id == Report.id)
            .outerjoin(ReportCase, ReportCase.report_id == Report.id)
        ):
            category = (case.category if case else None) or (
                extraction.result.get("incident_type") if extraction else None
            )
            department = department_for_category(category)
            if case is None:
                case = ReportCase(report_id=report.id, category=category, department=department)
                db.add(case)
            elif case.department != department:
                case.department = department
        db.commit()


def upgrade_nearby_sources(engine: Engine) -> None:
    """Record when a nearby result came from the bundled offline snapshot."""
    with engine.begin() as connection:
        if "service_searches" not in inspect(connection).get_table_names():
            return
        columns = {item["name"] for item in inspect(connection).get_columns("service_searches")}
        if "source" not in columns:
            connection.execute(
                text("ALTER TABLE service_searches ADD COLUMN source VARCHAR(40) NOT NULL DEFAULT 'overpass'")
            )
        if "source_updated_at" not in columns:
            connection.execute(text("ALTER TABLE service_searches ADD COLUMN source_updated_at VARCHAR(40)"))
