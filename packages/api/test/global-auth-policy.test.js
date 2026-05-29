/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';

const COOKIE_SECRET = 'test-cookie-secret-with-enough-entropy';

async function importGlobalAuthModules() {
  const [globalAuth, authPolicy, requestIdentity] = await Promise.all([
    import('../dist/routes/global-auth.js'),
    import('../dist/routes/auth-policy.js'),
    import('../dist/utils/request-identity.js'),
  ]);
  return { ...globalAuth, ...authPolicy, ...requestIdentity };
}

async function createApp(options = {}) {
  const {
    skipAuth = false,
    validUsers = new Set(['user-1']),
    bearerUsers = new Map(),
  } = options;
  const {
    AUTH_SESSION_COOKIE_NAME,
    registerGlobalAuthHook,
    resolveTrustedUserId,
    resolveUserId,
  } = await importGlobalAuthModules();
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie, { secret: COOKIE_SECRET });
  registerGlobalAuthHook(app, {
    isSkipAuthEnabled: () => skipAuth,
    verifyPrimaryUserId: (userId) => validUsers.has(userId),
    resolveBearerUserId: (request) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) return null;
      return bearerUsers.get(authorization.slice(7).trim()) ?? null;
    },
  });

  app.get('/api/islogin', async () => ({ ok: true, route: 'islogin' }));
  app.post('/api/login/callback', async () => ({ ok: true, route: 'login-callback' }));
  app.post('/api/login/invitation', async () => ({ ok: true, route: 'login-invitation' }));
  app.get('/api/curversion', async () => ({ ok: true, route: 'curversion' }));
  app.get('/api/experts', async () => ({ ok: true, route: 'experts' }));
  app.post('/api/threads/thread-1/experts/expert-design/invite', async () => ({ ok: true, route: 'expert-invite' }));
  app.get('/health', async () => ({ ok: true, route: 'health' }));

  app.get('/api/threads', async (request) => ({
    ok: true,
    route: 'threads',
    authenticatedUserId: request.authenticatedUserId,
    resolvedUserId: resolveUserId(request),
    trustedUserId: resolveTrustedUserId(request),
  }));
  app.get('/api/evidence/search', async () => ({ ok: true, route: 'evidence-search' }));
  app.post('/api/reflect', async () => ({ ok: true, route: 'reflect' }));
  app.get('/api/threads/:threadId/sessions', async () => ({ ok: true, route: 'thread-sessions' }));
  app.get('/api/threads/:threadId/sessions/search', async () => ({ ok: true, route: 'thread-sessions-search' }));
  app.get('/api/sessions/:sessionId/events', async () => ({ ok: true, route: 'session-events' }));
  app.get('/api/sessions/:sessionId/digest', async () => ({ ok: true, route: 'session-digest' }));
  app.get('/api/sessions/:sessionId/invocations/:invocationId', async () => ({ ok: true, route: 'invocation-detail' }));
  app.get('/api/threads/:threadId', async () => ({ ok: true, route: 'thread-detail' }));
  app.delete('/api/threads/:threadId', async () => ({ ok: true, route: 'thread-delete' }));
  app.post('/api/sessions/:sessionId/unseal', async () => ({ ok: true, route: 'session-unseal' }));
  app.get('/api/sessions/:sessionId', async () => ({ ok: true, route: 'session-detail' }));
  app.get('/uploads/example.png', async (request) => ({
    ok: true,
    route: 'uploads',
    authenticatedUserId: request.authenticatedUserId,
  }));
  app.post('/api/callbacks/post-message', async () => ({ ok: true, route: 'callbacks' }));
  app.post('/api/callback/limb/list', async () => ({ ok: true, route: 'callback-limb' }));
  app.post('/api/limb/register', async () => ({ ok: true, route: 'limb' }));
  app.post('/api/schedule/tasks/preview', async () => ({ ok: true, route: 'schedule-preview' }));

  await app.ready();
  return { app, AUTH_SESSION_COOKIE_NAME };
}

function cookieHeader(app, cookieName, userId) {
  return `${cookieName}=${app.signCookie(userId)}`;
}

