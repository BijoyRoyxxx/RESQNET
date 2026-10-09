# User and admin portals

Open `http://127.0.0.1:5173/#user` to create a user account or sign in. The user portal provides incident submission, private case history, replies to administrators and Nearby Help. Reports are visible to their owner and authorized administrators. Other users cannot fetch them, even with a report ID or media URL.

Open `http://127.0.0.1:5173/#admin` for administrator sign-in. Create an administrator from the repository root:

```powershell
.\.venv\Scripts\python.exe scripts/create_admin.py --generate
```

The generated email and password are saved to `runtime/admin-credentials.txt`, excluded from Git. The command refuses to overwrite an existing account or credential file. To create another administrator, use `--email other@example.com` without `--generate` and enter a password at the hidden prompt. There are no built-in default passwords.

## Connected workflow

1. A user submits a report and optionally chooses a category or marks immediate danger. The source, extraction, provisional incident and owned case commit together.
2. Emergency Cases lists every source report individually, including reports linked into a common incident. Filter by category, urgency, status or search text. Legacy reports remain admin-only.
3. An administrator assigns the case, sets its category and review priority, and moves it through submitted, acknowledged, in progress and resolved. Each edit requires a shared explanation. Version checks reject stale edits with HTTP 409.
4. The user sees those updates and can reply in the same conversation. Both views fetch saved records every ten seconds while open. This is polling, not a push notification or an external emergency alert.

Immediate danger explicitly declared by a reporter receives critical priority. Multiple extracted risk signals totaling at least 70 also receive critical priority. Source-supported fire/medical reports with a positive risk score receive at least high priority. Other reports retain the existing explained heuristic score. Administrators can override priority with a recorded explanation. Open cases appear before resolved cases; urgency breaks ties, then older reports come first. Synthetic reports carry a DEMO label and cannot be sent to responder gateways.

Case status is the progress of an individual user's report. Incident verification and merge status in the intelligence workspace are separate. An incident merge never grants a user access to other reporters' source material.

## Permanent local storage

The default database is `<repository>/runtime/resq.db`. Relative database/media paths in `.env` resolve against the repository rather than the shell's working directory. SQLite WAL and transactions are enabled. Accounts, hashed passwords, sessions, report ownership, assignments and conversations survive restarts. The portal upgrade adds tables and preserves existing report rows; it does not reset or reseed the database.

Create a consistent backup, including committed WAL data:

```powershell
.\.venv\Scripts\python.exe scripts/backup_database.py
```

Backups are timestamped in `runtime/backups/`; the command checks SQLite integrity. Copy `runtime/media` separately to preserve attachments. Keep backups outside this machine as appropriate. Local persistence does not protect against disk loss, manual deletion or a seed reset.

To restore: stop the backend, keep a backup of the current database and any WAL/SHM files, replace the database with a verified backup, and restore its matching media folder. Do not combine an older database with WAL/SHM files from a different snapshot. Restart the backend. `scripts.seed --reset` deletes accounts and conversations along with other records; use it only on a disposable database.

The public demo is hosted on Render with Supabase PostgreSQL and private file storage. Email delivery, password recovery and actual police/rescue integrations require further setup. No external station is connected by default.

## Location details and solved cases

Emergency Cases displays the report's submitted place and coordinates on each case card. Opening a case shows the saved coordinates with a map link, observation time, and receipt date/time including seconds and the viewer's timezone. Missing values remain explicitly unknown; the interface does not infer a street address or claim GPS verification. New offset-bearing observation timestamps are normalized to UTC before SQLite storage.

Administrators can choose **Mark case solved**, enter the required explanation, and select **Save solved case**. The existing persistent case status and shared messages store the closure, author, and timestamp. **Solved Cases** lists only resolved cases and displays their explanation. The reporter sees the same status and message. Incident Intelligence has been removed from admin navigation and routing.
