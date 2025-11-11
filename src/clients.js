const { URL } = require('url');
const https = require('https');
const http = require('http');
const { withExponentialBackoff } = require('./utils/retry');

function httpRequest(method, urlString, body) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try {
      urlObj = new URL(urlString);
    } catch (e) {
      return reject(e);
    }
    const mod = urlObj.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search || ''}`,
      headers: body
        ? {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
          }
        : {},
    };
    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, text });
        } else {
          const err = new Error(`HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = text;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function downloadTranscript(url, options = {}) {
  const { retries = 2, baseMs = 50, factor = 2 } = options;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Invalid URL');
  }
  return withExponentialBackoff(
    async () => {
      if (url.startsWith('mock:')) {
        return url.slice('mock:'.length);
      }
      if (process.env.ALLOW_NETWORK !== '1') {
        throw new Error('Network disabled. Use mock: URLs in tests.');
      }
      const res = await httpRequest('GET', url);
      return res.text;
    },
    { retries, baseMs, factor }
  );
}

async function postToSlack(webhookUrl, payload, options = {}) {
  const { retries = 3, baseMs = 100, factor = 2 } = options;
  const body = JSON.stringify(payload || {});
  if (typeof webhookUrl !== 'string' || webhookUrl.length === 0) {
    const err = new Error('Missing Slack webhook URL');
    err.statusCode = 500;
    throw err;
  }
  return withExponentialBackoff(
    async () => {
      if (webhookUrl.startsWith('mock:')) {
        if (webhookUrl.startsWith('mock:fail')) {
          const err = new Error('Mock Slack failure');
          err.statusCode = 502;
          throw err;
        }
        return { ok: true };
      }
      if (process.env.ALLOW_NETWORK !== '1') {
        throw new Error('Network disabled. Mock postToSlack in tests.');
      }
      await httpRequest('POST', webhookUrl, body);
      return { ok: true };
    },
    { retries, baseMs, factor }
  );
}

module.exports = { downloadTranscript, postToSlack };
