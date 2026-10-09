# Security policy

RESQNET is a **local demonstration with user and administrator accounts**. Start Uvicorn and Vite on `127.0.0.1`. Compose publishes only loopback ports. Public deployment has not been validated.

Passwords use salted scrypt (N=2^17, r=8, p=1), following the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Session tokens are random, stored as hashes in SQLite, expire after eight hours and are revoked on sign-out. Cookies are HttpOnly and SameSite=Strict. Authenticated writes require a session-bound CSRF header; Origin checks reject untrusted origins. Login and registration are limited to 30 attempts per client IP in 15 minutes. There is no email verification or password recovery service.

The API enforces administrator access to incident intelligence, analytics, review actions and the full case queue. Users can access only their own reports, uploads, alerts and conversations. Seeded and legacy reports stay admin-only. A public registration cannot choose or change its role. Administrator creation requires running the local CLI. Keep `runtime/admin-credentials.txt`, database backups and media private.

Before public deployment, configure TLS and `RESQ_SECURE_COOKIES=true`, a trusted reverse proxy, production session/account management, workload limits, retention policy and an operational threat assessment. CORS and host checks are additional controls, not authentication. The loopback HTTP default deliberately leaves the cookie Secure attribute off.

Uploads are bounded by an 11 MB request cap and 10 MB file cap. Images are decoded, checked against MIME type, resized and re-encoded without metadata. Audio signatures and decodability are checked, with a three-minute duration limit. Filenames are generated UUIDs. Uploaded material is never executed. Images are not analyzed by a vision model.

Reports remain untrusted data inside JSON sent to Ollama. Model output is schema-validated; exact evidence spans are checked and unsupported safety-sensitive claims are replaced with conservative source extraction. This reduces some errors but is not a proof against prompt injection or hallucination. Model summaries remain unverified interpretations.

SQLite transactions preserve atomic review actions. Original source rows are retained. Application logging excludes report bodies. Uvicorn access logs include request paths and record IDs; restrict log access. Media at rest is not encrypted. Audio metadata is retained as source evidence. Abandoned uploads remain local until manually removed or cleaned up.

Nearby Help sends search coordinates and service type to the configured Overpass provider after the user requests a lookup; the report text is not forwarded. Exact search coordinates and facility snapshots persist locally. Geolocation watching is opt-in and stops on leaving the view. Optional responder gateways must be configured by the operator using an authorized HTTPS endpoint for a specific OSM facility ID. Never derive delivery URLs from map data. Synthetic reports cannot be sent. Sending requires explicit consent, has no blind retry, and records uncertain delivery without claiming a station was alerted. Do not store gateway tokens in committed files. See docs/NEARBY-HELP.md for the integration contract and delivery-state limits.

To report a vulnerability, use the published repository's private security advisory feature if enabled, or a maintainer's listed private contact. Do not publish sensitive report data or exploitable details in an issue. No public repository or disclosure inbox has been configured for this local build.
