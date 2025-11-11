const request = require('supertest');
const app = require('../src/server');

describe('/webhooks/teams', () => {
  beforeEach(() => {
    process.env.DRY_RUN = '';
    process.env.ALLOW_NETWORK = '';
    process.env.SLACK_WEBHOOK_URL = 'mock:slack';
    process.env.RETRY_BASE_MS = '1';
  });

  it('returns 400 on bad input', async () => {
    const res = await request(app).post('/webhooks/teams').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_input');
  });

  it('handles success flow', async () => {
    const body = { transcript_url: 'mock:Hello from Teams meeting transcript.' };
    const res = await request(app).post('/webhooks/teams').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('surfaces Slack failure after retries with 502', async () => {
    process.env.SLACK_WEBHOOK_URL = 'mock:fail';
    const body = { transcript_url: 'mock:Some content' };
    const res = await request(app).post('/webhooks/teams').send(body);
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('slack_post_failed');
  });

  it('returns 200 dry-run without network', async () => {
    process.env.DRY_RUN = '1';
    delete process.env.SLACK_WEBHOOK_URL;
    const res = await request(app).post('/webhooks/teams').send({ transcript_url: 'http://example.com/foo' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, dryRun: true });
  });

  it('returns 400 when missing webhook in non-dry-run', async () => {
    process.env.DRY_RUN = '';
    delete process.env.SLACK_WEBHOOK_URL;
    const res = await request(app).post('/webhooks/teams').send({ transcript_url: 'mock:content' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('missing_slack_webhook');
  });

  it('returns 400 when network is disallowed for real URLs', async () => {
    process.env.ALLOW_NETWORK = '';
    process.env.SLACK_WEBHOOK_URL = 'http://example.com/webhook';
    const res = await request(app).post('/webhooks/teams').send({ transcript_url: 'http://example.com/transcript' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('network_disabled');
  });
});
