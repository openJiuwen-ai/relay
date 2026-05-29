/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';

const { authRoutes } = await import('../dist/routes/auth.js');
const { AuthProviderRegistry } = await import('../dist/auth/provider-registry.js');
const { InMemoryAuthSessionStore } = await import('../dist/auth/session-store.js');
const { registerAuthMiddleware } = await import('../dist/auth/middleware.js');
const { registerGlobalAuthHook } = await import('../dist/routes/global-auth.js');

function createProvider(overrides = {}) {
  return {
    id: 'test-provider',
    displayName: 'Test Provider',
    presentation: {
      mode: 'form',
      fields: [
        { name: 'tenant', label: 'Tenant', type: 'text', required: true },
        { name: 'secret', label: 'Secret', type: 'password', required: true },
      ],
      submitLabel: 'Sign in',
    },
    async authenticate(_input) {
      return {
        success: true,
        principal: {
          userId: 'tenant:alice',
          displayName: 'Alice',
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
        },
      };
    },
    ...overrides,
  };
}

async function createApp(provider) {
  const registry = new AuthProviderRegistry();
  registry.register(provider);
  const sessionStore = new InMemoryAuthSessionStore();
  const app = Fastify();
  await app.register(fastifyCookie, { secret: 'test-cookie-secret' });
  registerAuthMiddleware(app, sessionStore, { skipAuth: false });
  await app.register(authRoutes, {
    authModule: {
      activeProviderId: provider.id,
      providerRegistry: registry,
      getActiveProvider() {
        return registry.get(provider.id);
      },
    },
    sessionStore,
  });
  return { app, sessionStore };
}

