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
import Fastify from 'fastify';
import { afterEach, describe, it, mock } from 'node:test';

const savedEnv = {};

function setEnv(key, value) {
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function importAuthRoutesFresh() {
  const moduleUrl = `${pathToFileURL(resolve('dist/routes/auth.js')).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
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

function buildTicketValidatePayload(overrides = {}) {
  return {
    ...buildCasProfile(),
    model_info: buildModelInfo(),
    ...overrides,
  };
}

function buildTicketValidatePayloadWithSubscription(overrides = {}) {
  return {
    ...buildCasProfile(),
    model_info: undefined,
    subscription: {},
    ...overrides,
  };
}

describe('authRoutes CAS callback flow', () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const key of Object.keys(savedEnv)) delete savedEnv[key];
    mock.restoreAll();
  });

  it('completes CAS callback login and refreshes maas models', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-cas-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes, sessions } = await importAuthRoutesFresh();
    const app = Fastify();
    let refreshCount = 0;
    let refreshHeaders = null;

    app.get('/api/maas-models', async (request) => {
      refreshCount += 1;
      refreshHeaders = { ...request.headers };
      return { success: true, list: [] };
    });

    await app.register(authRoutes);

    mock.method(globalThis, 'fetch', async (url, init) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        assert.equal(init?.method, 'GET');
        assert.match(String(url), /ticket=ticket-123/);
        assert.match(String(url), /service=/);
        return new Response(JSON.stringify(buildTicketValidatePayload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-123' },
    });

    assert.equal(callbackResponse.statusCode, 200);
    assert.equal(callbackResponse.json().success, true);
    assert.equal(callbackResponse.json().userId, 'domain-001:alice');
    assert.equal(callbackResponse.headers['x-office-claw-user'], 'domain-001:alice');
    assert.equal(refreshCount, 1);
    assert.equal(refreshHeaders?.['x-office-claw-user'], 'domain-001:alice');
    assert.equal(refreshHeaders?.['x-refresh'], 'true');
    assert.ok(sessions.has('domain-001:alice'));

    const isLoginResponse = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { 'x-office-claw-user': 'domain-001:alice' },
    });

    assert.equal(isLoginResponse.statusCode, 200);
    assert.equal(isLoginResponse.json().islogin, true);
    assert.equal(isLoginResponse.json().userName, 'alice');

    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('requires a ticket for the CAS callback', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-cas-missing-ticket-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes, sessions } = await importAuthRoutesFresh();
    const app = Fastify();
    await app.register(authRoutes);

    mock.method(globalThis, 'fetch', async (url) => {
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: {},
    });

    assert.equal(callbackResponse.statusCode, 400);
    assert.equal(callbackResponse.json().success, false);
    assert.match(callbackResponse.json().message, /缺少 ticket 参数/);

    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('always resolves callback identity from ticket validation', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-cas-ticket-priority-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes, sessions } = await importAuthRoutesFresh();
    const app = Fastify();
    let refreshCount = 0;
    let ticketValidateCount = 0;

    app.get('/api/maas-models', async () => {
      refreshCount += 1;
      return { success: true, list: [] };
    });

    await app.register(authRoutes);

    mock.method(globalThis, 'fetch', async (url) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        ticketValidateCount += 1;
        return new Response(JSON.stringify(buildTicketValidatePayload({ model_info: undefined })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: {
        ticket: 'ticket-priority-123',
      },
    });

    assert.equal(callbackResponse.statusCode, 200);
    assert.equal(callbackResponse.json().success, true);
    assert.equal(callbackResponse.json().needCode, true);
    assert.equal(callbackResponse.json().userId, 'domain-001:alice');
    assert.equal(ticketValidateCount, 1);
    assert.equal(refreshCount, 0);
    assert.equal(callbackResponse.headers['x-office-claw-user'], 'domain-001:alice');
    assert.equal(sessions.has('wrong-domain:wrong-user'), false);

    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('treats a non-null subscription in ticket-validate as already subscribed', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-cas-subscription-opened-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes, sessions } = await importAuthRoutesFresh();
    const app = Fastify();
    let refreshCount = 0;

    app.get('/api/maas-models', async () => {
      refreshCount += 1;
      return { success: true, list: [] };
    });

    await app.register(authRoutes);

    mock.method(globalThis, 'fetch', async (url) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        return new Response(JSON.stringify(buildTicketValidatePayloadWithSubscription()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-subscription-opened' },
    });

    assert.equal(callbackResponse.statusCode, 200);
    assert.equal(callbackResponse.json().success, true);
    assert.equal(callbackResponse.json().needCode, undefined);
    assert.equal(callbackResponse.json().redirectTo, '/');
    assert.equal(refreshCount, 1);
    assert.ok(sessions.has('domain-001:alice'));

    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('keeps CAS session pending until invitation code is submitted', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-cas-pending-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes, sessions } = await importAuthRoutesFresh();
    const app = Fastify();
    let refreshCount = 0;

    app.get('/api/maas-models', async () => {
      refreshCount += 1;
      return { success: true, list: [] };
    });

    await app.register(authRoutes);

    let subscriptionAttempt = 0;
    mock.method(globalThis, 'fetch', async (url, init) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        return new Response(JSON.stringify(buildTicketValidatePayload({ model_info: undefined })), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (String(url).includes('/v1/claw/client-subscription')) {
        subscriptionAttempt += 1;
        assert.equal(init?.headers?.['X-Security-Token'], 'sts-token-test');
        assert.match(String(init?.headers?.['Authorization']), /^SDK-HMAC-SHA256 Access=ak-test,/);
        assert.match(String(init?.headers?.['X-Sdk-Date']), /^\d{8}T\d{6}Z$/);
        const requestBody = JSON.parse(String(init?.body));
        assert.deepEqual(requestBody, { promotion_code: 'promo-123' });
        return new Response(JSON.stringify({ model_info: buildModelInfo() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-need-code' },
    });

    assert.equal(callbackResponse.statusCode, 200);
    assert.equal(callbackResponse.json().success, true);
    assert.equal(callbackResponse.json().needCode, true);
    assert.equal(refreshCount, 0);
    assert.equal(callbackResponse.headers['x-office-claw-user'], 'domain-001:alice');
    assert.equal(sessions.has('domain-001:alice'), false);
    assert.equal(subscriptionAttempt, 0);

    const pendingState = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { 'x-office-claw-user': 'domain-001:alice' },
    });

    assert.equal(pendingState.statusCode, 200);
    assert.equal(pendingState.json().islogin, false);
    assert.equal(pendingState.json().pendingInvitation, true);

    const invitationResponse = await app.inject({
      method: 'POST',
      url: '/api/login/invitation',
      headers: { 'x-office-claw-user': 'domain-001:alice' },
      payload: { promotionCode: 'promo-123' },
    });

    assert.equal(invitationResponse.statusCode, 200);
    assert.equal(invitationResponse.json().success, true);
    assert.equal(invitationResponse.headers['x-office-claw-user'], 'domain-001:alice');
    assert.equal(refreshCount, 1);
    assert.ok(sessions.has('domain-001:alice'));
    assert.equal(subscriptionAttempt, 1);

    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('submits invitation directly as long as the stored CAS credential and promotion code exist', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-cas-direct-subscription-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes, sessions } = await importAuthRoutesFresh();
    const app = Fastify();
    let subscriptionAttempt = 0;
    let refreshCount = 0;

    app.get('/api/maas-models', async () => {
      refreshCount += 1;
      return { success: true, list: [] };
    });

    await app.register(authRoutes);

    mock.method(globalThis, 'fetch', async (url, init) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        return new Response(JSON.stringify(buildTicketValidatePayload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (String(url).includes('/v1/claw/client-subscription')) {
        subscriptionAttempt += 1;
        assert.equal(init?.headers?.['X-Security-Token'], 'sts-token-test');
        assert.match(String(init?.headers?.['Authorization']), /^SDK-HMAC-SHA256 Access=ak-test,/);
        assert.match(String(init?.headers?.['X-Sdk-Date']), /^\d{8}T\d{6}Z$/);
        const requestBody = JSON.parse(String(init?.body));
        assert.deepEqual(requestBody, { promotion_code: 'promo-direct' });
        return new Response(JSON.stringify({ model_info: buildModelInfo() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-direct-subscription' },
    });

    assert.equal(callbackResponse.statusCode, 200);
    assert.equal(callbackResponse.json().success, true);
    assert.equal(callbackResponse.json().userId, 'domain-001:alice');
    assert.equal(refreshCount, 1);

    sessions.clear();
    refreshCount = 0;

    const invitationResponse = await app.inject({
      method: 'POST',
      url: '/api/login/invitation',
      headers: { 'x-office-claw-user': 'domain-001:alice' },
      payload: { promotionCode: 'promo-direct' },
    });

    assert.equal(invitationResponse.statusCode, 200);
    assert.equal(invitationResponse.json().success, true);
    assert.equal(subscriptionAttempt, 1);
    assert.equal(refreshCount, 1);
    assert.ok(sessions.has('domain-001:alice'));

    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('redirects to invitation page when ticket-validate omits modelInfo', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-cas-no-model-info-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes, sessions } = await importAuthRoutesFresh();
    const app = Fastify();
    let refreshCount = 0;
    let subscriptionAttempt = 0;

    app.get('/api/maas-models', async () => {
      refreshCount += 1;
      return { success: true, list: [] };
    });

    await app.register(authRoutes);

    mock.method(globalThis, 'fetch', async (url) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        return new Response(JSON.stringify(buildCasProfile()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (String(url).includes('/v1/claw/client-subscription')) {
        subscriptionAttempt += 1;
        return new Response(JSON.stringify({ model_info: buildModelInfo() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const callbackResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-no-model-info' },
    });

    assert.equal(callbackResponse.statusCode, 200);
    assert.equal(callbackResponse.json().success, true);
    assert.equal(callbackResponse.json().needCode, true);
    assert.equal(callbackResponse.json().redirectTo, '/login/invitation');
    assert.equal(subscriptionAttempt, 0);
    assert.equal(refreshCount, 0);
    assert.equal(sessions.has('domain-001:alice'), false);

    const pendingState = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { 'x-office-claw-user': 'domain-001:alice' },
    });

    assert.equal(pendingState.statusCode, 200);
    assert.equal(pendingState.json().islogin, false);
    assert.equal(pendingState.json().pendingInvitation, true);

    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });
});
