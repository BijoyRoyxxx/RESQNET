import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  FileText,
  Flame,
  Github,
  GitMerge,
  Globe2,
  LayoutDashboard,
  Map,
  Menu,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Waves,
  X,
  Zap,
  ChartNoAxesCombined,
  Layers3,
  HeartPulse,
  Construction,
  Server,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, localTime, readable, shortId } from "./api";
import type { Health, Incident, Summary } from "./types";
import { IncidentMap } from "./components/IncidentMap";
import { IncidentDetail } from "./components/IncidentDetail";
import { Button } from "./components/ui/button";
import { CaseBoard } from "./components/CaseBoard";
import type { Account } from "./PortalApp";

const navigation = [
  { id: "cases", label: "Emergency Cases", icon: Siren },
  { id: "command", label: "Command Center", icon: LayoutDashboard },
  { id: "map", label: "Incident Map", icon: Map },
  { id: "solved", label: "Solved Cases", icon: Check },
  { id: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { id: "system", label: "System Status", icon: Activity },
  { id: "about", label: "About / Open Source", icon: Github },
];
const categoryIcons: Record<string, ComponentType<{ size?: number }>> = {
  flood: Waves,
  fire: Flame,
  medical: HeartPulse,
  infrastructure: Construction,
  crime: ShieldCheck,
  unknown: CircleHelp,
};
const subtitles: Record<string, string> = {
  cases: "Every report gets a place. Urgent cases come first.",
  command: "Scattered reports. A clearer picture.",
  map: "Place the reports in context.",
  solved: "Closed cases, with the explanation shared with the reporter.",
  analytics: "Patterns in the reports received.",
  system: "Local services, visible limits.",
  about: "Open tools. Accountable decisions.",
};
function initialPage() {
  const page = location.hash.slice(1);
  return navigation.some((n) => n.id === page) ? page : "command";
}

export default function App({
  account,
  onLogout,
}: {
  account: Account;
  onLogout: () => void;
}) {
  const [page, setPage] = useState(initialPage);
  const [summary, setSummary] = useState<Summary>();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [health, setHealth] = useState<Health>();
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [updated, setUpdated] = useState<Date>();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [mobileNav, setMobileNav] = useState(false);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async (refreshHealth = false) => {
    const version = ++refreshVersion.current;
    try {
      const [data, h] = await Promise.all([
        api<{ summary: Summary; incidents: Incident[] }>("/dashboard"),
        refreshHealth ? api<Health>("/health") : Promise.resolve(undefined),
      ]);
      if (version !== refreshVersion.current) return;
      setSummary(data.summary);
      setIncidents(data.incidents);
      if (h) setHealth(h);
      setError("");
      setUpdated(new Date());
      setLoaded(true);
    } catch (e) {
      if (version !== refreshVersion.current) return;
      setError((e as Error).message || "Cannot reach the local API.");
    } finally {
      if (version === refreshVersion.current) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(true);
    const refreshFromLiveUpdate = () => void refresh();
    window.addEventListener("resq-live-update", refreshFromLiveUpdate);
    return () => window.removeEventListener("resq-live-update", refreshFromLiveUpdate);
  }, [refresh]);
  useEffect(() => {
    const changed = () => setPage(initialPage());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    document.title = `RESQNET / ${navigation.find((n) => n.id === page)?.label}`;
  }, [page]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const navigate = (next: string) => {
    location.hash = next;
    setPage(next);
    setMobileNav(false);
  };
  const filtered = incidents
    .filter(
      (i) =>
        (category === "all" || i.incident_type === category) &&
        (priority === "all" || i.priority.level === priority) &&
        `${i.id} ${i.location_text} ${i.summary}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.priority.score - a.priority.score);
  const reviewed = () => {
    setToast("Review saved. The audit trail has been updated.");
    void refresh();
  };
  const filters = (
    <div className="filters">
      <div className="search-field">
        <Search size={16} />
        <input
          aria-label="Search incidents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search location, incident, or report…"
        />
      </div>
      <select
        aria-label="Filter incident category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        <option value="all">All categories</option>
        {["flood", "fire", "medical", "infrastructure", "crime", "unknown"].map(
          (c) => (
            <option key={c}>{c}</option>
          ),
        )}
      </select>
      <select
        aria-label="Filter review priority"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
      >
        <option value="all">All priorities</option>
        {["high", "medium", "low"].map((p) => (
          <option key={p} value={p}>
            {p} priority
          </option>
        ))}
      </select>
      <SlidersHorizontal size={17} className="muted" />
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <a
          className="brand"
          href="#command"
          onClick={() => navigate("command")}
        >
          <span className="brand-mark">
            <AudioLines size={24} />
          </span>
          <span>
            RESQ<span className="brand-dot">NET</span>
            <small>INCIDENT INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">
          <span className="dot" /> WEST BENGAL / DEMO <ChevronDown size={13} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.slice(0, 5).map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {item.label}

            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="nav-label">PROJECT</div>
          <nav>
            {navigation.slice(5).map((item) => (
              <button
                key={item.id}
                className={page === item.id ? "active" : ""}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="local-status">
            <span className={`dot ${error ? "red" : ""}`} />
            <div>
              <b>
                {error
                  ? "Connection interrupted"
                  : loaded
                    ? "Local workspace connected"
                    : "Connecting to workspace"}
              </b>
              <small>Admin portal · persistent database</small>
            </div>
          </div>
          <div className="operator">
            <span>LO</span>
            <div>
              <strong>{account.name}</strong>
              <small>Human review enabled</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle icon-button"
              aria-label="Toggle navigation"
              onClick={() => setMobileNav(!mobileNav)}
            >
              {mobileNav ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="topbar-project">Workspace</span>
            <span className="slash">/</span>
            <strong>{navigation.find((n) => n.id === page)?.label}</strong>
          </div>
          <div className="topbar-right">
            <Button variant="ghost" onClick={onLogout}>
              Sign out
            </Button>
            <span className="demo-chip">RESEARCH DEMO</span>
            <span className="topbar-divider" />

            <button
              className="avatar"
              aria-label="View system status"
              onClick={() => navigate("system")}
            >
              LO
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow page-eyebrow">
                <span className="tiny-line" /> OPERATIONAL OVERVIEW{" "}
                <span className="muted">
                  /{" "}
                  {new Date()
                    .toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                    .toUpperCase()}
                </span>
              </div>
              <h1>
                {navigation.find((n) => n.id === page)?.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>{subtitles[page]}</p>
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setRefreshing(true);
                  void refresh(true);
                }}
                disabled={refreshing}
              >
                <RefreshCw size={15} className={refreshing ? "spin" : ""} />
                <span>Refresh</span>
              </Button>
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              Could not refresh the workspace: {error}. Start the backend on
              127.0.0.1:8000. {loaded && "Displayed records may be stale."}
            </div>
          )}
          {!loaded && (
            <div className="loading panel">
              {error
                ? "Waiting for the local API. Use Refresh after starting the backend."
                : "Connecting to the local workspace…"}
            </div>
          )}
          {(page === "cases" || page === "solved") && (
            <CaseBoard key={page} account={account} solved={page === "solved"} />
          )}
          {loaded && summary && page === "command" && (
            <>
              <div className="stats-grid">
                <Stat
                  label="REPORTS RECEIVED"
                  value={summary.total_reports}
                  icon={ArrowDownLeft}
                  detail={`${summary.languages.length} source languages`}
                  tone="cyan"
                />
                <Stat
                  label="UNIQUE INCIDENTS"
                  value={summary.unique_incidents}
                  icon={Layers3}
                  detail="After approved report consolidation"
                />
                <Stat
                  label="AWAITING REVIEW"
                  value={summary.awaiting_review}
                  icon={ShieldCheck}
                  detail={`${summary.pending_matches} possible duplicate matches`}
                  tone="amber"
                />
                <Stat
                  label="HIGH REVIEW PRIORITY"
                  value={summary.high_priority}
                  icon={Zap}
                  detail="Suggested by evidence rules"
                  tone="red"
                />
              </div>
              <div className="command-grid">
                <section className="panel map-panel">
                  <div className="panel-header">
                    <h2>
                      <span className="dot" />
                      Incident overview
                    </h2>
                    <div className="map-legend">
                      <span>
                        <i className="red" />
                        High
                      </span>
                      <span>
                        <i className="amber" />
                        Medium
                      </span>
                      <span>
                        <i className="cyan-bg" />
                        Low
                      </span>
                      <button
                        aria-label="Open full incident map"
                        className="icon-button"
                        onClick={() => navigate("map")}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </div>
                  <IncidentMap incidents={incidents} onSelect={setSelected} />
                  <div className="panel-foot">
                    <span>
                      <Globe2 size={13} /> Location supplied by sources · not
                      independently verified
                    </span>
                    <button onClick={() => navigate("map")}>
                      Explore map <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
                <section className="panel distribution">
                  <div className="panel-header">
                    <h2>Incident breakdown</h2>
                    <span className="eyebrow">BY TYPE</span>
                  </div>
                  <div className="distribution-total">
                    <b>{summary.unique_incidents}</b>
                    <span>incidents to understand</span>
                  </div>
                  <div className="stacked-bar">
                    {summary.types.map((t) => (
                      <span
                        key={t.name}
                        className={`type-bg-${t.name}`}
                        style={{
                          width: `${(t.value / Math.max(1, summary.unique_incidents)) * 100}%`,
                        }}
                        title={`${t.name}: ${t.value}`}
                      />
                    ))}
                  </div>
                  <div className="distribution-list">
                    {summary.types.map((t) => {
                      const Icon = categoryIcons[t.name] || CircleHelp;
                      return (
                        <button
                          key={t.name}
                          onClick={() => {
                            setCategory(t.name);
                            navigate("cases");
                          }}
                        >
                          <span className={`category-icon ${t.name}`}>
                            <Icon size={17} />
                          </span>
                          <span>
                            {t.name === "infrastructure"
                              ? "Infrastructure"
                              : t.name[0].toUpperCase() + t.name.slice(1)}
                          </span>
                          <b>{t.value.toString().padStart(2, "0")}</b>
                          <small>
                            {Math.round(
                              (t.value /
                                Math.max(1, summary.unique_incidents)) *
                                100,
                            )}
                            %
                          </small>
                        </button>
                      );
                    })}
                  </div>

                </section>
              </div>
              <div className="command-bottom">

                <section className="panel activity-panel">
                  <div className="panel-header">
                    <h2>Activity log</h2>
                    <Radio size={16} className="cyan" />
                  </div>
                  <div className="timeline">
                    {summary.activity.slice(0, 4).map((a) => (
                      <div className="timeline-item" key={a.id}>
                        <span
                          className={`timeline-dot ${a.action.includes("approved") ? "cyan-bg" : ""}`}
                        />
                        <time>{localTime(a.created_at)}</time>
                        <strong>{readable(a.action)}</strong>
                        <span>{shortId(a.entity_id)}</span>
                      </div>
                    ))}
                    {!summary.activity.length && (
                      <p className="muted">Review activity will appear here.</p>
                    )}
                  </div>
                  <button
                    className="activity-link"
                    onClick={() => navigate("cases")}
                  >
                    Open emergency cases
                    <ArrowRight size={14} />
                  </button>
                </section>
              </div>
            </>
          )}
          {loaded && page === "map" && (
            <>
              {filters}
              <section className="panel">
                <div className="panel-header">
                  <h2>Incident geography</h2>
                  <span className="muted">
                    {filtered.length} incidents in view
                  </span>
                </div>
                <IncidentMap
                  incidents={filtered}
                  onSelect={setSelected}
                  large
                />
              </section>
              <p className="muted">
                Reports without coordinates remain in Emergency Cases.
                Scroll zoom is disabled; use the map controls.
              </p>
            </>
          )}
          {loaded && summary && page === "analytics" && (
            <>
              <div className="stats-grid">
                <Stat
                  label="TOTAL REPORTS"
                  value={summary.total_reports}
                  icon={FileText}
                  detail="From the current database"
                />
                <Stat
                  label="CONSOLIDATED REPORTS"
                  value={summary.total_reports - summary.unique_incidents}
                  icon={GitMerge}
                  detail="Reports linked to other source reports"
                />
                <Stat
                  label="SYNTHETIC DATA"
                  value={summary.synthetic_reports}
                  icon={Command}
                  detail="Explicitly marked demonstration inputs"
                />
                <Stat
                  label="PENDING MATCHES"
                  value={summary.pending_matches}
                  icon={ShieldCheck}
                  detail="Awaiting a human decision"
                />
              </div>
              <div className="chart-grid">
                <section className="panel">
                  <div className="panel-header">
                    <h2>Reports received</h2>
                    <span className="eyebrow">BY HOUR / UTC</span>
                  </div>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={summary.volume}>
                        <CartesianGrid
                          stroke="#dce5e5"
                          strokeDasharray="3 6"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="time"
                          tick={{ fill: "#536a74", fontSize: 10 }}
                          tickFormatter={(t) => t.slice(11)}
                          axisLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#536a74", fontSize: 11 }}
                          axisLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#ffffff",
                            border: "1px solid #d6e1e1",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="reports"
                          stroke="#087c6a"
                          fill="#087c6a"
                          fillOpacity={0.12}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-header">
                    <h2>Source languages</h2>
                    <Globe2 size={18} />
                  </div>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.languages}>
                        <CartesianGrid stroke="#dce5e5" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#536a74" }} />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fill: "#536a74" }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#ffffff",
                            border: "1px solid #d6e1e1",
                          }}
                        />
                        <Bar dataKey="value" fill="#3474b8" maxBarSize={55} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>
              <section className="panel provenance">
                <h2>Extraction provenance</h2>
                {Object.entries(summary.engines).map(([engine, count]) => (
                  <div key={engine}>
                    <span className="mono">{engine}</span>
                    <strong>{count} reports</strong>
                  </div>
                ))}
                <p>
                  These are record counts, not model quality scores. Run the
                  evaluation script to calculate classification accuracy and
                  duplicate precision/recall on the labeled synthetic dataset.
                </p>
              </section>
            </>
          )}
          {loaded && health && page === "system" && (
            <div className="system-grid">
              <section className="panel system-panel">
                <div className="section-heading">
                  <Server size={24} className="cyan" />
                  <span className="badge low">Database connected</span>
                </div>
                <h2>Local services</h2>
                {[
                  ["Storage", health.database],
                  ["Deployment", health.deployment],
                  ["Text extraction", health.effective_engine],
                  ["Configured model", health.model],
                  [
                    "Ollama service",
                    health.ollama_reachable ? "Reachable" : "Unavailable",
                  ],
                  [
                    "Gemma model",
                    health.model_available ? "Installed" : "Not installed",
                  ],
                  [
                    "Voice transcription",
                    health.voice_enabled
                      ? `Enabled · ${health.whisper_model} · CPU int8`
                      : "Disabled",
                  ],
                  ["Matching threshold", String(health.match_threshold)],
                ].map(([label, value]) => (
                  <div className="system-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </section>
              <section className="panel system-panel">
                <span className="eyebrow cyan">HONEST FAILURE MODES</span>
                <h2>Available does not mean infallible.</h2>
                <p>
                  Gemma output is schema-validated and checked for exact
                  evidence spans. Invalid responses or an unavailable service
                  switch to labeled deterministic rules.
                </p>
                <p>
                  Safety-sensitive counts and boolean claims require
                  conservative source support. Every interpretation remains
                  subject to human review.
                </p>
                <h3>Enable local models</h3>
                <pre>ollama pull gemma3:1b</pre>
                <p>
                  For voice, install backend/requirements-voice.txt and set
                  RESQ_VOICE_ENABLED=true. The first transcription downloads the
                  configured Whisper model.
                </p>
                <a
                  className="text-button"
                  href="http://127.0.0.1:8000/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore the API documentation
                  <ArrowUpRight size={16} />
                </a>
              </section>
            </div>
          )}
          {loaded && page === "about" && (
            <div className="about-layout">
              <section>
                <span className="eyebrow cyan">BUILT IN THE OPEN</span>
                <h2>
                  When every second matters,
                  <br />
                  <em>make the evidence legible.</em>
                </h2>
                <p>
                  RESQNET turns scattered emergency reports into a shared
                  picture that a human can question, correct, and act on
                  responsibly.
                </p>
                <p>
                  This is a research and hackathon demonstration for
                  Hacktoberfest Hack Day Barasat. It is not a certified
                  emergency platform, a medical triage tool, or a dispatch
                  service.
                </p>
                <div className="about-license">
                  <Github size={24} />
                  <div>
                    <strong>MIT licensed original code</strong>
                    <span>
                      Self-hosted. No paid API dependency. Model licenses apply
                      separately.
                    </span>
                  </div>
                </div>
                <p className="muted">
                  The local repository contains the full source, tests,
                  contribution guide, and model attribution. No public GitHub
                  repository has been configured yet.
                </p>
              </section>
              <section className="panel architecture">
                <h3>One report, an auditable path</h3>
                {[
                  [
                    "01",
                    "Capture",
                    "Text, corrected transcript, image evidence",
                  ],
                  [
                    "02",
                    "Extract",
                    "Local Gemma or labeled deterministic rules",
                  ],
                  ["03", "Compare", "Geography + category + language + time"],
                  ["04", "Review", "A human links, separates, or corrects"],
                  [
                    "05",
                    "Preserve",
                    "SQLite records, source evidence, audit history",
                  ],
                ].map(([n, title, detail]) => (
                  <div key={n}>
                    <span>{n}</span>
                    <p>
                      <strong>{title}</strong>
                      <small>{detail}</small>
                    </p>
                  </div>
                ))}
                <a
                  href="https://github.com/ollama/ollama"
                  target="_blank"
                  rel="noreferrer"
                >
                  Built with open-source tools
                  <ArrowUpRight size={16} />
                </a>
              </section>
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              <span className={`dot ${error ? "red" : ""}`} />
              {health?.effective_engine || "Waiting for service status"}
              <span className="footer-separator">/</span>All decisions stay with
              the operator
            </span>
            <span>
              {updated
                ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Not yet synchronized"}{" "}
              · Live updates
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <IncidentDetail
          key={selected}
          id={selected}
          incidents={incidents}
          onClose={() => setSelected(undefined)}
          onChange={reviewed}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
  detail,
  tone = "",
}: {
  label: string;
  value: number;
  icon: ComponentType<{ size?: number }>;
  detail: string;
  tone?: string;
}) {
  return (
    <section className={`panel stat ${tone}`}>
      <div>
        <span className="eyebrow">{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value.toString().padStart(2, "0")}</strong>
      <p>
        <span className="stat-dash" />
        {detail}
      </p>
    </section>
  );
}
