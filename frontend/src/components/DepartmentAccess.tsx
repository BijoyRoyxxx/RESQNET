import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, RefreshCw, UsersRound } from "lucide-react";
import { api } from "../api";
import { departments, departmentLabel } from "../departments";
import { Button } from "./ui/button";
import type { Account } from "../PortalApp";

type DepartmentAccount = Account & {
  official_id: string | null;
  verification_url: string | null;
};

export function DepartmentAccess() {
  const [accounts, setAccounts] = useState<DepartmentAccount[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setAccounts(await api<DepartmentAccount[]>("/admin/department-accounts"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const verification = values.get("verification") as File;
      const upload = new FormData();
      upload.set("file", verification);
      const proof = await api<{ id: string }>("/media", {
        method: "POST",
        body: upload,
      });
      const account = await api<Account>("/admin/department-accounts", {
        method: "POST",
        body: JSON.stringify({
          name: values.get("name"),
          email: values.get("email"),
          password: values.get("password"),
          department: values.get("department"),
          official_id: values.get("official_id"),
          verification_media_id: proof.id,
          verified: values.get("verified") === "on",
        }),
      });
      form.reset();
      setNotice(`${account.name} can now sign in to the ${departmentLabel(account.department)} desk.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="department-access">
      <div className="department-access-intro">
        <span className="eyebrow">CONTROLLED ACCESS / CASE ROUTING</span>
        <h2>Department desks.</h2>
        <p>Issue sign-ins to department staff. New reports route by category, and staff see only cases assigned to their desk.</p>
        <div className="department-routing-list">
          {departments.map((department) => (
            <div key={department.id}>
              <span>{department.label}</span>
              <small>{department.categories}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="department-access-work">
        <form className="department-account-form" onSubmit={create}>
          <span className="eyebrow"><KeyRound size={13} /> CREATE A DEPARTMENT SIGN-IN</span>
          <label>
            Department
            <select name="department" required defaultValue="police">
              {departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}
            </select>
          </label>
          <label>
            Staff member
            <input name="name" required minLength={2} maxLength={80} />
          </label>
          <label>
            Official ID / badge number
            <input name="official_id" required minLength={3} maxLength={100} autoComplete="off" />
          </label>
          <label>
            Government ID or department certificate
            <input name="verification" type="file" accept="image/jpeg,image/png,image/webp" required />
          </label>
          <label>
            Email address
            <input name="email" type="email" required maxLength={254} />
          </label>
          <label>
            Initial password
            <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" />
          </label>
          <label className="department-verification-check">
            <input name="verified" type="checkbox" required />
            I checked this ID and confirm the staff member’s department.
          </label>
          <small>Upload a clear ID or certificate image, then give the initial password to the staff member privately.</small>
          {error && <div className="error" role="alert">{error}</div>}
          {notice && <div className="notice" role="status">{notice}</div>}
          <Button type="submit" disabled={busy}>{busy ? "Creating sign-in…" : "Create sign-in"}</Button>
        </form>
        <section className="department-account-list">
          <div className="section-heading">
            <span className="eyebrow"><UsersRound size={14} /> ACTIVE DEPARTMENT ACCOUNTS</span>
            <Button variant="outline" onClick={() => void refresh()}><RefreshCw size={14} /> Refresh</Button>
          </div>
          {!accounts.length ? <p className="muted">No department accounts yet.</p> : accounts.map((account) => (
            <article key={account.id}>
              <div><strong>{account.name}</strong><small>{account.email}{account.official_id ? ` · ${account.official_id}` : ""}</small></div>
              <span>{departmentLabel(account.department)}</span>
              {account.verification_url && <a href={account.verification_url} target="_blank" rel="noreferrer">Verified ID ↗</a>}
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}
