const express = require('express');
const pinoHttp = require('pino-http');
const logger = require('./logger');
const { summarizeTranscript } = require('./summarizer');
const { downloadTranscript, postToSlack } = require('./clients');
const { appendIngestEvent } = require('./ingestLogger');

const app = express();
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/webhooks/teams', async (req, res) => {
  try {
    const { transcript_url: transcriptUrl } = req.body || {};
    if (!transcriptUrl || typeof transcriptUrl !== 'string') {
      return res.status(400).json({ error: 'invalid_input', message: 'Expected transcript_url string' });
    }

    const retryBaseMs = Number(process.env.RETRY_BASE_MS || 50);

    // Safe mode: dry run short-circuit
    if (process.env.DRY_RUN === '1') {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        dryRun: true,
      });
      return res.status(200).json({ ok: true, dryRun: true });
    }

    // Gate network usage for non-mock URLs
    const isMockTranscript = typeof transcriptUrl === 'string' && transcriptUrl.startsWith('mock:');
    if (!isMockTranscript && process.env.ALLOW_NETWORK !== '1') {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        error: 'network_disabled',
        message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP',
      });
      return res.status(400).json({ error: 'network_disabled', message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP' });
    }

    // 1) Download transcript (supports mock: scheme for tests/offline)
    const transcript = await downloadTranscript(transcriptUrl, { baseMs: retryBaseMs });

    // 2) Summarize (placeholder)
    const summary = summarizeTranscript(transcript);

    // 3) Post to Slack
    const webhookUrl = process.env.SLACK_WEBHOOK_URL || '';
    if (!webhookUrl) {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        summary,
        error: 'missing_slack_webhook',
      });
      return res.status(400).json({ error: 'missing_slack_webhook' });
    }
    const isMockWebhook = webhookUrl.startsWith('mock:');
    if (!isMockWebhook && process.env.ALLOW_NETWORK !== '1') {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        summary,
        error: 'network_disabled',
        message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP',
      });
      return res.status(400).json({ error: 'network_disabled', message: 'Set ALLOW_NETWORK=1 to enable outbound HTTP' });
    }
    try {
      await postToSlack(webhookUrl, { text: summary }, { baseMs: retryBaseMs });
    } catch (err) {
      appendIngestEvent({
        ts: new Date().toISOString(),
        source: 'teams',
        transcript_url: transcriptUrl,
        summary,
        slack: { ok: false, error: err && err.message },
      });
      return res.status(502).json({ error: 'slack_post_failed' });
    }

    appendIngestEvent({
      ts: new Date().toISOString(),
      source: 'teams',
      transcript_url: transcriptUrl,
      summary,
      slack: { ok: true },
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    req.log.error({ err: e }, 'Unhandled error in /webhooks/teams');
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = app;
