import { useEffect, useRef, useState } from "react";
import { X, ArrowUpRight, GitMerge, Split, ShieldQuestion } from "lucide-react";
import { api, localTime, readable, shortId } from "../api";
import type { Incident } from "../types";
import { Button } from "./ui/button";
export function IncidentDetail({
  id,
  incidents,
  onClose,
  onChange,
}: {
  id: string;
  incidents: Incident[];
  onClose: () => void;
  onChange: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [incident, setIncident] = useState<Incident>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("evidence");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    api<Incident>(`/incidents/${id}/evidence`)
      .then((i) => {
        if (active) setIncident(i);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);
  async function action(path: string, body: object, method = "POST") {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: JSON.stringify(body) });
      if (path.endsWith("/merge")) {
        onChange();
        onClose();
        return;
      }
      setIncident(await api<Incident>(`/incidents/${id}/evidence`));
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="incident-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="incident-title"
    >
      <header className="dialog-header">
        <span className="eyebrow">INCIDENT DOSSIER / {shortId(id)}</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close incident"
        >
          <X size={22} />
        </button>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!incident ? (
        <p className="loading">Loading source evidence…</p>
      ) : (
        <>
          <div className="dossier-heading">
            <div>
              <span className={`badge ${incident.priority.level}`}>
                {incident.priority.level} review priority
              </span>
              <h2 id="incident-title">
                {incident.location_text || "Location unknown"}
              </h2>
              <p>
                {readable(incident.incident_type)} · {incident.report_count}{" "}
                linked reports · {readable(incident.status)}
              </p>
            </div>
            <span className="dossier-score">
              {incident.priority.score}
              <small>/ 100 heuristic</small>
            </span>
          </div>
          <div className="tabs">
            {["evidence", "review", "history"].map((t) => (
              <button
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
                key={t}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "evidence" && (
            <div className="dossier-body">
              <section className="priority-explanation">
                <h3>Why this review priority?</h3>
                {incident.priority.reasons.length ? (
                  incident.priority.reasons.map((r) => (
                    <div className="reason" key={r.label}>
                      <span>
                        {r.label}
                        <small>
                          Reports: {r.report_ids.map(shortId).join(", ")}
                        </small>
                      </span>
                      <b>+{r.points}</b>
                    </div>
                  ))
                ) : (
                  <p>
                    No urgency signals were detected. This does not establish
                    safety.
                  </p>
                )}
                {incident.priority.uncertainties.map((u) => (
                  <p className="uncertainty" key={u}>
                    <ShieldQuestion size={14} />
                    {u}
                  </p>
                ))}
              </section>
              <h3 className="eyebrow">SOURCE REPORTS</h3>
              {incident.reports?.map((r) => (
                <article className="source-report" key={r.id}>
                  <div className="source-top">
                    <span className="mono">
                      {shortId(r.id)} · {r.language.toUpperCase()}
                    </span>
                    <span className="muted">
                      {localTime(r.created_at)} {r.synthetic && "· SYNTHETIC"}
                    </span>
                  </div>
                  <blockquote lang={r.language}>{r.text}</blockquote>
                  <div className="source-engine">
                    <span className="dot" />
                    {r.engine} · {Math.round(r.latency_ms)} ms ·{" "}
                    {readable(r.review_status)}
                  </div>
                  <div className="facts">
                    <span>
                      Category <b>{r.extraction.incident_type}</b>
                    </span>
                    <span>
                      People affected{" "}
                      <b>{r.extraction.people_affected ?? "Unknown"}</b>
                    </span>
                    <span>
                      Trapped{" "}
                      <b>
                        {r.extraction.people_trapped === null
                          ? "Unknown"
                          : r.extraction.people_trapped
                            ? "Reported"
                            : "Reported absent"}
                      </b>
                    </span>
                    <span>
                      Medical help{" "}
                      <b>
                        {r.extraction.medical_help_needed === null
                          ? "Unknown"
                          : r.extraction.medical_help_needed
                            ? "Requested"
                            : "Reported absent"}
                      </b>
                    </span>
                  </div>
                  <p className="muted">
                    Interpretation: {r.extraction.summary}
                  </p>
                  {r.extraction.evidence_spans.length > 0 && (
                    <div className="evidence-spans">
                      {r.extraction.evidence_spans.map((s, n) => (
                        <mark key={n}>{s}</mark>
                      ))}
                    </div>
                  )}
                  <details>
                    <summary>
                      Extraction uncertainty (
                      {r.extraction.uncertainties.length})
                    </summary>
                    <ul>
                      {r.extraction.uncertainties.map((u, n) => (
                        <li key={n}>{u}</li>
                      ))}
                    </ul>
                  </details>
                  <div className="attachments">
                    {r.media.map((m) =>
                      m.kind === "image" ? (
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noreferrer"
                          key={m.id}
                        >
                          <img
                            src={m.url}
                            alt={`Supporting evidence for report ${shortId(r.id)}`}
                          />
                        </a>
                      ) : (
                        <audio key={m.id} src={m.url} controls />
                      ),
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === "review" && (
            <div className="dossier-body">
              <form
                className="review-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(
                    `/incidents/${id}`,
                    {
                      incident_type: f.get("category"),
                      location_text: f.get("location") || null,
                      summary: f.get("summary"),
                      status: f.get("status"),
                      latitude: f.get("latitude")
                        ? Number(f.get("latitude"))
                        : null,
                      longitude: f.get("longitude")
                        ? Number(f.get("longitude"))
                        : null,
                      reason: f.get("reason"),
                    },
                    "PATCH",
                  );
                }}
              >
                <h3>Correct incident information</h3>
                <p>
                  Corrections apply to the incident. Original reports and
                  extraction results remain preserved.
                </p>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="edit-category">Category</label>
                    <select
                      id="edit-category"
                      name="category"
                      defaultValue={incident.incident_type}
                    >
                      {[
                        "flood",
                        "fire",
                        "medical",
                        "infrastructure",
                        "crime",
                        "unknown",
                      ].map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="edit-status">Review status</label>
                    <select
                      id="edit-status"
                      name="status"
                      defaultValue={incident.status}
                    >
                      {["unreviewed", "verified", "monitoring", "resolved"].map(
                        (s) => (
                          <option key={s}>{s}</option>
                        ),
                      )}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="edit-location">Location</label>
                  <input
                    id="edit-location"
                    name="location"
                    defaultValue={incident.location_text || ""}
                  />
                </div>
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="edit-latitude">Latitude</label>
                    <input
                      id="edit-latitude"
                      name="latitude"
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      defaultValue={incident.latitude ?? ""}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-longitude">Longitude</label>
                    <input
                      id="edit-longitude"
                      name="longitude"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      defaultValue={incident.longitude ?? ""}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="edit-summary">Summary</label>
                  <textarea
                    id="edit-summary"
                    name="summary"
                    rows={3}
                    defaultValue={incident.summary}
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </div>
                <div className="field">
                  <label htmlFor="correction-reason">
                    Reason for correction
                  </label>
                  <input
                    id="correction-reason"
                    name="reason"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </div>
                <Button disabled={busy}>
                  Save correction
                  <ArrowUpRight size={16} />
                </Button>
              </form>
              <form
                className="review-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(`/incidents/${id}/merge`, {
                    target_id: f.get("target"),
                    reason: f.get("reason"),
                  });
                }}
              >
                <h3>
                  <GitMerge size={18} /> Merge into another incident
                </h3>
                <div className="field">
                  <label htmlFor="merge-target">Destination incident</label>
                  <select
                    name="target"
                    id="merge-target"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose a destination
                    </option>
                    {incidents
                      .filter((i) => i.id !== id)
                      .map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.location_text || "Unknown"} / {i.incident_type} /{" "}
                          {shortId(i.id)}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="merge-reason">
                    Why do these belong together?
                  </label>
                  <input
                    name="reason"
                    id="merge-reason"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </div>
                <Button variant="outline" disabled={busy}>
                  Merge incident
                </Button>
              </form>
              {incident.reports?.map((r) => (
                <form
                  className="review-form"
                  key={r.id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const operation = f.get("operation");
                    void action(
                      `/reports/${r.id}/${operation === "separate" ? "separate" : "verification"}`,
                      {
                        reason: f.get("reason"),
                        ...(operation === "separate"
                          ? {}
                          : { status: operation }),
                      },
                    );
                  }}
                >
                  <h3>Review report {shortId(r.id)}</h3>
                  <div className="field">
                    <label htmlFor={`action-${r.id}`}>Action</label>
                    <select name="operation" id={`action-${r.id}`}>
                      <option value="needs_verification">
                        Requires verification
                      </option>
                      <option value="verified">Mark reviewed</option>
                      {incident.report_count > 1 && (
                        <option value="separate">
                          Separate into its own incident
                        </option>
                      )}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`reason-${r.id}`}>Review note</label>
                    <input
                      id={`reason-${r.id}`}
                      name="reason"
                      required
                      minLength={3}
                      maxLength={1000}
                    />
                  </div>
                  <Button variant="outline" disabled={busy}>
                    <Split size={16} />
                    Apply report action
                  </Button>
                </form>
              ))}
            </div>
          )}
          {tab === "history" && (
            <div className="dossier-body">
              <p className="muted">
                Append-only action history · local operator
              </p>
              {incident.history?.map((a) => (
                <div className="history-item" key={a.id}>
                  <time>{new Date(a.created_at).toLocaleString()}</time>
                  <strong>{readable(a.action)}</strong>
                  <pre>{JSON.stringify(a.detail, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
