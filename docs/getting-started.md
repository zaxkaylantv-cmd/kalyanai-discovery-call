# Getting Started

This guide gets you running safely in minutes.

## Prerequisites
- Node.js 18+ and npm
- PowerShell or a terminal (WSL2/Command Prompt works too)

## 1) Clone and install
- Copy `.env.example` to `.env` and keep defaults for safe local runs.
- Install deps: `npm ci` (or `npm install` if needed)

## 2) Run tests
- If PowerShell blocks npm, use the helper:
  - `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`
- Otherwise: `npm test`

## 3) Start the server (safe mode)
- Uses `.env` with `DRY_RUN=1` and `ALLOW_NETWORK=0` by default.
- Start via helper: `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1`
- Or: `npm start`

## 4) Verify
- Health: `curl -s http://localhost:3001/health` → `{"status":"ok"}`
- Teams (dry-run):
  `curl -s -H "Content-Type: application/json" -d '{"transcript_url":"mock:hello"}' http://localhost:3001/webhooks/teams`
  → `{"ok":true,"dryRun":true}`

## 5) Develop in VS Code/Visual Studio
- VS Code: `.vscode/launch.json` includes:
  - "Start Server (env from .env)"
  - "Jest Tests"
- Visual Studio / other IDEs: run the same commands in the integrated terminal.

## Moving to real Slack (controlled)
1. Set `DRY_RUN=0` in `.env`
2. Set `ALLOW_NETWORK=1`
3. Set `SLACK_WEBHOOK_URL=<your real webhook>`
4. Restart server and POST a real `transcript_url`

## Notes
- Logs are written to `logs/ingest.jsonl` (git-ignored)
- Env vars in `.env` override local env for convenience
- Do not commit secrets or `.env`
