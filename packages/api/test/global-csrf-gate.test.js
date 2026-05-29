/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';

const COOKIE_SECRET = 'test-csrf-gate-secret-with-enough-entropy';
const ALLOWED_ORIGINS = ['http://localhost:3003', 'http://localhost:3004'];

async function importGlobalAuthModules() {
  const globalAuth = await import('../dist/routes/global-auth.js');
  return globalAuth;
}

async function createApp() {
  const { AUTH_SESSION_COOKIE_NAME, registerGlobalAuthHook } = await importGlobalAuthModules();
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie, { secret: COOKIE_SECRET });
  registerGlobalAuthHook(app, {
    verifyPrimaryUserId: (userId) => userId === 'user-1',
    allowedBrowserOrigins: ALLOWED_ORIGINS,
  });

  app.post('/api/messages', async () => ({ ok: true, route: 'messages' }));
  app.post('/api/logout', async () => ({ ok: true, route: 'logout' }));
  app.post('/api/threads/read/mark-all', async () => ({ ok: true, route: 'mark-all' }));
  app.put('/api/settings', async () => ({ ok: true, route: 'settings' }));
  app.delete('/api/threads/123', async () => ({ ok: true, route: 'delete-thread' }));
  app.get('/api/threads', async () => ({ ok: true, route: 'list-threads' }));

  app.post('/api/callbacks/hook', async () => ({ ok: true, route: 'callback' }));
  app.get('/api/islogin', async () => ({ ok: true, route: 'islogin' }));

  await app.ready();
  return { app, AUTH_SESSION_COOKIE_NAME };
}

function cookieHeader(app, cookieName, userId) {
  return `${cookieName}=${app.signCookie(userId)}`;
}

describe('global CSRF gate', () => {
  let app;
  let AUTH_SESSION_COOKIE_NAME;

  afterEach(async () => {
    await app?.close();
  });

  test('rejects POST with evil Origin and valid cookie', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        origin: 'https://evil.example',
      },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.json().error, /Origin not allowed/);
  });

  test('rejects PUT with evil Origin and valid cookie', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      payload: { theme: 'dark' },
    });
    assert.equal(res.statusCode, 403);
  });

  test('rejects DELETE with evil Origin and valid cookie', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/threads/123',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        origin: 'https://evil.example',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  test('rejects cross-site Sec-Fetch-Site without Origin', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        'sec-fetch-site': 'cross-site',
      },
    });
    assert.equal(res.statusCode, 403);
    assert.match(res.json().error, /Cross-site/);
  });

  test('allows POST with allowed Origin and valid cookie', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        origin: 'http://localhost:3003',
      },
    });
    assert.equal(res.statusCode, 200);
  });

  test('allows POST without Origin (non-browser client)', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/threads/read/mark-all',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
      },
    });
    assert.equal(res.statusCode, 200);
  });

  test('allows GET with evil Origin (CSRF only blocks unsafe methods)', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        origin: 'https://evil.example',
      },
    });
    assert.equal(res.statusCode, 200);
  });

  test('callback routes bypass CSRF gate entirely', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/hook',
      headers: {
        origin: 'https://external-service.example',
      },
    });
    assert.equal(res.statusCode, 200);
  });

  test('unauthenticated requests hit 401 before CSRF gate', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: {
        origin: 'https://evil.example',
      },
    });
    assert.equal(res.statusCode, 401);
  });

  test('rejects Referer-derived evil origin', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        referer: 'https://evil.example/page',
      },
    });
    assert.equal(res.statusCode, 403);
  });

  test('allows Referer-derived allowed origin', async () => {
    ({ app, AUTH_SESSION_COOKIE_NAME } = await createApp());
    const res = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        referer: 'http://localhost:3003/some/page',
      },
    });
    assert.equal(res.statusCode, 200);
  });
});
