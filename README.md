# Automation Starter (Node.js)

## Prerequisites
- Node.js 16+ and npm

## Setup
1. Copy `.env.example` to `.env` and adjust values.
2. Install dependencies: `npm install`

## Run
- `npm start` — loads `.env`, starts HTTP server on `PORT` (default 3000).
- Health check: `GET http://localhost:3000/health` → `200 {"status":"ok"}`

## Test
- `npm test` — runs Jest test suite.

## Notes
- Logging: Pino via `pino-http` middleware. Adjust `LOG_LEVEL` in `.env`.
- Structure:
  - `src/index.js` — bootstrap (dotenv + start server)
  - `src/server.js` — Express app with routes/middleware
  - `src/logger.js` — Pino logger
- `tests/` — Jest tests

## Safe Local Behavior
- `DRY_RUN=1`: skip network and acknowledge webhook with `{ "ok": true, "dryRun": true }`; still logs to `logs/ingest.jsonl`.
- `ALLOW_NETWORK=1`: enable outbound HTTP. Without this, real URLs are rejected with `400 { "error": "network_disabled" }`.
- Use `mock:` URLs for offline/local testing (e.g., transcript `mock:Hello`, Slack `mock:slack`).

## Visual Studio/VS Code Quickstart
- Install Node 18+ and npm. If PowerShell blocks `npm`, either run from Command Prompt, or use provided scripts.
- Run tests without npm: `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`
- Start server without npm: `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1`
- VS Code debugging: use the "Start Server (env from .env)" or "Jest Tests" launch configs in `.vscode/launch.json`.

## Curl Examples
- Health: `curl -s http://localhost:3001/health`
- Dry-run webhook: `curl -s -H "Content-Type: application/json" -d '{"transcript_url":"mock:hello"}' http://localhost:3001/webhooks/teams`

## Move to Real Slack
1. Set `DRY_RUN=0` in `.env`
2. Set `ALLOW_NETWORK=1`
3. Set `SLACK_WEBHOOK_URL=<your real URL>`
4. Restart server and POST a real `transcript_url`
