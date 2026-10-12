import { lazy, Suspense } from "react";
import { AudioLines, LogOut } from "lucide-react";
import type { Account } from "../PortalApp";
import { departmentLabel } from "../departments";
import { Button } from "./ui/button";

const CaseBoard = lazy(() => import("./CaseBoard").then((module) => ({ default: module.CaseBoard })));

export function DepartmentPortal({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const label = departmentLabel(account.department);
  return (
    <div className="department-shell">
      <header className="user-topbar">
        <a className="portal-brand" href="#department"><AudioLines /> RESQNET</a>
        <span>DEPARTMENT DESK / {label.toUpperCase()}</span>
        <div>
          {account.name}
          <Button variant="ghost" onClick={onLogout}><LogOut size={15} /> Sign out</Button>
        </div>
      </header>
      <main className="department-content">
        <div className="department-heading">
          <div>
            <span className="eyebrow">INCOMING CASES / LIVE</span>
            <h1>{label} desk.</h1>
            <p>Only reports routed to this department are shown. New assigned cases open automatically.</p>
          </div>
          <span className="department-live"><i /> Live updates on</span>
        </div>
        <Suspense fallback={<div className="portal-loading">Opening assigned cases…</div>}>
          <CaseBoard account={account} />
        </Suspense>
      </main>
    </div>
  );
}
