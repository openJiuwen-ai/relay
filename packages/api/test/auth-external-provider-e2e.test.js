/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Fastify from 'fastify';

const { createAuthModule } = await import('../dist/auth/module.js');
const { authRoutes } = await import('../dist/routes/auth.js');
const { InMemoryAuthSessionStore } = await import('../dist/auth/session-store.js');
const { registerAuthMiddleware } = await import('../dist/auth/middleware.js');

describe('external provider e2e', () => {
  function createDemoProvider() {
    return {
      id: 'demo-static',
      displayName: 'Demo Static Auth',
      presentation: {
        mode: 'form',
        fields: [
          { name: 'username', label: 'Username', type: 'text', required: true },
          { name: 'password', label: 'Password', type: 'password', required: true },
        ],
        submitLabel: 'Demo Login',
        description: 'Demo provider — use any username with password "demo".',
      },
      bootstrapCalled: false,
      async bootstrap() { this.bootstrapCalled = true; },
      async authenticate(input) {
        const { username, password } = input.credentials;
        if (password !== 'demo') {
          return { success: false, message: 'Invalid password' };
        }
        return {
          success: true,
          principal: {
            userId: `demo:${username}`,
            displayName: username,
            expiresAt: null,
            providerState: { source: 'demo-static' },
          },
        };
      },
      postLoginInitCalled: false,
      async postLoginInit() { this.postLoginInitCalled = true; },
      logoutCalled: false,
      async logout() { this.logoutCalled = true; },
    };
  }

  async function createTestApp() {
    const demoProvider = createDemoProvider();
    const sessionStore = new InMemoryAuthSessionStore();
    const authModule = await createAuthModule({
      env: {
        OFFICE_CLAW_AUTH_PROVIDER: 'demo-static',
        OFFICE_CLAW_AUTH_PROVIDER_MODULES: '@examples/demo-auth-provider',
      },
      moduleLoader: async (specifier) => {
        if (specifier === '@examples/demo-auth-provider') {
          return { default: demoProvider };
        }
        throw new Error(`Unknown module: ${specifier}`);
      },
    });

    const app = Fastify();
    registerAuthMiddleware(app, sessionStore, { skipAuth: false });
    await app.register(authRoutes, { authModule, sessionStore });
    return { app, authModule, sessionStore, demoProvider };
  }

  test('loads and bootstraps external provider', async () => {
    const { authModule, demoProvider } = await createTestApp();

    assert.equal(authModule.activeProviderId, 'demo-static');
    assert.equal(authModule.getActiveProvider().displayName, 'Demo Static Auth');
    assert.ok(authModule.providerRegistry.has('demo-static'));
    assert.ok(authModule.providerRegistry.has('no-auth'));
    assert.equal(demoProvider.bootstrapCalled, true);
  });

  test('GET /api/islogin returns provider schema for unauthenticated user', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/islogin' });
    const body = res.json();

    assert.equal(body.islogin, false);
    assert.equal(body.provider.id, 'demo-static');
    assert.equal(body.provider.mode, 'form');
    assert.equal(body.provider.fields.length, 2);
    assert.equal(body.provider.fields[0].name, 'username');
    assert.equal(body.provider.fields[1].name, 'password');
  });

  test('POST /api/login succeeds with correct password and creates session', async () => {
    const { app, sessionStore } = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'alice', password: 'demo' },
    });
    const body = res.json();

    assert.equal(body.success, true);
    assert.equal(body.userId, 'demo:alice');
    assert.ok(body.sessionId);
    assert.equal(body.providerId, 'demo-static');

    const session = sessionStore.getBySessionId(body.sessionId);
    assert.ok(session);
    assert.equal(session.userId, 'demo:alice');
    assert.equal(session.providerId, 'demo-static');
  });

  test('POST /api/login fails with wrong password', async () => {
    const { app } = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'alice', password: 'wrong' },
    });
    const body = res.json();

    assert.equal(body.success, false);
    assert.equal(body.message, 'Invalid password');
  });

  test('POST /api/login triggers postLoginInit', async () => {
    const { app, demoProvider } = await createTestApp();
    await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'bob', password: 'demo' },
    });

    assert.equal(demoProvider.postLoginInitCalled, true);
  });

  test('full flow: login → authenticated islogin → logout', async () => {
    const { app, demoProvider } = await createTestApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { username: 'carol', password: 'demo' },
    });
    const { sessionId } = loginRes.json();
    assert.ok(sessionId);

    const checkRes = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { authorization: `Bearer ${sessionId}` },
    });
    const checkBody = checkRes.json();
    assert.equal(checkBody.islogin, true);
    assert.equal(checkBody.userId, 'demo:carol');

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: { authorization: `Bearer ${sessionId}` },
    });
    assert.equal(logoutRes.statusCode, 200);
    assert.equal(demoProvider.logoutCalled, true);

    const afterRes = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { authorization: `Bearer ${sessionId}` },
    });
    const afterBody = afterRes.json();
    assert.equal(afterBody.islogin, false);
  });
});
