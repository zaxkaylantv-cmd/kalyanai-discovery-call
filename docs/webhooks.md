# Webhooks

## Teams Ingest

- Endpoint: `POST /webhooks/teams`
- Body: `{ "transcript_url": "..." }`
- Behavior:
  - If `DRY_RUN=1`: skips network and returns `200 {"ok":true,"dryRun":true}` (still appends an event).
  - Supports `mock:` URLs for offline/tests (e.g. `mock:This is the transcript text`).
  - With network enabled (`ALLOW_NETWORK=1`): downloads transcript, summarizes, and posts to Slack.
  - With network disabled (default): real URLs are rejected with clear 400 guidance.
  - Always appends an event to `logs/ingest.jsonl` (one JSON per line) and creates `logs/` if missing.
  - Retries outbound HTTP with exponential backoff for real network operations.

### Errors
- `400 {"error":"invalid_input"}` when body is missing/invalid.
- `400 {"error":"missing_slack_webhook"}` when not in dry-run and `SLACK_WEBHOOK_URL` is unset.
- `400 {"error":"network_disabled"}` when using real URLs and `ALLOW_NETWORK` is not `1`.
- `502 {"error":"slack_post_failed"}` when Slack posting fails after retries.

### Env Vars
- `DRY_RUN` (default `0`; set to `1` to skip network and just acknowledge)
- `ALLOW_NETWORK` (default `0`; set to `1` to enable outbound HTTP)
- `SLACK_WEBHOOK_URL` (use `mock:slack` or `mock:fail` in tests)
- `RETRY_BASE_MS` (default 50)
