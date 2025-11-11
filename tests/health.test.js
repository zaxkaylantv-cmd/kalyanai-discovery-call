const request = require('supertest');
const app = require('../src/server');

describe('/health', () => {
  it('returns 200 and JSON', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
