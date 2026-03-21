'use strict';

const request = require('supertest');

// Load app without starting the server (app.js exports the express instance)
const app = require('../../src/app');

describe('GET /', () => {
  it('responds 200 with the login page HTML', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('GET /login', () => {
  it('responds 200', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('Protected routes redirect unauthenticated users', () => {
  it('GET /campaigns redirects to /', async () => {
    const res = await request(app).get('/campaigns');
    expect([302, 401]).toContain(res.status);
  });

  it('GET /dashboard redirects unauthenticated users', async () => {
    const res = await request(app).get('/dashboard');
    expect([302, 401]).toContain(res.status);
  });
});

describe('GET /api/me unauthenticated', () => {
  it('returns non-200 for unauthenticated request', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).not.toBe(200);
  });
});
