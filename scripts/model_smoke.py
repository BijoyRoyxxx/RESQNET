import json
from pathlib import Path

from backend.intelligence import extract
from backend.schemas import ReportInput


def run():
    root = Path(__file__).resolve().parents[1]
    rows = json.loads((root / "data/reports.json").read_text(encoding="utf-8"))[:3]
    results = []
    for row in rows:
        source_id = row.pop("source_id")
        result, engine, elapsed = extract(ReportInput(**row))
        results.append(
            {
                "source_id": source_id,
                "engine": engine,
                "latency_ms": round(elapsed, 2),
                "extraction": result.model_dump(),
            }
        )
        print(json.dumps(results[-1], ensure_ascii=True), flush=True)
    (root / "runtime/model-smoke.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    run()
