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

describe('authRoutes CAS model refresh', () => {
  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const key of Object.keys(savedEnv)) delete savedEnv[key];
    mock.restoreAll();
  });

  it('refreshes maas models after a successful CAS callback resolves modelInfo', async () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-refresh-'));
    const originalHome = process.env.HOME;
    setEnv('XDG_CONFIG_HOME', configRoot);
    setEnv('APPDATA', configRoot);
    setEnv('HOME', configRoot);

    const { authRoutes } = await importAuthRoutesFresh();
    const app = Fastify();
    let refreshHeaders = null;
    let refreshCount = 0;

    app.get('/api/maas-models', async (request) => {
      refreshCount += 1;
      refreshHeaders = { ...request.headers };
      return { success: true, list: [] };
    });

    await app.register(authRoutes);

    mock.method(globalThis, 'fetch', async (url) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        return new Response(
          JSON.stringify({
            ...buildCasProfile(),
            model_info: buildModelInfo(),
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: {
        ticket: 'ticket-123',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().success, true);
    assert.equal(refreshCount, 1);
    assert.equal(refreshHeaders?.['x-office-claw-user'], 'domain-001:alice');
    assert.equal(refreshHeaders?.['x-refresh'], 'true');

    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });
});
