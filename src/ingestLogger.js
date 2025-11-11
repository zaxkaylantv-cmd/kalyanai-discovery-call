const fs = require('fs');
const path = require('path');

function appendIngestEvent(event) {
  const baseDir = process.env.LOGS_DIR || path.join('logs');
  const filePath = path.join(baseDir, 'ingest.jsonl');
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(filePath, line, { encoding: 'utf8' });
  } catch (err) {
    // Swallow logging errors to avoid breaking ingestion
    // eslint-disable-next-line no-console
    if (process.env.NODE_ENV !== 'test') {
      console.warn('Failed to write ingest log:', err && err.message);
    }
  }
}

module.exports = { appendIngestEvent };

