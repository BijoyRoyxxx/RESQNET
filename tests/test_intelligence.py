import json

import httpx
import pytest
from pydantic import ValidationError

from backend.config import settings
from backend.intelligence import extract, grounded_model_result, matching, priority, rules_extract
from backend.schemas import ExtractionData, ReportInput


@pytest.mark.parametrize(
    "text,language,category",
    [
        ("Flood reported. 2 people trapped.", "en", "flood"),
        ("বন্যায় 2 জন আটকে আছেন। উদ্ধার দরকার।", "bn", "flood"),
        ("आग लगी है। दमकल चाहिए।", "hi", "fire"),
        ("রাস্তা বন্ধ। গাছ পড়েছে।", "bn", "infrastructure"),
        ("चिकित्सा और एम्बुलेंस चाहिए।", "hi", "medical"),
    ],
)
def test_multilingual_rules(text, language, category):
    result = rules_extract(ReportInput(text=text))
    assert result.language == language
    assert result.incident_type == category
    assert all(span in text for span in result.evidence_spans)
    assert result.extraction_status == "fallback"


def test_unknowns_negations_and_conflicts():
    absent = rules_extract(ReportInput(text="Flood reported. Nobody trapped. No medical help needed."))
    present = rules_extract(ReportInput(text="Flood reported. 2 people trapped. Medical help needed."))
    unknown = rules_extract(ReportInput(text="Something happened nearby"))
    assert absent.people_trapped is False
    assert absent.medical_help_needed is False
    assert unknown.people_affected is None and unknown.people_trapped is None
    result = priority(
        [
            {"id": "a", "text": "Flood report", "extraction": absent.model_dump()},
            {"id": "b", "text": "Flood report", "extraction": present.model_dump()},
        ],
        False,
    )
    assert result["level"] == "high"
    assert any("Conflicting" in item for item in result["uncertainties"])
    assert any("independence" in item for item in result["uncertainties"])


def test_matching_weights_and_missing_values():
    report = {
        "latitude": 22.72,
        "longitude": 88.48,
        "incident_type": "flood",
        "text": "Flooding in Barasat",
        "occurred_at": "2026-10-08T08:00:00+05:30",
    }
    assert matching(report, report)["score"] == 1
    unknown = {**report, "latitude": None, "longitude": None, "occurred_at": None}
    result = matching(unknown, unknown)
    assert result["geographic"] == result["time"] == 0
    assert result["score"] == 0.5
    assert len(result["uncertainties"]) == 2
    far = {**report, "latitude": 24}
    assert matching(report, far)["score"] == 0.6


def test_schema_rejects_invalid_output():
    with pytest.raises(ValidationError):
        ExtractionData.model_validate({"incident_type": "alien", "people_affected": -1})


def test_excessive_source_count_is_unknown_instead_of_crashing():
    result = rules_extract(ReportInput(text="Flood. " + "9" * 5000 + " people affected."))
    assert result.people_affected is None


def test_model_grounding_prevents_invented_counts_and_locations():
    report = ReportInput(text="Flood reported near the station.")
    raw = rules_extract(report).model_dump()
    raw.update(people_affected=900, people_trapped=True, location_text="Invented location")
    grounded = grounded_model_result(json.dumps(raw), report)
    assert grounded.people_affected is None and grounded.people_trapped is None
    assert grounded.location_text is None
    raw["evidence_spans"] = ["Invented quotation"]
    with pytest.raises(ValueError):
        grounded_model_result(json.dumps(raw), report)


def test_malformed_ai_retries_and_labels_fallback(monkeypatch):
    monkeypatch.setattr(settings, "ai_mode", "auto")
    calls = []

    def malformed(*args, **kwargs):
        calls.append(kwargs["json"])
        return httpx.Response(
            200, json={"message": {"content": "not JSON"}}, request=httpx.Request("POST", "http://local")
        )

    monkeypatch.setattr("backend.intelligence.httpx.post", malformed)
    result, engine, latency = extract(ReportInput(text="Flood reported. 2 people trapped."))
    assert len(calls) == 2
    assert result.extraction_status == "fallback"
    assert engine == "deterministic-rules" and latency >= 0
    assert "source_report" in calls[0]["messages"][1]["content"]
    assert "untrusted" in calls[0]["messages"][0]["content"]


def test_service_unavailable_does_not_retry_forever(monkeypatch):
    monkeypatch.setattr(settings, "ai_mode", "auto")

    def unavailable(*args, **kwargs):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr("backend.intelligence.httpx.post", unavailable)
    result, engine, _ = extract(ReportInput(text="Medical help is requested"))
    assert engine == "deterministic-rules"
    assert any("unavailable" in item for item in result.uncertainties)
