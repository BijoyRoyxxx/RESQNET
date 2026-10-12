import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowUpRight, RefreshCw, MessageSquare, MapPin } from "lucide-react";
import { api, readable, shortId } from "../api";
import type { Account } from "../PortalApp";
import type { Report } from "../types";
import { Button } from "./ui/button";
import { NearbyHelp } from "./NearbyHelp";
import { groupNearbyCases } from "./nearbyCaseGroups";
import { departmentLabel } from "../departments";
import { DepartmentCaseMap } from "./DepartmentCaseMap";

interface Message {
  id: string;
  body: string;
  author: string;
  role: string;
  created_at: string;
  changes: Record<string, string>;
}
interface Case {
  report: Report;
  category: string;
  urgency: string;
  automatic_urgency: string;
  reasons: string[];
  status: string;
  version: number;
  immediate_danger: boolean;
  reporter: Account | null;
  assigned_to: Account | null;
  messages: Message[];
  department: string;
}
const categories = [
  "fire",
  "medical",
  "crime",
  "women_safety",
  "flood",
  "infrastructure",
  "unknown",
];
const categoryNames: Record<string, string> = {
  crime: "Crime / theft",
  women_safety: "Women’s safety",
  medical: "Medical",
  fire: "Fire",
  flood: "Flood",
  infrastructure: "Infrastructure",
  unknown: "Other / uncertain",
};
const statuses = ["submitted", "acknowledged", "in_progress", "resolved"];
function fullDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit",
    minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
}
const urgencies = ["critical", "high", "medium", "low"];

