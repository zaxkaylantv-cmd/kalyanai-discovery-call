# Discovery Call Backend

Express service that ingests discovery call recordings, generates prep/plan outputs, and serves data to the Discovery UI.

## Run locally
- Install dependencies: `npm install`
- Start the server: `npm start` (entrypoint `src/index.js`; honours `PORT`, defaults to `3001`)

## Safe local behaviour
- Use `DRY_RUN=1` to skip external side effects during local testing.
- Set `ALLOW_NETWORK=1` only when you need outbound calls.
- Prefer `mock:` URLs where available to avoid hitting real services.

## API endpoints used by the frontend
- `GET /health`
- `GET /jobs`
- `GET /jobs/:id`
- `POST /process-file`
- `GET /settings`
- `GET /precall-plans`
- `GET /precall-plans/:id`
- `POST /precall-prep`
- `POST /postcall-coaching`
- `POST /ai-checklist-coverage`
- `GET /calls/:id/checklist-coverage`

## Deployment notes
- Serve behind nginx (or similar) and proxy a frontend path such as `/api` to this service; avoid hardcoded IPs.
- Ensure `PORT` is set if you need a non-default port.

## Operational guardrails
- Do not commit secrets; keep environment values in a local `.env` and provide `.env.example` only.
- Do not commit database changes (e.g., `data/*.sqlite`); take backups before schema or data edits.
- Avoid risky edits to data or configs without backups.
