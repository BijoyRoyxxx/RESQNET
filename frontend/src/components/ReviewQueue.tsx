import { useState } from "react";
import { ArrowRight, Check, X, GitCompareArrows } from "lucide-react";
import { api, shortId } from "../api";
import type { Match, Report } from "../types";
import { Button } from "./ui/button";

export function ReviewQueue({
  matches,
  reports,
  onChange,
  onSelect,
}: {
  matches: Match[];
  reports: Report[];
  onChange: () => void;
  onSelect: (id: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function review(id: string, decision: string) {
    if ((notes[id] || "").trim().length < 3) {
      setError(
        "Add a short review note before approving or rejecting a match.",
      );
      return;
    }
    setBusy(id);
    setError("");
    try {
      await api(`/matches/${id}/${decision}`, {
        method: "POST",
        body: JSON.stringify({ reason: notes[id] }),
      });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="queue-layout">
      <div>
        <div className="notice">
          <GitCompareArrows size={18} />
          <span>
            Matching weights: location 40%, category 25%, text 25%, time 10%.
            Scores are prototype heuristics, not probabilities.
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {matches.length === 0 && (
          <div className="empty-state panel">
            <Check size={32} />
            <h2>No pending match suggestions</h2>
            <p>New reports will be checked against existing incidents.</p>
          </div>
        )}
        {matches.map((m) => (
          <article className="panel match-card" key={m.id}>
            <div className="section-heading">
              <span className="eyebrow">
                POSSIBLE DUPLICATE / {shortId(m.id)}
              </span>
              <span className="match-score">
                {Math.round(m.score * 100)}
                <small> / 100</small>
              </span>
            </div>
            <div className="match-comparison">
              <div>
                <span className="eyebrow muted">
                  INCOMING REPORT · {m.report.language.toUpperCase()}
                </span>
                <p lang={m.report.language}>{m.report.text}</p>
                <span className="mono muted">
                  {shortId(m.report_id)} {m.report.synthetic && "· SYNTHETIC"}
                </span>
              </div>
              <ArrowRight size={20} />
              <div>
                <span className="eyebrow muted">SUGGESTED INCIDENT</span>
                <button
                  className="text-button"
                  onClick={() => onSelect(m.incident_id)}
                >
                  {m.incident.location_text || "Unknown location"} ↗
                </button>
                <p>{m.incident.summary}</p>
                <span className="mono muted">
                  {shortId(m.incident_id)} · {m.incident.report_count} report(s)
                </span>
              </div>
            </div>
            <div className="factor-grid">
              {(["geographic", "category", "text", "time"] as const).map(
                (f, n) => (
                  <div key={f}>
                    <span>
                      {f === "geographic" ? "Location" : f}
                      <b>{Math.round(m.factors[f] * 100)}%</b>
                    </span>
                    <div className="track">
                      <i style={{ width: `${m.factors[f] * 100}%` }} />
                    </div>
                    <small>{[40, 25, 25, 10][n]}% weight</small>
                  </div>
                ),
              )}
            </div>
            <p className="muted">
              {m.factors.distance_km === null
                ? "No coordinates"
                : `${m.factors.distance_km} km apart`}{" "}
              ·{" "}
              {m.factors.hours_apart === null
                ? "Observation time unknown"
                : `${m.factors.hours_apart} hours apart`}
            </p>
            {m.factors.uncertainties.map((u) => (
              <p className="uncertainty" key={u}>
                {u}
              </p>
            ))}
            <label className="sr-only" htmlFor={`note-${m.id}`}>
              Review note for {shortId(m.id)}
            </label>
            <input
              id={`note-${m.id}`}
              placeholder="What evidence supports your decision?"
              value={notes[m.id] || ""}
              onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })}
              maxLength={1000}
            />
            <div className="match-actions">
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => void review(m.id, "reject")}
              >
                <X size={15} />
                Reject match
              </Button>
              <Button
                disabled={!!busy}
                onClick={() => void review(m.id, "approve")}
              >
                <Check size={15} />
                {busy === m.id ? "Saving…" : "Approve & link report"}
              </Button>
            </div>
          </article>
        ))}
      </div>
      <aside className="panel queue-aside">
        <div className="panel-header">
          <h3>Unreviewed sources</h3>
          <span className="count">
            {reports.filter((r) => r.review_status !== "verified").length}
          </span>
        </div>
        {reports
          .filter((r) => r.review_status !== "verified")
          .slice(0, 20)
          .map((r) => (
            <button
              className="source-mini"
              key={r.id}
              onClick={() => onSelect(r.incident_id)}
            >
              <span className="mono">
                {shortId(r.id)} <small>{r.language.toUpperCase()}</small>
              </span>
              <strong>{r.location_text || "Unknown location"}</strong>
              <span>{r.text}</span>
            </button>
          ))}
      </aside>
    </div>
  );
}
