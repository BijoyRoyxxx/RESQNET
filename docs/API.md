# API reference

Base URL: `http://127.0.0.1:8000`. OpenAPI is available at `/openapi.json`, with interactive documentation at `/docs`. Login/register return an HttpOnly session cookie and a `csrf` token. Include the cookie and `X-CSRF-Token` header for authenticated writes. Health and login/registration are public. All other endpoints require authentication; bulk reports, incidents, analytics and review operations require an administrator. Individual reports, media and alerts require ownership or administrator access.

| Method | Portal path | Behavior |
| --- | --- | --- |
| POST | `/api/auth/register` | `name`, `email`, `password` (12–128 characters); always creates a user. |
| POST | `/api/auth/login` | `email`, `password`; starts an eight-hour session. |
| GET | `/api/auth/session` | Current account and CSRF token. |
| POST | `/api/auth/logout` | Revokes current session. |
| GET | `/api/portal/reports` | Only reports owned by the current account, with case status and messages. |
| POST | `/api/portal/reports/{id}/messages` | Shared case message with `body` (3–2000 characters); owner/admin only. |
| GET | `/api/admin/cases` | Individual source reports sorted by open status, urgency, then oldest first. |
| GET | `/api/admin/accounts` | Administrator accounts available for assignment. |
| PATCH | `/api/admin/cases/{id}` | `version`, `category`, `status`, `urgency` (null for automatic), `assigned_to` (nullable account ID), and required `body`. Stale version returns 409. |

Report submission also accepts optional `category` and `immediate_danger`. Categories: crime, medical, fire, flood, infrastructure, unknown. Case statuses: submitted, acknowledged, in_progress, resolved. Urgency levels: critical, high, medium, low. Case category/status are individual workflow fields; incident-level review metadata remains separate. Idempotency keys are scoped to the submitting account.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/reports` | Validate, extract, suggest matches, create source report and provisional incident. Returns 201, or 200 for an idempotent replay. |
| GET | `/api/reports?limit=100&offset=0` | Source reports, extractions, media and associations. Maximum page size 500. |
| GET | `/api/reports/{id}` | Full original report and actual extraction provenance. |
| POST | `/api/reports/{id}/verification` | Mark `verified` or `needs_verification` with a reason. |
| POST | `/api/reports/{id}/separate` | Move one report from a multi-report incident into a new incident. |
| POST | `/api/reports/{id}/transcribe` | Transcribe the report's first attached audio. Source text is never overwritten. |
| GET | `/api/incidents` | Nonmerged incidents with current priority and report counts. |
| GET | `/api/incidents/{id}` | Incident, associated sources and review history. |
| GET | `/api/incidents/{id}/evidence` | Incident detail plus matching evidence. |
| PATCH | `/api/incidents/{id}` | Correct category, summary, location, coordinates or review status. Requires reason. |
| POST | `/api/incidents/{id}/merge` | Move all reports to `target_id`; preserve source incident and audit event. |
| GET | `/api/matches?status=pending` | Enriched match suggestions. Use `status=all` for reviewed suggestions. |
| POST | `/api/matches/{id}/approve` | Atomically link report; supersede competing suggestions. Requires reason. |
| POST | `/api/matches/{id}/reject` | Preserve report association; record rejection and reason. |
| POST | `/api/media` | Multipart field `file`; validate image/audio and return a media ID. |
| GET | `/api/media/{id}` | Serve validated evidence with `nosniff`. |
| POST | `/api/media/{id}/transcribe?language=bn` | Editable draft transcript from live Faster-Whisper. Language can be en, bn, hi or omitted. |
| GET | `/api/analytics/summary` | Counts, distributions, hourly receipt volume, actual engine usage and activity. |
| GET | `/api/health` | DB connectivity, Ollama availability, selected mode and voice configuration. |

Example report body:

```json
{
  "text": "Flooding near Barasat station. 2 people trapped. Rescue requested.",
  "language": "en",
  "location_text": "Barasat",
  "latitude": 22.7229,
  "longitude": 88.4806,
  "occurred_at": "2026-10-08T08:00:00+05:30",
  "synthetic": true,
  "media_ids": []
}
```

Supply `Idempotency-Key: <unique-string>` for retries. Reusing the same key with different content returns 409. Omit unknown values or use null. Coordinates must be supplied as a pair. The timestamp must contain a timezone and cannot be in the future. Report text is 8 to 10,000 characters; at most four media IDs and ten assistance labels are accepted.

Review payload: `{"reason":"Source location and time agree"}`. Merge adds `target_id`. Verification adds `status`. Incident corrections include only changed fields plus reason. Valid incident statuses: `unreviewed`, `verified`, `monitoring`, `resolved`.

Error responses follow `{"error":{"code":"validation","message":"Check the submitted fields","issues":[{"field":"body.latitude","message":"..."}]}}`. Domain errors use 404 for missing records, 409 for reviewed/conflicting operations, 413 for oversized media, 415 for unsupported formats, 422 for invalid input, 429 for a busy transcriber and 503 for unavailable transcription. Request validation errors deliberately omit original report content.

Images: JPEG, PNG, WebP, up to 10 MB and 20 million decoded pixels, normalized to JPEG up to 2400 pixels per side. Audio: WAV, MP3, M4A, Ogg, WebM, FLAC, up to 10 MB and three minutes, decoded before storage. An 11 MB request cap includes chunked bodies. Voice dependencies are required to validate audio containers, even when live speech inference is disabled.

Priority and matching confidence are heuristic scores, not calibrated probabilities. Incident corrections do not overwrite original extraction results. Previously generated match factors are historical snapshots; a reviewer should reject stale suggestions after material source corrections.
