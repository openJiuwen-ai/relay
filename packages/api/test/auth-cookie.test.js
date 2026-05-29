/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import fastifyCookie from '@fastify/cookie';
import Fastify from 'fastify';
import { afterEach, describe, test, mock } from 'node:test';

const COOKIE_SECRET = 'test-cookie-secret-with-enough-entropy';
const savedEnv = {};

function setEnv(key, value) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function importAuthModulesFresh() {
  const suffix = `?t=${Date.now()}-${Math.random()}`;
  const [authModule, globalAuthModule, sessionStoreModule, middlewareModule] = await Promise.all([
    import(`${pathToFileURL(resolve('dist/routes/auth.js')).href}${suffix}`),
    import(`${pathToFileURL(resolve('dist/routes/global-auth.js')).href}${suffix}`),
    import(`${pathToFileURL(resolve('dist/auth/session-store.js')).href}${suffix}`),
    import(`${pathToFileURL(resolve('dist/auth/middleware.js')).href}${suffix}`),
  ]);
  return { ...authModule, ...globalAuthModule, ...sessionStoreModule, ...middlewareModule };
}

function buildCasProfile() {
  return {
    access: 'ak-test',
    domain_id: 'domain-001',
    domain_name: 'demo-domain',
    project_id: 'project-001',
    project_name: 'demo-project',
    secret: 'sk-test',
    sts_token: 'sts-token-test',
    user_id: 'user-001',
    user_name: 'alice',
  };
}

function buildModelInfo() {
  return {
    model_api_url_base: 'https://maas.example.com',
    model_auth_info: {
      model_app_key: 'app-key',
      model_app_secret: 'app-secret',
    },
  };
}

function createConfigSandbox(prefix) {
  const configRoot = mkdtempSync(join(tmpdir(), prefix));
  const originalHome = process.env.HOME;
  setEnv('XDG_CONFIG_HOME', configRoot);
  setEnv('APPDATA', configRoot);
  setEnv('HOME', configRoot);
  setEnv('OFFICE_CLAW_SECURE_CONFIG_ENCRYPTION_KEY', 'test-secure-config-key-with-enough-entropy');
  return {
    cleanup() {
      process.env.HOME = originalHome;
      rmSync(configRoot, { recursive: true, force: true });
    },
  };
}

async function createAuthApp() {
  const { authRoutes, AUTH_SESSION_COOKIE_NAME, InMemoryAuthSessionStore, registerAuthMiddleware } = await importAuthModulesFresh();
  const provider = createHuaweiCasProvider();
  const sessionStore = new InMemoryAuthSessionStore();
  const app = Fastify({ logger: false });
  app.get('/api/maas-models', async () => ({ success: true, list: [] }));
  await app.register(fastifyCookie, { secret: COOKIE_SECRET });
  registerAuthMiddleware(app, sessionStore, { skipAuth: false });
  await app.register(authRoutes, {
    authModule: {
      activeProviderId: provider.id,
      providerRegistry: { get: () => provider },
      getActiveProvider: () => provider,
    },
    sessionStore,
  });
  await app.ready();
  return { app, AUTH_SESSION_COOKIE_NAME, provider, sessionStore };
}

function createHuaweiCasProvider() {
  return {
    id: 'huawei-cas',
    displayName: 'Huawei Cloud (CAS)',
    presentation: { mode: 'redirect', fields: [], redirectUrl: 'https://example.test/login' },
    async authenticate() {
      return { success: false, message: 'Use callback flow' };
    },
    async handleCallback(params) {
      if (!params.promotionCode && params.ticket === 'ticket-needs-code') {
        return { success: false, needCode: true, userId: 'domain-001:alice', pendingToken: 'pending-token-1', message: '请输入邀请码后再登录' };
      }
      if (params.promotionCode && params.pendingToken !== 'pending-token-1') {
        return { success: false, needCode: true, message: '登录状态已失效，请重新登录' };
      }
      return {
        success: true,
        principal: {
          userId: 'domain-001:alice',
          displayName: 'alice',
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          providerState: { model_info: buildModelInfo() },
        },
      };
    },
    logoutCalled: false,
    async logout() {
      this.logoutCalled = true;
    },
  };
}

function extractCookieHeader(response, cookieName) {
  const setCookie = response.headers['set-cookie'];
  const cookieLine = Array.isArray(setCookie) ? setCookie.find((line) => line.startsWith(`${cookieName}=`)) : setCookie;
  assert.ok(cookieLine, `expected ${cookieName} Set-Cookie header`);
  return String(cookieLine).split(';')[0];
}

describe('auth session cookie', () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const key of Object.keys(savedEnv)) delete savedEnv[key];
    mock.restoreAll();
  });

  test('CAS callback success sets an HttpOnly signed session cookie usable by /api/islogin without identity headers', async () => {
    const sandbox = createConfigSandbox('office-claw-auth-cookie-callback-');
    const { app, AUTH_SESSION_COOKIE_NAME } = await createAuthApp();

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-123' },
    });

    assert.equal(loginResponse.statusCode, 200);
    const setCookie = String(loginResponse.headers['set-cookie']);
    assert.match(setCookie, new RegExp(`${AUTH_SESSION_COOKIE_NAME}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\//i);

    const isLoginResponse = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: {
        cookie: extractCookieHeader(loginResponse, AUTH_SESSION_COOKIE_NAME),
      },
    });

    assert.equal(isLoginResponse.statusCode, 200);
    assert.equal(isLoginResponse.json().islogin, true);
    assert.equal(isLoginResponse.json().userId, 'domain-001:alice');

    await app.close();
    sandbox.cleanup();
  });

  test('invitation completion accepts the callback ticket and logout clears the cookie', async () => {
    const sandbox = createConfigSandbox('office-claw-auth-cookie-invitation-');
    const { app, AUTH_SESSION_COOKIE_NAME, provider, sessionStore } = await createAuthApp();

    const pendingResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-needs-code' },
    });
    assert.equal(pendingResponse.statusCode, 200);
    assert.equal(pendingResponse.json().needCode, true);
    const invitationResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { pendingToken: 'pending-token-1', promotionCode: 'invite-1' },
    });
    assert.equal(invitationResponse.statusCode, 200);
    assert.equal(invitationResponse.json().success, true);
    const activeCookie = extractCookieHeader(invitationResponse, AUTH_SESSION_COOKIE_NAME);
    assert.ok(sessionStore.getByUserId('domain-001:alice'));

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: { cookie: activeCookie },
    });
    assert.equal(logoutResponse.statusCode, 200);
    const logoutSetCookie = String(logoutResponse.headers['set-cookie']);
    assert.match(logoutSetCookie, new RegExp(`${AUTH_SESSION_COOKIE_NAME}=`));
    assert.match(logoutSetCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    assert.equal(sessionStore.getByUserId('domain-001:alice'), null);
    assert.equal(provider.logoutCalled, true);

    await app.close();
    sandbox.cleanup();
  });
});
