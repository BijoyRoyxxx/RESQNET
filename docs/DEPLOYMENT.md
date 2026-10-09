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

## Prepared Render deployment

`render.yaml` defines one Docker web service in Singapore, with the 0.5 CPU / 512 MB paid plan and a 1 GB persistent disk. The root Dockerfile bundles the built frontend with FastAPI. `backend.cloud` serves both on one origin and configures the exact Render hostname automatically. No separate frontend hosting is needed. Automatic deploys are off.

This is an initial small demonstration deployment. Cloud text processing starts in deterministic rules mode; local Ollama and voice transcription are not deployed. Higher traffic or AI inference needs a larger instance and separate configuration.

After approving hosting charges, sign into Render and create a Blueprint from `BijoyRoyxxx/RESQNET`. Grant the GitHub integration access to this repository, review the service and disk charges, then deploy. Create the production administrator in the service shell with the command above. The site starts with an empty database.

The configuration has been prepared, but no paid service has been activated and no live deployment URL exists yet.