describe('auth routes', () => {
  test('GET /api/islogin auto-authenticates when provider mode is auto', async () => {
    let calls = 0;
    const provider = createProvider({
      id: 'no-auth',
      displayName: 'No Auth',
      presentation: { mode: 'auto', fields: [], submitLabel: 'Continue' },
      async authenticate() {
        calls += 1;
        return {
          success: true,
          principal: { userId: 'guest-user', displayName: 'Guest', expiresAt: null },
        };
      },
    });

    const { app, sessionStore } = await createApp(provider);
    const response = await app.inject({ method: 'GET', url: '/api/islogin' });

    assert.equal(response.statusCode, 200);
    assert.equal(calls, 1);
    assert.equal(sessionStore.getByUserId('guest-user')?.providerId, 'no-auth');

    const body = response.json();
    assert.equal(body.islogin, true);
    assert.equal(body.userId, 'guest-user');
    assert.equal(body.isskip, true);
    assert.equal(body.provider.id, 'no-auth');
    assert.match(response.headers['set-cookie'], /oc_sid=/);
    assert.match(response.headers['set-cookie'], /HttpOnly/);
    assert.match(response.headers['set-cookie'], /SameSite=Strict/);
  });

  test('GET /api/islogin exposes active provider schema when login is required', async () => {
    const provider = createProvider({
      id: 'corp-oidc',
      displayName: 'Corp SSO',
      presentation: {
        mode: 'form',
        fields: [
          { name: 'workspaceId', label: 'Workspace', type: 'text', required: true },
          { name: 'apiToken', label: 'Token', type: 'password', required: true },
        ],
        submitLabel: 'Connect',
      },
    });

    const { app } = await createApp(provider);
    const response = await app.inject({ method: 'GET', url: '/api/islogin' });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.islogin, false);
    assert.equal(body.provider.id, 'corp-oidc');
    assert.equal(body.provider.mode, 'form');
    assert.equal(body.provider.fields.length, 2);
  });

  test('POST /api/login delegates credentials to the active provider and stores session', async () => {
    let receivedInput = null;
    const provider = createProvider({
      id: 'corp-oidc',
      async authenticate(input) {
        receivedInput = input;
        return {
          success: true,
          principal: {
            userId: 'corp:alice',
            displayName: 'Alice',
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          },
        };
      },
    });

    const { app, sessionStore } = await createApp(provider);
    const response = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { workspaceId: 'acme', apiToken: 'shh' },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(receivedInput.credentials, { workspaceId: 'acme', apiToken: 'shh' });
    assert.ok(response.headers['x-session-id']);
    assert.match(response.headers['set-cookie'], /oc_sid=/);
    assert.match(response.headers['set-cookie'], /HttpOnly/);
    assert.match(response.headers['set-cookie'], /SameSite=Strict/);
    assert.match(response.headers['set-cookie'], /Path=\//);
    assert.equal(sessionStore.getByUserId('corp:alice')?.providerId, 'corp-oidc');

    const body = response.json();
    assert.equal(body.success, true);
    assert.equal(body.userId, 'corp:alice');
    assert.equal(body.providerId, 'corp-oidc');
    assert.ok(body.sessionId);
  });

  test('POST /api/login/callback stores redirect provider session', async () => {
    const provider = createProvider({
      id: 'redirect-test',
      presentation: { mode: 'redirect', fields: [], redirectUrl: 'https://example.test/login' },
      async handleCallback(params) {
        assert.deepEqual(params, { ticket: 'ticket-1' });
        return {
          success: true,
          principal: {
            userId: 'redirect-user',
            displayName: 'Redirect User',
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          },
        };
      },
    });

    const { app, sessionStore } = await createApp(provider);
    const response = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-1' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
    assert.equal(response.json().userId, 'redirect-user');
    assert.equal(sessionStore.getByUserId('redirect-user')?.providerId, 'redirect-test');
    assert.match(response.headers['set-cookie'], /oc_sid=/);
  });

  test('POST /api/login/callback returns provider needCode failure', async () => {
    const provider = createProvider({
      id: 'redirect-need-code',
      presentation: { mode: 'redirect', fields: [], redirectUrl: 'https://example.test/login' },
      async handleCallback() {
        return { success: false, needCode: true, message: '邀请码无效，请重新输入' };
      },
    });

    const { app } = await createApp(provider);
    const response = await app.inject({ method: 'POST', url: '/api/login/callback', payload: { ticket: 'ticket-1' } });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, false);
    assert.equal(response.json().needCode, true);
  });

  test('POST /api/login calls postLoginInit after session issuance', async () => {
    let initCalled = false;
    let initSessionInfo = null;
    const provider = createProvider({
      id: 'hook-test',
      async authenticate() {
        return {
          success: true,
          principal: { userId: 'hook-user', displayName: 'Hook', expiresAt: null },
        };
      },
      async postLoginInit(session) {
        initCalled = true;
        initSessionInfo = session;
      },
    });

    const { app } = await createApp(provider);
    await app.inject({ method: 'POST', url: '/api/login', payload: {} });

    assert.equal(initCalled, true);
    assert.equal(initSessionInfo.userId, 'hook-user');
    assert.equal(initSessionInfo.providerId, 'hook-test');
    assert.ok(initSessionInfo.sessionId);
  });

  test('POST /api/login does not fail when postLoginInit throws', async () => {
    const provider = createProvider({
      id: 'failing-hook',
      async authenticate() {
        return {
          success: true,
          principal: { userId: 'resilient-user', displayName: 'Res', expiresAt: null },
        };
      },
      async postLoginInit() {
        throw new Error('MaaS subscription exploded');
      },
    });

    const { app, sessionStore } = await createApp(provider);
    const response = await app.inject({ method: 'POST', url: '/api/login', payload: {} });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
    assert.ok(sessionStore.getByUserId('resilient-user'));
  });

  test('POST /api/logout clears the session and calls provider logout', async () => {
    let logoutSession = null;
    const provider = createProvider({
      id: 'corp-oidc',
      async logout(session) {
        logoutSession = session;
      },
    });
    const { app, sessionStore } = await createApp(provider);
    const session = sessionStore.create(provider.id, {
      userId: 'corp:alice',
      displayName: 'Alice',
      expiresAt: new Date('2099-01-01'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: { authorization: `Bearer ${session.sessionId}` },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(sessionStore.getByUserId('corp:alice'), null);
    assert.equal(response.json().success, true);
    assert.equal(logoutSession.userId, 'corp:alice');
    assert.match(response.headers['set-cookie'], /oc_sid=;/);
  });

  test('session store cleans up old session when same user logs in again', async () => {
    const provider = createProvider({ id: 'relogin-test' });
    const { app, sessionStore } = await createApp(provider);

    const res1 = await app.inject({ method: 'POST', url: '/api/login', payload: { tenant: 'a', secret: 'b' } });
    const session1Id = res1.json().sessionId;

    const res2 = await app.inject({ method: 'POST', url: '/api/login', payload: { tenant: 'a', secret: 'b' } });
    const session2Id = res2.json().sessionId;

    assert.equal(sessionStore.getBySessionId(session1Id), null);
    assert.ok(sessionStore.getBySessionId(session2Id));
  });

  test('auth middleware resolves request.auth from verified cookie identity', async () => {
    const provider = createProvider({ id: 'cookie-provider' });
    const app = Fastify();
    const sessionStore = new InMemoryAuthSessionStore();
    await app.register(fastifyCookie, { secret: 'test-cookie-secret' });
    registerGlobalAuthHook(app, { verifyPrimaryUserId: (userId) => userId === 'cookie-user' });
    registerAuthMiddleware(app, sessionStore, { skipAuth: false });
    const session = sessionStore.create(provider.id, {
      userId: 'cookie-user',
      displayName: 'Cookie User',
      expiresAt: new Date('2099-01-01'),
    });
    app.get('/cookie-auth-check', async (request) => ({ auth: request.auth }));

    const response = await app.inject({
      method: 'GET',
      url: '/cookie-auth-check',
      headers: { cookie: `oc_sid=${app.signCookie('cookie-user')}` },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().auth, {
      userId: 'cookie-user',
      sessionId: session.sessionId,
      providerId: 'cookie-provider',
      authenticated: true,
    });
    await app.close();
  });
});
