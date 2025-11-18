const https = require('https');

function ensureAccessToken() {
  const token = process.env.DROPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Configure DROPBOX_ACCESS_TOKEN to access Dropbox APIs');
  }
  return token;
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(Buffer.concat(chunks));
        } else {
          const err = new Error(`Dropbox HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = Buffer.concat(chunks).toString('utf8');
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function downloadFile(pathLower, options = {}) {
  if (!pathLower) {
    throw new Error('Dropbox path_lower is required');
  }
  if (options.mockBuffer) {
    return Buffer.from(options.mockBuffer);
  }
  const token = ensureAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Dropbox-API-Arg': JSON.stringify({ path: pathLower }),
  };
  const requestOptions = {
    method: 'POST',
    hostname: 'content.dropboxapi.com',
    path: '/2/files/download',
    headers,
  };
  return httpsRequest(requestOptions);
}

module.exports = { downloadFile };
