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

No hosting provider, account, paid plan or production domain has been selected yet. The repository is prepared for deployment but is not currently deployed.