export function CaseBoard({
  account,
  initialSelected,
  solved = false,
}: {
  account: Account;
  initialSelected?: string;
  solved?: boolean;
}) {
  const admin = account.role === "admin";
  const department = account.role === "department";
  const [cases, setCases] = useState<Case[]>([]);
  const [admins, setAdmins] = useState<Account[]>([]);
  const [selected, setSelected] = useState(initialSelected || "");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState(solved ? "resolved" : "open");
  const [urgency, setUrgency] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date>();
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [incoming, setIncoming] = useState<Case | null>(null);
  const refreshVersion = useRef(0);
  const knownDepartmentCases = useRef<Set<string> | null>(null);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setRefreshing(true);
    try {
      const result = await api<Case[]>(
        admin ? "/admin/cases" : department ? "/department/cases" : "/portal/reports",
      );
      if (version !== refreshVersion.current) return;
      if (department) {
        const previous = knownDepartmentCases.current;
        const nextCase = previous
          ? result.find((item) => !previous.has(item.report.id) && item.status !== "resolved")
          : result.find((item) => item.status !== "resolved");
        if (nextCase) {
          setSelected(nextCase.report.id);
          setIncoming(nextCase);
        }
        knownDepartmentCases.current = new Set(result.map((item) => item.report.id));
      }
      setCases(result);
      setUpdated(new Date());
      setError("");
    } catch (e) {
      if (version !== refreshVersion.current) return;
      setError((e as Error).message);
    } finally {
      if (version === refreshVersion.current) setRefreshing(false);
    }
  }, [admin, department]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const refreshFromLiveUpdate = () => void refresh();
    window.addEventListener("resq-live-update", refreshFromLiveUpdate);
    if (admin)
      api<Account[]>("/admin/accounts")
        .then(setAdmins)
        .catch((e) => setError((e as Error).message));
    return () => window.removeEventListener("resq-live-update", refreshFromLiveUpdate);
  }, [admin, refresh]);
  const visible = cases.filter(
    (c) =>
      (category === "all" || c.category === category) &&
      (urgency === "all" || c.urgency === urgency) &&
      (status === "all" ||
        (status === "open" ? c.status !== "resolved" : c.status === status)) &&
      `${c.report.id} ${c.report.text} ${c.report.location_text || ""} ${c.reporter?.name || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const groups = admin ? groupNearbyCases(visible) : visible.map((item) => ({ cases: [item], category: item.category, latitude: item.report.latitude, longitude: item.report.longitude }));
  const current = cases.find((c) => c.report.id === selected);
  const urgent = cases.filter(
    (c) => c.status !== "resolved" && ["critical", "high"].includes(c.urgency),
  );
  return (
    <section className="case-board">
      {department && incoming && (
        <div className="department-case-backdrop">
          <section className="department-case-popup" role="dialog" aria-modal="true" aria-labelledby="department-case-title">
            <span className="eyebrow">NEW CASE / {departmentLabel(account.department).toUpperCase()}</span>
            <h2 id="department-case-title">{categoryNames[incoming.category]} report assigned to your desk.</h2>
            <p>{incoming.report.text}</p>
            <small>{incoming.report.location_text || "Location not specified"} · {fullDate(incoming.report.created_at)}</small>
            <div>
              <Button onClick={() => setIncoming(null)}>Open case</Button>
              <Button variant="ghost" onClick={() => setIncoming(null)}>Dismiss</Button>
            </div>
          </section>
        </div>
      )}
      {admin && !solved && (
        <div className="queue-ledger">
          <div>
            <span className="eyebrow">PRIORITY DESK</span>
            <strong>{urgent.length.toString().padStart(2, "0")}</strong>
            <p>open cases flagged critical or high</p>
          </div>
          <p>
            Declared immediate danger takes the first position. Priority
            suggestions need human review. Same-category reports within 100 m
            are grouped visually; every source report remains a separate case.
          </p>
          <span>
            CRITICAL
            <br />↓ HIGH
            <br />↓ MEDIUM
            <br />↓ LOW
          </span>
        </div>
      )}
      <div className="category-strip" aria-label="Incident categories">
        {["all", ...categories].map((c) => (
          <button
            className={category === c ? "active" : ""}
            key={c}
            onClick={() => setCategory(c)}
          >
            <span>{c === "all" ? "All incidents" : categoryNames[c]}</span>
            <b>
              {
                cases.filter(
                  (item) =>
                    (c === "all" || item.category === c) &&
                    (solved ? item.status === "resolved" : item.status !== "resolved"),
                ).length
              }
            </b>
            <small>{solved ? "solved" : "open"}</small>
          </button>
        ))}
      </div>
      <div className="case-toolbar">
        <input
          aria-label="Search cases"
          placeholder="Search report, place or person"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          disabled={solved}
          aria-label="Case status filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="open">Open cases</option>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s === "resolved" ? "Solved" : readable(s)}
            </option>
          ))}
        </select>
        <select
          aria-label="Case urgency filter"
          value={urgency}
          onChange={(e) => setUrgency(e.target.value)}
        >
          <option value="all">All priorities</option>
          {urgencies.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <RefreshCw size={14} />
          Refresh cases
        </Button>
      </div>
      <div className="case-sync" role="status">
        {updated
          ? `Updated ${updated.toLocaleTimeString()} · Live updates connected`
          : refreshing ? "Loading cases…" : error ? "Cases could not be loaded" : "Waiting for cases"}{" "}
        <span>{admin ? `${visible.length} reports · ${groups.length} groups` : `${visible.length} shown`}</span>
      </div>
      {department && (
        <DepartmentCaseMap
          cases={cases}
          onSelect={(reportId) => {
            setSelected(reportId);
            setRevision(0);
          }}
        />
      )}
      {error && (
        <div role="alert" className="error">
          {error}. {updated && "Displayed records may be out of date."}
        </div>
      )}
      <div className={`case-columns ${current ? "has-detail" : ""}`}>
        <div className="case-list">
          {!visible.length && updated && (
            <div className="case-empty">
              {cases.length
                ? "No cases match these filters."
                : "No reports yet. Your first report will appear here."}
            </div>
          )}
          {groups.map((group) => (
            <div className={`case-location-group ${group.cases.length > 1 ? "is-cluster" : ""}`} key={group.cases[0].report.id}>
              {group.cases.length > 1 && (
                <div className="case-location-group-head">
                  <div>
                    <span className="eyebrow">NEARBY REPORTS / {categoryNames[group.category]}</span>
                    <strong>{group.cases.length} reports within 100 m of the first report</strong>
                    <small>{group.cases[0].report.location_text || (group.latitude != null && group.longitude != null
                      ? `${group.latitude}, ${group.longitude}` : "Location not specified")}</small>
                  </div>
                  <span>Separate case records</span>
                </div>
              )}
              <div className="case-location-group-reports">
                {group.cases.map((item) => (
                  <button
                    key={item.report.id}
                    className={`case-row ${selected === item.report.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelected(item.report.id);
                      setRevision(0);
                    }}
                  >
                    <div className="case-row-top">
                      <span className={`urgency urgency-${item.urgency}`}>
                        {item.urgency}
                      </span>
                      <span>{categoryNames[item.category]}</span>
                      <small>{shortId(item.report.id)}</small>
                    </div>
                    <h3>{item.report.text}</h3>
                    <p>
                      <MapPin size={12} />
                      {item.report.location_text || "Location not specified"}
                    </p>
                    <p className="case-coordinate">
                      Coordinates: {item.report.latitude != null && item.report.longitude != null
                        ? `${item.report.latitude}, ${item.report.longitude}` : "Not supplied"}
                    </p>
                    <p>Reported: {fullDate(item.report.created_at)}</p>
                    <div className="case-row-bottom">
                      <span>{item.status === "resolved" ? "Solved" : readable(item.status)}</span>
                      {item.report.synthetic && <span>DEMO</span>}
                      <span>
                        <MessageSquare size={12} />
                        {item.messages.length}
                      </span>
                      <ArrowUpRight size={15} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {current && (
          <article className="case-detail">
            <div className="case-detail-head">
              <span className="eyebrow">
                CASE / {shortId(current.report.id)}
              </span>
              <button onClick={() => setSelected("")} aria-label="Close case">
                Close ×
              </button>
            </div>
            <div className="case-detail-heading">
              <h2>{categoryNames[current.category]}</h2>
              <span className={`urgency urgency-${current.urgency}`}>
                {current.urgency}
              </span>
            </div>
            <p className="case-original">{current.report.text}</p>
            <dl className="case-facts">
              <div>
                <dt>Status</dt>
                <dd>{current.status === "resolved" ? "Solved" : readable(current.status)}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  {current.report.location_text || "Not specified"}

                </dd>
              </div>
              <div>
                <dt>Submitted coordinates</dt>
                <dd>{current.report.latitude != null && current.report.longitude != null
                  ? <><span>{current.report.latitude}, {current.report.longitude}</span><small><a href={`https://www.google.com/maps/search/?api=1&query=${current.report.latitude},${current.report.longitude}`} target="_blank" rel="noreferrer">Open location on map ↗</a></small></>
                  : "Not supplied"}</dd>
              </div>
              <div><dt>Observed at</dt><dd>{fullDate(current.report.occurred_at)}</dd></div>
              <div>
                <dt>Admin assigned</dt>
                <dd>{current.assigned_to?.name || "Awaiting assignment"}</dd>
              </div>
              <div>
                <dt>Reported</dt>
                <dd>
                  {fullDate(current.report.created_at)}
                </dd>
              </div>
              {admin && (
                <div>
                  <dt>Reporter</dt>
                  <dd>
                    {current.reporter?.name || "Legacy local report"}
                    <small>{current.reporter?.email}</small>
                  </dd>
                </div>
              )}
              {admin && (
                <div>
                  <dt>Routed department</dt>
                  <dd>{departmentLabel(current.department)}</dd>
                </div>
              )}
            </dl>
            <p className="field-hint">Location is the place and coordinates supplied with this report.</p>
            {current.status === "resolved" && (
              <section className="case-resolution">
                <h3>Case solved</h3>
                {(() => {
                  const closing = [...current.messages].reverse().find((m) => m.changes.status === "resolved");
                  return closing ? <><p>{closing.body}</p><small>{closing.author} · {fullDate(closing.created_at)}</small></> : <p>No closing explanation was recorded for this older case.</p>;
                })()}
              </section>
            )}
            <div className="case-reasons">
              <span className="eyebrow">WHY THIS PRIORITY</span>
              {current.reasons.map((r) => (
                <p key={r}>{r}</p>
              ))}
              <small>
                Suggested review order. This is not a medical assessment or
                confirmation that help is on the way.
              </small>
            </div>
            {!!current.report.media.length && (
              <div className="case-evidence">
                {current.report.media.map((m) =>
                  m.kind === "image" ? (
                    <a key={m.id} href={m.url} target="_blank" rel="noreferrer">
                      <img src={m.url} alt="Submitted evidence" />
                    </a>
                  ) : (
                    <audio key={m.id} src={m.url} controls />
                  ),
                )}
              </div>
            )}
            {admin && (
              <>
                <AdminCaseForm
                  key={`${current.report.id}:${revision}`}
                  item={current}
                  admins={admins}
                  onSaved={() => void refresh()}
                />
                <Button
                  variant="ghost"
                  onClick={() => setRevision((r) => r + 1)}
                >
                  Reload form from latest case
                </Button>
              </>
            )}
            <div className="case-conversation">
              <span className="eyebrow">SHARED CASE UPDATES</span>
              <h3>
                {admin
                  ? "Keep the reporter informed."
                  : "Conversation with the team."}
              </h3>
              {!current.messages.length && (
                <p className="muted">
                  No updates yet.{" "}
                  {admin
                    ? "Save a case update or send a reply below."
                    : "Your report is waiting for admin review."}
                </p>
              )}
              {current.messages.map((m) => (
                <div key={m.id} className={`case-message ${m.role}`}>
                  <div>
                    <b>{m.author}</b>
                    <span>
                      {m.role === "admin" ? "ADMIN" : m.role === "department" ? "DEPARTMENT" : "REPORTER"} ·{" "}
                      {fullDate(m.created_at)}
                    </span>
                  </div>
                  <p>{m.body}</p>
                  {Object.entries(m.changes).map(([key, value]) => (
                    <small key={key}>
                      {readable(key)}: {readable(value)}{" "}
                    </small>
                  ))}
                </div>
              ))}
              {department ? (
                <DepartmentCaseForm
                  key={`${current.report.id}:${revision}`}
                  item={current}
                  onSaved={() => void refresh()}
                />
              ) : (
                <ReplyForm
                  key={current.report.id}
                  reportId={current.report.id}
                  admin={admin}
                  onSaved={() => void refresh()}
                />
              )}
            </div>
            {!admin && <details className="case-nearby">
              <summary>
                Find{" "}
                {current.category === "fire"
                  ? "the nearest fire brigade"
                  : current.category === "medical"
                    ? "the nearest hospital"
                    : current.category === "flood"
                      ? "nearby rescue services"
                      : "the nearest police station"}
              </summary>
              <NearbyHelp
                key={current.report.id}
                report={current.report}
                category={
                  current.category as Report["extraction"]["incident_type"]
                }
                compact
              />
            </details>}
          </article>
        )}
      </div>
    </section>
  );
}

