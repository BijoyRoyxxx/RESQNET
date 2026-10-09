# Deploy RESQNET

The repository contains a FastAPI backend and a React frontend. The existing Docker Compose file is for local use: both published ports bind to loopback. GitHub Pages alone cannot run this application.

## Production configuration

- Serve the frontend and `/api/` from the same HTTPS origin. The supplied Nginx configuration already proxies `/api/` to the backend service.
- Set `RESQ_SECURE_COOKIES=true`.
- Set `RESQ_CORS_ORIGINS` to a JSON list containing the exact frontend origin, including `https://`. This also controls accepted write origins.
- For direct backend hosting, add the service hostname to `RESQ_ALLOWED_HOSTS`. Do not use a wildcard. The existing internal Nginx proxy sends `Host: backend`, which is included in the defaults.
- Attach persistent storage for the SQLite database and uploaded media. Set `RESQ_DATABASE_URL` and `RESQ_MEDIA_DIR` to paths on that storage. Use one backend instance with SQLite.
- Create a new administrator using `python -m scripts.create_admin --email YOUR_EMAIL --name YOUR_NAME` in the deployed backend shell. The local administrator account is not included in GitHub.
- Use `RESQ_AI_MODE=rules` unless an actual reachable Ollama service is configured. A cloud deployment cannot reach the developer laptop's localhost. Voice transcription is optional and requires the separate voice dependencies.

Start with an empty database. Importing existing private reports and attachments requires a separate, deliberate migration. Do not put the local `.env`, credential files or `runtime/` directory in GitHub or a build image.

## Release checks

Verify HTTPS, `/api/health`, registration and login, a private report submission, admin updates, and data surviving a backend restart. Inspect the hosting logs for database/media permission errors. Configure volume backups before relying on persisted reports.

## Zero-cost hosting requirement

The owner requires free services only. The former paid Render Blueprint has been removed. Do not activate paid compute, paid disks, trials that convert to paid subscriptions, or metered overages.

The free deployment uses Render Free for the bundled frontend/API and Supabase Free for PostgreSQL and private uploaded-file storage. PostgreSQL is reached through Supabase's IPv4 shared session pooler. Files are served through the API from a private Supabase Storage bucket, so report ownership and access checks stay in RESQNET. The current local SQLite/file configuration must not be deployed on Render Free: its filesystem is ephemeral.

The root Dockerfile and `backend.cloud` can serve the frontend and API from one origin. No separate frontend host or purchased domain is required. Cloud text processing uses deterministic rules unless a separately available free inference service is configured. The developer laptop's Ollama service is not cloud hosting.

Free tiers have limits: Render sleeps after inactivity, and Supabase may pause inactive projects. This is a demonstration hosting option, not a continuously available emergency-response service. Stay on the free plans when quotas are reached rather than automatically upgrading.

The Supabase project and private 10 MB `resqnet-private` bucket have been created on the Free organization. The runtime integration is prepared in `backend.cloud`, `backend.media`, and `render.yaml`. Deployment still needs the Supabase Postgres session connection string, a server-only storage key, and Render's GitHub authorization to be set as secrets. No paid service has been activated.

References: https://render.com/docs/free and https://supabase.com/docs/guides/platform/billing-on-supabase.