describe('global cookie auth policy', () => {
  afterEach(() => {
    delete process.env.CAT_CAFE_SKIP_AUTH;
    delete process.env.OFFICE_CLAW_SKIP_AUTH;
  });

  test('policy keeps only login/status/version/health paths whitelisted', async () => {
    const { isAuthWhitelisted, isCallbackAuthBypassRoute } = await importGlobalAuthModules();

    assert.equal(isAuthWhitelisted('/api/islogin'), true);
    assert.equal(isAuthWhitelisted('/api/login/callback'), true);
    assert.equal(isAuthWhitelisted('/api/login/invitation'), true);
    assert.equal(isAuthWhitelisted('/api/curversion'), true);
    assert.equal(isAuthWhitelisted('/health'), true);

    assert.equal(isAuthWhitelisted('/api/uploads/example.png'), false);
    assert.equal(isAuthWhitelisted('/uploads/example.png'), false);
    assert.equal(isAuthWhitelisted('/api/connector-media/example.png'), false);
    assert.equal(isAuthWhitelisted('/api/tts/audio/example.wav'), false);
    assert.equal(isAuthWhitelisted('/api/threads'), false);

    assert.equal(isCallbackAuthBypassRoute('/api/callbacks/post-message'), true);
    assert.equal(isCallbackAuthBypassRoute('/api/callback/limb/list'), true);
    assert.equal(isCallbackAuthBypassRoute('/api/limb/register'), true);
    assert.equal(isCallbackAuthBypassRoute('/api/threads'), false);
  });

  test('requires a valid signed cookie for browser API routes', async () => {
    const { app, AUTH_SESSION_COOKIE_NAME } = await createApp();

    const missingCookie = await app.inject({ method: 'GET', url: '/api/threads' });
    assert.equal(missingCookie.statusCode, 401);

    const forgedCookie = await app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=forged` },
    });
    assert.equal(forgedCookie.statusCode, 401);

    const validCookie = await app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: { cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1') },
    });
    assert.equal(validCookie.statusCode, 200);
    assert.equal(validCookie.json().authenticatedUserId, 'user-1');
    assert.equal(validCookie.json().resolvedUserId, 'user-1');
    assert.equal(validCookie.json().trustedUserId, 'user-1');

    await app.close();
  });

  test('allows requests with a valid bearer session without a cookie', async () => {
    const { app } = await createApp({ bearerUsers: new Map([['session-1', 'user-1']]) });

    const response = await app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: { authorization: 'Bearer session-1' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().authenticatedUserId, 'user-1');
    assert.equal(response.json().resolvedUserId, 'user-1');
    await app.close();
  });

  test('rejects browser identity headers that conflict with the signed cookie', async () => {
    const { app, AUTH_SESSION_COOKIE_NAME } = await createApp();

    const response = await app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: {
        cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1'),
        'x-office-claw-user': 'user-2',
      },
    });

    assert.equal(response.statusCode, 403);
    await app.close();
  });

  test('allows cookie-only browser requests for embedded media scenarios', async () => {
    const { app, AUTH_SESSION_COOKIE_NAME } = await createApp();

    const response = await app.inject({
      method: 'GET',
      url: '/uploads/example.png',
      headers: { cookie: cookieHeader(app, AUTH_SESSION_COOKIE_NAME, 'user-1') },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().authenticatedUserId, 'user-1');
    await app.close();
  });

  test('does not exempt uploads or media routes without a cookie', async () => {
    const { app } = await createApp();

    const response = await app.inject({ method: 'GET', url: '/uploads/example.png' });

    assert.equal(response.statusCode, 401);
    await app.close();
  });

  test('allows whitelisted and callback routes without a cookie', async () => {
    const { app } = await createApp();

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/islogin' }),
      app.inject({ method: 'POST', url: '/api/login/callback' }),
      app.inject({ method: 'POST', url: '/api/login/invitation' }),
      app.inject({ method: 'GET', url: '/api/curversion' }),
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'POST', url: '/api/callbacks/post-message' }),
      app.inject({ method: 'POST', url: '/api/callback/limb/list' }),
      app.inject({ method: 'POST', url: '/api/limb/register' }),
    ]);

    assert.deepEqual(responses.map((response) => response.statusCode), [200, 200, 200, 200, 200, 200, 200, 200]);
    await app.close();
  });

  test('does not whitelist expert routes', async () => {
    const { app } = await createApp();

    const [catalogResponse, mutationResponse] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/experts' }),
      app.inject({ method: 'POST', url: '/api/threads/thread-1/experts/expert-design/invite' }),
    ]);

    assert.equal(catalogResponse.statusCode, 401);
    assert.equal(mutationResponse.statusCode, 401);
    await app.close();
  });

  test('preserves shared scheduler callback routes for route-level machine auth', async () => {
    const { app } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks/preview',
      payload: { invocationId: 'inv-1', callbackToken: 'token-1' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().route, 'schedule-preview');
    await app.close();
  });

  test('CAT_CAFE_SKIP_AUTH disables the global auth gate', async () => {
    const { app } = await createApp({ skipAuth: true });

    const response = await app.inject({ method: 'GET', url: '/api/threads' });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().authenticatedUserId, null);
    await app.close();
  });

  test('isMcpInternalRoute allows exact MCP patterns and rejects adjacent paths', async () => {
    const { isMcpInternalRoute } = await importGlobalAuthModules();
    const req = (method, url) => ({ method, url });

    // Allowed: evidence endpoints (GET)
    assert.equal(isMcpInternalRoute(req('GET', '/api/evidence/search?q=test')), true);
    assert.equal(isMcpInternalRoute(req('GET', '/api/evidence/status')), true);

    // Allowed: reflect (POST only)
    assert.equal(isMcpInternalRoute(req('POST', '/api/reflect')), true);

    // Allowed: exact session-chain GET patterns
    assert.equal(isMcpInternalRoute(req('GET', '/api/threads/t1/sessions')), true);
    assert.equal(isMcpInternalRoute(req('GET', '/api/threads/t1/sessions/search')), true);
    assert.equal(isMcpInternalRoute(req('GET', '/api/sessions/s1/events')), true);
    assert.equal(isMcpInternalRoute(req('GET', '/api/sessions/s1/digest')), true);
    assert.equal(isMcpInternalRoute(req('GET', '/api/sessions/s1/invocations/inv1')), true);

    // Rejected: unsafe methods on session-chain routes
    assert.equal(isMcpInternalRoute(req('DELETE', '/api/threads/t1/sessions')), false);
    assert.equal(isMcpInternalRoute(req('POST', '/api/sessions/s1/unseal')), false);
    assert.equal(isMcpInternalRoute(req('PATCH', '/api/threads/t1/sessions/a1/bind')), false);

    // Rejected: GET on adjacent non-MCP paths
    assert.equal(isMcpInternalRoute(req('GET', '/api/threads/t1')), false);
    assert.equal(isMcpInternalRoute(req('GET', '/api/threads')), false);
    assert.equal(isMcpInternalRoute(req('GET', '/api/sessions/s1')), false);

    // Rejected: wrong method on evidence/reflect
    assert.equal(isMcpInternalRoute(req('GET', '/api/reflect')), false);
    assert.equal(isMcpInternalRoute(req('POST', '/api/evidence/search')), false);
  });

  test('MCP internal routes bypass auth; adjacent routes still require auth', async () => {
    const { app } = await createApp();

    const allowed = await Promise.all([
      app.inject({ method: 'GET', url: '/api/evidence/search?q=test' }),
      app.inject({ method: 'POST', url: '/api/reflect', payload: {} }),
      app.inject({ method: 'GET', url: '/api/threads/t1/sessions' }),
      app.inject({ method: 'GET', url: '/api/threads/t1/sessions/search?q=test' }),
      app.inject({ method: 'GET', url: '/api/sessions/s1/events' }),
      app.inject({ method: 'GET', url: '/api/sessions/s1/digest' }),
      app.inject({ method: 'GET', url: '/api/sessions/s1/invocations/inv1' }),
    ]);
    assert.deepEqual(
      allowed.map((r) => r.statusCode),
      [200, 200, 200, 200, 200, 200, 200],
      'all MCP internal routes should bypass auth',
    );

    const blocked = await Promise.all([
      app.inject({ method: 'GET', url: '/api/threads/t1' }),
      app.inject({ method: 'DELETE', url: '/api/threads/t1' }),
      app.inject({ method: 'POST', url: '/api/sessions/s1/unseal' }),
      app.inject({ method: 'GET', url: '/api/sessions/s1' }),
    ]);
    assert.deepEqual(
      blocked.map((r) => r.statusCode),
      [401, 401, 401, 401],
      'non-MCP routes must still require auth',
    );

    await app.close();
  });

  test('generates a stable per-install cookie secret when no env override is configured', async () => {
    const { createAuthCookieSecretFileStore, resolveAuthCookieSecret } = await importGlobalAuthModules();
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-cookie-secret-'));
    const secretFile = join(configRoot, 'auth-cookie-session-secret');

    try {
      const firstSecret = await resolveAuthCookieSecret({
        env: {},
        persistentStore: createAuthCookieSecretFileStore(secretFile),
      });
      const secondSecret = await resolveAuthCookieSecret({
        env: {},
        persistentStore: createAuthCookieSecretFileStore(secretFile),
      });

      assert.match(firstSecret, /^[a-f0-9]{64}$/);
      assert.equal(secondSecret, firstSecret);
    } finally {
      rmSync(configRoot, { recursive: true, force: true });
    }
  });
});
