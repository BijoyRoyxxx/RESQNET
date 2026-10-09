import argparse
import json
from itertools import combinations
from pathlib import Path
from statistics import mean

from backend.config import settings
from backend.intelligence import extract, matching
from backend.schemas import ReportInput

ROOT = Path(__file__).resolve().parents[1]


def evaluate(mode: str = "rules"):
    settings.ai_mode = mode
    reports = json.loads((ROOT / "data/reports.json").read_text(encoding="utf-8"))
    labels = json.loads((ROOT / "data/expected_labels.json").read_text(encoding="utf-8"))
    predictions, times, engines = {}, [], {}
    for source in reports:
        payload = {k: v for k, v in source.items() if k != "source_id"}
        result, engine, latency = extract(ReportInput(**payload))
        predictions[source["source_id"]] = result.incident_type
        times.append(latency)
        engines[engine] = engines.get(engine, 0) + 1
    tp = fp = fn = tn = 0
    false_positives = []
    false_negatives = []
    for a, b in combinations(reports, 2):
        expected = labels[a["source_id"]]["group"] == labels[b["source_id"]]["group"]
        score = matching(
            {**a, "incident_type": predictions[a["source_id"]]},
            {**b, "incident_type": predictions[b["source_id"]]},
        )["score"]
        predicted = score >= settings.match_threshold
        tp += int(predicted and expected)
        fp += int(predicted and not expected)
        fn += int(not predicted and expected)
        tn += int(not predicted and not expected)
        if predicted and not expected:
            false_positives.append([a["source_id"], b["source_id"], score])
        if not predicted and expected:
            false_negatives.append([a["source_id"], b["source_id"], score])
    metrics = {
        "dataset": "30 fictional reports, 10 labeled groups, 435 pairs",
        "requested_mode": mode,
        "engines_used": engines,
        "classification_accuracy": sum(predictions[k] == v["incident_type"] for k, v in labels.items())
        / len(labels),
        "duplicate_precision": tp / (tp + fp) if tp + fp else None,
        "duplicate_recall": tp / (tp + fn) if tp + fn else None,
        "true_positives": tp,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "true_negatives": tn,
        "mean_extraction_latency_ms": round(mean(times), 3),
        "max_extraction_latency_ms": round(max(times), 3),
        "threshold": settings.match_threshold,
        "limitation": "Small curated synthetic set. Not representative of field performance. Latency excludes API/database time.",
    }
    output = ROOT / "runtime" / f"evaluation-{mode}.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["rules", "auto", "ollama"], default="rules")
    evaluate(parser.parse_args().mode)
