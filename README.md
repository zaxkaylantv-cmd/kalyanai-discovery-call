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
