import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, AudioLines, Check, LogOut, ShieldCheck, X } from "lucide-react";
import App from "./App";
import { api, setCsrfToken } from "./api";
import { Button } from "./components/ui/button";
import { SubmitReport } from "./components/SubmitReport";
import { NearbyHelp } from "./components/NearbyHelp";
import { CaseBoard } from "./components/CaseBoard";
import { EmergencyDirectory } from "./components/EmergencyDirectory";
import type { Report } from "./types";
import "./portal.css";

export interface Account {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}
interface Session {
  account: Account;
  csrf: string;
}

export default function PortalApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Session>("/auth/session")
      .then((s) => {
        if (active) {
          setCsrfToken(s.csrf);
          setAccount(s.account);
        }
      })
      .catch((e) => {
        if (active && (e as Error).message !== "Sign in to continue")
          setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => {
      setAccount(null);
      setCsrfToken("");
      setError("Your session expired. Sign in again.");
    };
    window.addEventListener("resq-session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("resq-session-expired", expired);
    };
  }, []);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setCsrfToken("");
      setAccount(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return <div className="portal-loading">Opening your workspace…</div>;
  return (
    <>
      {error && (
        <div role="alert" className="error portal-error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {!account ? (
        <SignIn
          onSession={(s) => {
            setCsrfToken(s.csrf);
            setAccount(s.account);
            setError("");
          }}
        />
      ) : account.role === "admin" ? (
        <App account={account} onLogout={() => void logout()} />
      ) : (
        <UserPortal account={account} onLogout={() => void logout()} />
      )}
      {account?.role !== "admin" && <EmergencyDirectory />}
    </>
  );
}

function SignIn({ onSession }: { onSession: (session: Session) => void }) {
  const [admin, setAdmin] = useState(location.hash === "#admin");
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<Session>(
        `/auth/${register ? "register" : "login"}`,
        {
          method: "POST",
          body: JSON.stringify({
            email: data.get("email"),
            password: data.get("password"),
            ...(register ? { name: data.get("name") } : {}),
          }),
        },
      );
      location.hash = result.account.role === "admin" ? "cases" : "my-reports";
      onSession(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="access-page">
      <section className="access-story">
        <a className="portal-brand" href="#user">
          <AudioLines /> RESQNET <span>FIELD DESK / 01</span>
        </a>
        <div className="access-headline">
          <span className="eyebrow">REPORTING & RESPONSE COORDINATION</span>
          <h1>
            A report should
            <br />
            never be
            <br />
            <em>a dead end.</em>
          </h1>
          <p>
            Tell us what happened. Follow your case.
            <br />
            Keep the conversation with the review team in one place.
          </p>
        </div>
        <div className="access-foot">
          <span>01 / REPORT</span>
          <span>02 / FOLLOW THROUGH</span>
          <p>
            This workspace connects you to its administrators. It does not
            dispatch emergency services.
          </p>
        </div>
      </section>
      <section className="access-form-area">
        <div className="access-switch" aria-label="Choose portal">
          <button
            className={!admin ? "active" : ""}
            onClick={() => {
              setAdmin(false);
              setRegister(false);
              location.hash = "user";
            }}
          >
            User portal
          </button>
          <button
            className={admin ? "active" : ""}
            onClick={() => {
              setAdmin(true);
              setRegister(false);
              location.hash = "admin";
            }}
          >
            Admin portal
          </button>
        </div>
        <form onSubmit={submit} className="access-form">
          <ShieldCheck size={28} />
          <span className="eyebrow">
            {admin ? "RESTRICTED WORKSPACE" : "YOUR PRIVATE REPORTS"}
          </span>
          <h2>
            {register
              ? "Open your account."
              : admin
                ? "Take the desk."
                : "Welcome back."}
          </h2>
          <p>
            {admin
              ? "Review incoming cases, assign a responder from your admin team, and keep people informed."
              : "Your reports and the team’s replies stay here, including after you sign out."}
          </p>
          {register && (
            <label>
              Your name
              <input
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
            />
          </label>
          {register && <small>Use at least 12 characters.</small>}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? "Opening workspace…"
              : register
                ? "Create account"
                : "Sign in"}
            <ArrowUpRight size={17} />
          </Button>
          {!admin && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register
                ? "Already registered? Sign in"
                : "New here? Create an account"}
            </button>
          )}
          {admin && (
            <p className="access-admin-note">
              Administrator accounts are issued by the workspace owner. Public
              registration creates a user account.
            </p>
          )}
        </form>
        <span className="access-bottom">RESQNET / LOCAL WORKSPACE</span>
      </section>
    </main>
  );
}

function UserPortal({
  account,
  onLogout,
}: {
  account: Account;
  onLogout: () => void;
}) {
  const [page, setPage] = useState("reports");
  const [selected, setSelected] = useState<string>();
  const [help, setHelp] = useState<Report>();
  const [submitted, setSubmitted] = useState<string>();
  useEffect(() => {
    if (!submitted) return;
    const timer = window.setTimeout(() => setSubmitted(undefined), 7000);
    return () => window.clearTimeout(timer);
  }, [submitted]);
  return (
    <div className="user-shell">
      {submitted && (
        <div className="toast" role="status" aria-live="polite">
          <Check size={18} />
          <span>Report submitted successfully.</span>
          <button className="icon-button" aria-label="Dismiss submission notification" onClick={() => setSubmitted(undefined)}>
            <X size={16} />
          </button>
        </div>
      )}
      <header className="user-topbar">
        <a
          className="portal-brand"
          href="#my-reports"
          onClick={() => setPage("reports")}
        >
          <AudioLines /> RESQNET
        </a>
        <span>USER PORTAL</span>
        <div>
          {account.name}
          <Button variant="ghost" onClick={onLogout}>
            <LogOut size={15} />
            Sign out
          </Button>
        </div>
      </header>
      <div className="user-layout">
        <aside>
          <h1>
            Stay
            <br />
            <em>in the loop.</em>
          </h1>
          <nav aria-label="User navigation">
            {[
              ["submit", "Report an incident"],
              ["nearby", "Nearby help"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => setPage(id)}
              >
                {label}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </nav>
          <p>
            Only you and authorized administrators can access your reports.
            Updates refresh every 10 seconds while this page is open.
          </p>
        </aside>
        <main className="user-content">
          {page === "reports" && (
            <>
              <div className="portal-heading">
                <div>
                  <span className="eyebrow">CASE HISTORY</span>
                  <h2>My reports</h2>
                </div>
                <Button onClick={() => setPage("submit")}>
                  Report an incident
                </Button>
              </div>
              <CaseBoard account={account} initialSelected={selected} />
            </>
          )}
          {page === "submit" && (
            <>
              <div className="portal-heading">
                <h2>What happened?</h2>
                <Button variant="ghost" onClick={() => setPage("reports")}>
                  Back to reports
                </Button>
              </div>
              <SubmitReport
                onCreated={(report, findHelp) => {
                  setSubmitted(report.id);
                  setSelected(report.id);
                  setHelp(report);
                  setPage(findHelp ? "nearby" : "reports");
                }}
              />
            </>
          )}
          {page === "nearby" && (
            <>
              <Button variant="ghost" onClick={() => setPage("reports")}>
                Back to reports
              </Button>
              <NearbyHelp report={help} autoSearch={!!help} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
