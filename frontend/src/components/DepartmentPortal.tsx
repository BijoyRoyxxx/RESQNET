import { lazy, Suspense, useState } from "react";
import { AudioLines, Bell, LogOut } from "lucide-react";
import type { Account } from "../PortalApp";
import { departmentLabel } from "../departments";
import { Button } from "./ui/button";

const CaseBoard = lazy(() => import("./CaseBoard").then((module) => ({ default: module.CaseBoard })));

export function DepartmentPortal({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const label = departmentLabel(account.department);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    setNotificationPermission(await Notification.requestPermission());
  }

  return (
    <div className="department-shell">
      <header className="user-topbar">
        <a className="portal-brand" href="#department"><AudioLines /> RESQNET</a>
        <span>DEPARTMENT DESK / {label.toUpperCase()}</span>
        <div>
          {account.name}
          {notificationPermission !== "unsupported" && (
            <Button variant="outline" onClick={() => void enableNotifications()} disabled={notificationPermission !== "default"}>
              <Bell size={14} />
              {notificationPermission === "granted" ? "Alerts on" : notificationPermission === "denied" ? "Alerts blocked" : "Enable alerts"}
            </Button>
          )}
          <Button variant="ghost" onClick={onLogout}><LogOut size={15} /> Sign out</Button>
        </div>
      </header>
      <main className="department-content">
        <div className="department-heading">
          <div>
            <span className="eyebrow">INCOMING CASES / LIVE</span>
            <h1>{label} desk.</h1>
            <p>Only reports routed to this department are shown. New assigned cases open automatically. Enable browser alerts to hear about cases while this desk is open.</p>
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
