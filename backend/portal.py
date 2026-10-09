from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update

from backend.auth import DB, User, owned_report, public_account
from backend.db import Account, CaseMessage, Report, ReportCase, now
from backend.intelligence import priority
from backend.schemas import Category
from backend.service import audit, report_dict, require

router = APIRouter(prefix="/api")
Urgency = Literal["critical", "high", "medium", "low"]
CaseStatus = Literal["submitted", "acknowledged", "in_progress", "resolved"]


def case_dict(db, report):
    source = report_dict(db, report)
    case = db.scalar(select(ReportCase).where(ReportCase.report_id == report.id))
    ranking = priority([source], report.latitude is not None)
    category = (case.category if case else None) or source["extraction"].get("incident_type", "unknown")
    urgency = ranking["level"]
    reasons = [reason["label"] for reason in ranking["reasons"]]
    if ranking["score"] >= 70 or (case and case.immediate_danger):
        urgency = "critical"
        reasons.append(
            "Immediate danger declared by reporter"
            if case and case.immediate_danger
            else "Multiple immediate-risk signals in this report"
        )
    elif category in {"fire", "medical"} and ranking["score"] > 0:
        urgency = "high"
    automatic = urgency
    if case and case.urgency_override:
        urgency = case.urgency_override
        reasons.append("Priority set by an administrator; see case updates")
    account = db.get(Account, case.account_id) if case and case.account_id else None
    assigned = db.get(Account, case.assigned_to) if case and case.assigned_to else None
    messages = []
    for message in db.scalars(
        select(CaseMessage)
        .where(CaseMessage.report_id == report.id)
        .order_by(CaseMessage.created_at, CaseMessage.id)
    ):
        author = require(db, Account, message.account_id)
        messages.append(
            {
                "id": message.id,
                "body": message.body,
                "changes": message.changes,
                "created_at": message.created_at,
                "author": author.name,
                "role": author.role,
            }
        )
    return {
        "report": source,
        "category": category,
        "urgency": urgency,
        "automatic_urgency": automatic,
        "reasons": reasons or ["No urgent signals extracted. Review the original wording."],
        "status": case.status if case else "submitted",
        "version": case.version if case else 0,
        "immediate_danger": case.immediate_danger if case else False,
        "reporter": public_account(account) if account else None,
        "assigned_to": public_account(assigned) if assigned else None,
        "messages": messages,
    }


@router.get("/portal/reports")
def my_reports(db: DB, account: User):
    reports = db.scalars(
        select(Report)
        .join(ReportCase, ReportCase.report_id == Report.id)
        .where(ReportCase.account_id == account.id)
        .order_by(Report.created_at.desc())
    )
    return [case_dict(db, report) for report in reports]


@router.get("/admin/cases")
def cases(db: DB):
    results = [case_dict(db, report) for report in db.scalars(select(Report).order_by(Report.created_at))]
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    return sorted(
        results, key=lambda c: (c["status"] == "resolved", order[c["urgency"]], c["report"]["created_at"])
    )


@router.get("/admin/accounts")
def admins(db: DB):
    return [public_account(a) for a in db.scalars(select(Account).where(Account.role == "admin"))]


class MessageInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    body: str = Field(min_length=3, max_length=2000)


@router.post("/portal/reports/{report_id}/messages", status_code=201)
def message(report_id: str, payload: MessageInput, db: DB, account: User):
    owned_report(db, account, report_id)
    report = require(db, Report, report_id)
    db.add(CaseMessage(report_id=report_id, account_id=account.id, body=payload.body))
    audit(db, "case_message_added", report_id, {"author_role": account.role})
    db.flush()
    return case_dict(db, report)


class CasePatch(MessageInput):
    version: int = Field(ge=0)
    category: Category
    status: CaseStatus
    urgency: Urgency | None = None
    assigned_to: str | None = None


@router.patch("/admin/cases/{report_id}")
def update_case(report_id: str, payload: CasePatch, db: DB, account: User):
    report = require(db, Report, report_id)
    case = db.scalar(select(ReportCase).where(ReportCase.report_id == report_id))
    if payload.assigned_to:
        assignee = require(db, Account, payload.assigned_to)
        if assignee.role != "admin":
            raise HTTPException(422, "Assign the case to an administrator")
    if case is None:
        if payload.version != 0:
            raise HTTPException(409, "Case changed. Refresh before saving.")
        case = ReportCase(report_id=report_id, version=0)
        db.add(case)
        db.flush()
    changes = {
        "category": payload.category,
        "status": payload.status,
        "urgency_override": payload.urgency,
        "assigned_to": payload.assigned_to,
    }
    before = {field: getattr(case, field) for field in changes}
    changed = db.scalar(
        update(ReportCase)
        .where(ReportCase.id == case.id, ReportCase.version == payload.version)
        .values(**changes, version=payload.version + 1, updated_at=now())
        .returning(ReportCase.id)
    )
    if changed is None:
        raise HTTPException(409, "Another administrator updated this case. Refresh before saving.")
    db.add(
        CaseMessage(
            report_id=report_id,
            account_id=account.id,
            body=payload.body,
            changes={
                "status": payload.status,
                "category": payload.category,
                "priority": payload.urgency or "automatic",
            },
        )
    )
    audit(db, "case_updated", report_id, {"before": before, "after": changes, "reason": payload.body})
    db.flush()
    db.refresh(case)
    return case_dict(db, report)