function AdminCaseForm({
  item,
  admins,
  onSaved,
}: {
  item: Case;
  admins: Account[];
  onSaved: () => void;
}) {
  const [version, setVersion] = useState(item.version);
  const [caseStatus, setCaseStatus] = useState(item.status);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await api<Case>(`/admin/cases/${item.report.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version,
          category: fields.get("category"),
          status: fields.get("status"),
          urgency: fields.get("urgency") || null,
          assigned_to: fields.get("assigned_to") || null,
          body: fields.get("body"),
        }),
      });
      setVersion(result.version);
      (form.elements.namedItem("body") as HTMLTextAreaElement).value = "";
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="case-admin-form" onSubmit={submit}>
      <span className="eyebrow">ADMIN REVIEW</span>
      {version !== item.version && (
        <p className="notice">
          This case has changed. Reload the form before editing.
        </p>
      )}
      <div className="case-form-grid">
        <label>
          Category
          <select
            name="category"
            aria-label="Case category"
            defaultValue={item.category}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryNames[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Case status
          <select
            name="status"
            aria-label="Case status"
            value={caseStatus}
            onChange={(e) => setCaseStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === "resolved" ? "Solved" : readable(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review priority
          <select
            name="urgency"
            aria-label="Review priority"
            defaultValue={
              item.reasons.includes(
                "Priority set by an administrator; see case updates",
              )
                ? item.urgency
                : ""
            }
          >
            <option value="">Automatic ({item.automatic_urgency})</option>
            {urgencies.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Assign administrator
          <select
            name="assigned_to"
            aria-label="Assign administrator"
            defaultValue={item.assigned_to?.id || ""}
          >
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {caseStatus === "resolved" ? "Explanation of how the case was solved" : "Update for the reporter"}
        <textarea
          name="body"
          required
          minLength={3}
          maxLength={2000}
          rows={3}
          placeholder="Explain what changed and what the reporter should expect."
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="cyan">
          Update saved and shared with the reporter.
        </p>
      )}
      {caseStatus !== "resolved" && (
        <Button type="button" variant="outline" onClick={() => setCaseStatus("resolved")}>
          Mark case solved
        </Button>
      )}
      <Button type="submit" disabled={busy || version !== item.version}>
        {busy ? "Saving…" : caseStatus === "resolved" ? "Save solved case" : "Save case update"}
      </Button>
    </form>
  );
}

function DepartmentCaseForm({
  item,
  onSaved,
}: {
  item: Case;
  onSaved: () => void;
}) {
  const [caseStatus, setCaseStatus] = useState(item.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await api<Case>(`/department/cases/${item.report.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: item.version,
          status: caseStatus,
          urgency: values.get("urgency") || null,
          body: values.get("body"),
        }),
      });
      (form.elements.namedItem("body") as HTMLTextAreaElement).value = "";
      setSaved(true);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="case-admin-form" onSubmit={submit}>
      <span className="eyebrow">DEPARTMENT UPDATE</span>
      <div className="case-form-grid">
        <label>
          Case status
          <select name="status" value={caseStatus} onChange={(event) => setCaseStatus(event.target.value)}>
            {statuses.map((value) => <option key={value} value={value}>{value === "resolved" ? "Solved" : readable(value)}</option>)}
          </select>
        </label>
        <label>
          Review priority
          <select name="urgency" defaultValue={item.reasons.includes("Priority set by an administrator; see case updates") ? item.urgency : ""}>
            <option value="">Automatic / no override</option>
            {urgencies.map((urgency) => <option key={urgency} value={urgency}>{urgency}</option>)}
          </select>
        </label>
      </div>
      <label>
        Update or resolution explanation
        <textarea name="body" minLength={3} maxLength={2000} required placeholder={caseStatus === "resolved" ? "Explain what action resolved the case and when." : "Record what the department checked or did."} />
      </label>
      {error && <div className="error" role="alert">{error}</div>}
      {saved && <div className="notice" role="status">Department update shared with the reporter.</div>}
      <div className="department-case-actions">
        {item.status !== "resolved" && caseStatus !== "resolved" && (
          <Button type="button" variant="outline" onClick={() => setCaseStatus("resolved")}>
            Mark case solved
          </Button>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving update…" : caseStatus === "resolved" ? "Save solved case" : "Save case update"}
        </Button>
      </div>
    </form>
  );
}

function ReplyForm({
  reportId,
  admin,
  onSaved,
}: {
  reportId: string;
  admin: boolean;
  onSaved: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/portal/reports/${reportId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setBody("");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="case-reply" onSubmit={submit}>
      <label>
        Message to the {admin ? "reporter" : "admin team"}
        <textarea
          aria-label="Case message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={3}
          maxLength={2000}
          rows={3}
          placeholder="Add a detail or ask about this case."
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={busy}>
        {busy ? "Sending…" : "Send case message"}
      </Button>
    </form>
  );
}
