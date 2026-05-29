/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check
import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const AUTH_HEADERS = { 'x-office-claw-user': 'test-user' };

/** @param {string} prefix */
async function makeTmpDir(prefix) {
  return mkdtemp(join(homedir(), `.office-claw-provider-profile-route-${prefix}-`));
}

/** @param {string} prefix */
async function makeWorkspaceDir(prefix) {
  return mkdtemp(join(process.cwd(), '..', '..', `.office-claw-provider-profile-route-workspace-${prefix}-`));
}

describe('provider profiles routes', () => {
  /** @type {string | undefined} */ let savedGlobalRoot;

  function setGlobalRoot(dir) {
    savedGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = dir;
  }

  function restoreGlobalRoot() {
    if (savedGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = savedGlobalRoot;
  }

  it('migrates legacy v1 provider profiles with anthropic protocol metadata', async () => {
    const { readProviderProfiles } = await import('../dist/config/provider-profiles.js');
    const projectDir = await makeTmpDir('legacy-v1');
    setGlobalRoot(projectDir);
    try {
      const catCafeDir = join(projectDir, '.office-claw');
      await mkdir(catCafeDir, { recursive: true });
      await writeFile(
        join(catCafeDir, 'provider-profiles.json'),
        JSON.stringify({
          version: 1,
          providers: {
            anthropic: {
              activeProfileId: 'anthropic-sponsor',
              profiles: [
                {
                  id: 'anthropic-sponsor',
                  displayName: 'Anthropic Sponsor',
                  authType: 'api_key',
                  mode: 'api_key',
                  baseUrl: 'https://api.anthropic-proxy.dev',
                },
              ],
            },
          },
        }),
      );

      const view = await readProviderProfiles(projectDir);
      const migrated = view.providers.find((profile) => profile.id === 'anthropic-sponsor');
      assert.ok(migrated, 'migrated anthropic profile should exist');
      assert.equal(migrated.protocol, 'anthropic');
      assert.deepEqual(view.bootstrapBindings.anthropic, {
        enabled: true,
        mode: 'api_key',
        accountRef: 'anthropic-sponsor',
      });
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('migrates legacy v2 provider profiles by preserving or inferring protocol metadata', async () => {
    const { readProviderProfiles } = await import('../dist/config/provider-profiles.js');
    const projectDir = await makeTmpDir('legacy-v2');
    setGlobalRoot(projectDir);
    try {
      const catCafeDir = join(projectDir, '.office-claw');
      await mkdir(catCafeDir, { recursive: true });
      await writeFile(
        join(catCafeDir, 'provider-profiles.json'),
        JSON.stringify({
          version: 2,
          activeProfileIds: {
            openai: 'openai-sponsor',
            google: 'google-sponsor',
          },
          profiles: [
            {
              id: 'openai-sponsor',
              displayName: 'OpenAI Sponsor',
              authType: 'api_key',
              mode: 'api_key',
              protocol: 'openai',
              baseUrl: 'https://api.openai-proxy.dev',
            },
            {
              id: 'google-sponsor',
              displayName: 'Google Sponsor',
              authType: 'api_key',
              mode: 'api_key',
              provider: 'google',
              baseUrl: 'https://generativelanguage.googleapis.com',
            },
          ],
        }),
      );

      const view = await readProviderProfiles(projectDir);
      const openai = view.providers.find((profile) => profile.id === 'openai-sponsor');
      const google = view.providers.find((profile) => profile.id === 'google-sponsor');
      assert.ok(openai, 'migrated openai profile should exist');
      assert.ok(google, 'migrated google profile should exist');
      assert.equal(openai.protocol, 'openai');
      assert.equal(google.protocol, 'google');
      assert.deepEqual(view.bootstrapBindings.openai, {
        enabled: true,
        mode: 'api_key',
        accountRef: 'openai-sponsor',
      });
      assert.deepEqual(view.bootstrapBindings.google, {
        enabled: true,
        mode: 'api_key',
        accountRef: 'google-sponsor',
      });
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('normalizes command-only legacy ACP profiles so ACP clients can still bind them', async () => {
    const { readProviderProfiles } = await import('../dist/config/provider-profiles.js');
    const projectDir = await makeTmpDir('legacy-acp-command');
    setGlobalRoot(projectDir);
    try {
      const catCafeDir = join(projectDir, '.office-claw');
      await mkdir(catCafeDir, { recursive: true });
      await writeFile(
        join(catCafeDir, 'provider-profiles.json'),
        JSON.stringify({
          version: 3,
          activeProfileId: null,
          providers: [
            {
              id: 'relay-teams-local',
              displayName: 'Agent Teams Local',
              builtin: false,
              command: 'relay-teams',
              args: ['gateway', 'acp', 'stdio'],
              cwd: '/opt/workspace/relay-teams',
              createdAt: '2026-03-27T00:00:00.000Z',
              updatedAt: '2026-03-27T00:00:00.000Z',
            },
          ],
          bootstrapBindings: {},
        }),
      );

      const view = await readProviderProfiles(projectDir);
      const normalized = view.providers.find((profile) => profile.id === 'relay-teams-local');
      assert.ok(normalized, 'legacy ACP profile should still be listed');
      assert.equal(normalized.kind, 'acp');
      assert.equal(normalized.authType, 'none');
      assert.equal(normalized.protocol, 'acp');
      assert.equal(normalized.command, 'relay-teams');
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  it('GET /api/provider-profiles requires identity', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/provider-profiles' });
    assert.equal(res.statusCode, 401);

    await app.close();
  });

  it('create + activate + list profile flow', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const projectDir = await makeTmpDir('crud');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          provider: 'anthropic',
          displayName: 'sponsor-route',
          authType: 'api_key',
          baseUrl: 'https://api.route.dev',
          apiKey: 'sk-route',
          models: ['claude-opus-4-6'],
          setActive: true,
        }),
      });
      assert.equal(createRes.statusCode, 200);
      const created = createRes.json();
      assert.equal(created.profile.authType, 'api_key');
      assert.equal(created.profile.hasApiKey, true);

      const listRes = await app.inject({
        method: 'GET',
        url: `/api/provider-profiles?projectPath=${encodeURIComponent(projectDir)}`,
        headers: AUTH_HEADERS,
      });
      assert.equal(listRes.statusCode, 200);
      const list = listRes.json();
      assert.ok(Array.isArray(list.providers));
      assert.equal(list.activeProfileId, null);
      assert.deepEqual(list.bootstrapBindings, {
        anthropic: { enabled: true, mode: 'api_key', accountRef: created.profile.id },
        openai: { enabled: true, mode: 'oauth', accountRef: 'codex' },
        google: { enabled: true, mode: 'oauth', accountRef: 'gemini' },
        dare: { enabled: true, mode: 'oauth', accountRef: 'dare' },
        opencode: { enabled: false, mode: 'skip' },
      });
      assert.deepEqual(
        list.providers.slice(0, 3).map((profile) => profile.id),
        ['claude', 'codex', 'gemini'],
      );
      const listed = list.providers.find((p) => p.id === created.profile.id);
      assert.ok(listed);
      assert.equal(listed.hasApiKey, true);
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('creates ACP model profiles even when provider type is omitted', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const projectDir = await makeTmpDir('acp-model-no-provider');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/acp-model-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          displayName: 'Gateway Default',
          model: 'gpt-5.3-codex',
          baseUrl: 'https://api.example.com/v1',
          apiKey: 'sk-test',
        }),
      });
      assert.equal(createRes.statusCode, 200);
      assert.equal(createRes.json().profile.provider, undefined);

      const listRes = await app.inject({
        method: 'GET',
        url: `/api/acp-model-profiles?projectPath=${encodeURIComponent(projectDir)}`,
        headers: AUTH_HEADERS,
      });
      assert.equal(listRes.statusCode, 200);
      assert.equal(listRes.json().profiles[0]?.provider, undefined);
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('persists ACP provider env keys in views and runtime resolution', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const { resolveRuntimeProviderProfileById } = await import('../dist/config/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const projectDir = await makeTmpDir('acp-env');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          kind: 'acp',
          displayName: 'relay-teams-env',
          command: 'relay-teams',
          args: ['gateway', 'acp', 'stdio'],
          env: {
            ACP_TRACE_STDIO: '1',
            RELAY_TEAMS_LOG_LEVEL: 'DEBUG',
          },
        }),
      });
      assert.equal(createRes.statusCode, 200);
      const created = createRes.json();
      assert.deepEqual(created.profile.envKeys, ['ACP_TRACE_STDIO', 'RELAY_TEAMS_LOG_LEVEL']);

      const listRes = await app.inject({
        method: 'GET',
        url: `/api/provider-profiles?projectPath=${encodeURIComponent(projectDir)}`,
        headers: AUTH_HEADERS,
      });
      assert.equal(listRes.statusCode, 200);
      const listed = listRes.json().providers.find((profile) => profile.id === created.profile.id);
      assert.deepEqual(listed?.envKeys, ['ACP_TRACE_STDIO', 'RELAY_TEAMS_LOG_LEVEL']);

      const runtime = await resolveRuntimeProviderProfileById(projectDir, created.profile.id);
      assert.deepEqual(runtime?.env, {
        ACP_TRACE_STDIO: '1',
        RELAY_TEAMS_LOG_LEVEL: 'DEBUG',
      });
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('GET /api/provider-profiles hides builtin auth cards when the install preset disables them', async () => {
    const previousAllowedClients = process.env.OFFICE_CLAW_ALLOWED_CLIENTS;
    const previousVisibleBuiltinAuthClients = process.env.OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS;
    process.env.OFFICE_CLAW_ALLOWED_CLIENTS = 'dare,relayclaw';
    process.env.OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS = '';

    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const { createProviderProfile } = await import('../dist/config/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const projectDir = await makeTmpDir('custom-install-filter');
    try {
      await createProviderProfile(projectDir, {
        provider: 'openai',
        displayName: 'ModelArts Shared',
        authType: 'api_key',
        protocol: 'openai',
        baseUrl: 'https://api.modelarts-maas.com/v2',
        apiKey: 'sk-modelarts',
        models: ['glm-5'],
      });

      const listRes = await app.inject({
        method: 'GET',
        url: `/api/provider-profiles?projectPath=${encodeURIComponent(projectDir)}`,
        headers: AUTH_HEADERS,
      });
      assert.equal(listRes.statusCode, 200);

      const list = listRes.json();
      assert.deepEqual(list.visibleBuiltinClients, []);
      // Profile store is global — only assert that no builtin profiles leak through
      const builtinProviders = list.providers.filter((p) => p.builtin);
      assert.equal(builtinProviders.length, 0, 'builtin profiles should be hidden when preset disables them');
      assert.ok(list.providers.some((p) => p.id === 'modelarts-shared'), 'custom profile should still be visible');
      assert.deepEqual(Object.keys(list.bootstrapBindings), ['dare']);
    } finally {
      if (previousAllowedClients === undefined) delete process.env.OFFICE_CLAW_ALLOWED_CLIENTS;
      else process.env.OFFICE_CLAW_ALLOWED_CLIENTS = previousAllowedClients;
      if (previousVisibleBuiltinAuthClients === undefined) delete process.env.OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS;
      else process.env.OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS = previousVisibleBuiltinAuthClients;
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('GET /api/provider-profiles shows all builtin auth when OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED=true', async () => {
    const saved = {
      allowed: process.env.OFFICE_CLAW_ALLOWED_CLIENTS,
      visible: process.env.OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS,
      toggle: process.env.OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED,
    };
    process.env.OFFICE_CLAW_ALLOWED_CLIENTS = 'dare,relayclaw';
    process.env.OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS = '';
    process.env.OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED = 'true';

    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const projectDir = await makeTmpDir('toggle-builtin-on');
    try {
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/provider-profiles?projectPath=${encodeURIComponent(projectDir)}`,
        headers: AUTH_HEADERS,
      });
      assert.equal(listRes.statusCode, 200);
      const list = listRes.json();
      assert.deepEqual(list.visibleBuiltinClients, ['anthropic', 'openai', 'google', 'dare', 'opencode']);
      assert.ok(Object.keys(list.bootstrapBindings).includes('anthropic'));
      assert.ok(Object.keys(list.bootstrapBindings).includes('google'));
    } finally {
      for (const [key, val] of Object.entries(saved)) {
        const envKey =
          key === 'allowed'
            ? 'OFFICE_CLAW_ALLOWED_CLIENTS'
            : key === 'visible'
              ? 'OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS'
              : 'OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED';
        if (val === undefined) delete process.env[envKey];
        else process.env[envKey] = val;
      }
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('POST /api/provider-profiles/:id/test validates api_key profile via fetch', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes, {
      fetchImpl: async () => new Response('{}', { status: 200 }),
    });
    await app.ready();

    const projectDir = await makeTmpDir('test');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          displayName: 'sponsor-test',
          authType: 'api_key',
          baseUrl: 'https://api.route.dev',
          apiKey: 'sk-route',
          models: ['claude-opus-4-6'],
          setActive: false,
        }),
      });
      const profileId = createRes.json().profile.id;

      const testRes = await app.inject({
        method: 'POST',
        url: `/api/provider-profiles/${profileId}/test`,
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          protocol: 'anthropic',
        }),
      });
      assert.equal(testRes.statusCode, 200);
      const body = testRes.json();
      assert.equal(body.ok, true);
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('POST /api/provider-profiles/:id/test falls back to /v1/messages when /v1/models is 404', async () => {
    const Fastify = (await import('fastify')).default;
    const calls = [];
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes, {
      fetchImpl: async (url, init) => {
        const urlString = String(url);
        calls.push({ method: init?.method ?? 'GET', url: urlString });
        if (urlString.endsWith('/v1/models')) {
          return new Response('Not Found', { status: 404 });
        }
        if (urlString.endsWith('/v1/messages')) {
          return new Response('{"id":"msg_test"}', { status: 200 });
        }
        return new Response('Unhandled URL', { status: 500 });
      },
    });
    await app.ready();

    const projectDir = await makeTmpDir('test-fallback');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          displayName: 'felix',
          authType: 'api_key',
          baseUrl: 'https://chat.nuoda.vip/claudecode',
          apiKey: 'sk-route',
          models: ['claude-opus-4-6'],
          setActive: false,
        }),
      });
      const profileId = createRes.json().profile.id;

      const testRes = await app.inject({
        method: 'POST',
        url: `/api/provider-profiles/${profileId}/test`,
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          protocol: 'anthropic',
        }),
      });
      assert.equal(testRes.statusCode, 200);
      const body = testRes.json();
      assert.equal(body.ok, true);
      assert.equal(body.status, 200);
      assert.deepEqual(
        calls.map((call) => `${call.method} ${new URL(call.url).pathname}`),
        ['GET /claudecode/v1/models', 'POST /claudecode/v1/messages'],
      );
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('POST /api/provider-profiles/:id/test treats invalid-model 400 as compatible success', async () => {
    const Fastify = (await import('fastify')).default;
    const calls = [];
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes, {
      fetchImpl: async (url, init) => {
        const urlString = String(url);
        calls.push({ method: init?.method ?? 'GET', url: urlString });
        if (urlString.endsWith('/v1/models')) {
          return new Response('Not Found', { status: 404 });
        }
        if (urlString.endsWith('/v1/messages')) {
          return new Response('{"type":"error","error":{"type":"invalid_request_error","message":"invalid model"}}', {
            status: 400,
          });
        }
        return new Response('Unhandled URL', { status: 500 });
      },
    });
    await app.ready();

    const projectDir = await makeTmpDir('test-invalid-model');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          displayName: 'felix-invalid-model',
          authType: 'api_key',
          baseUrl: 'https://chat.nuoda.vip/claudecode',
          apiKey: 'sk-route',
          models: ['claude-opus-4-6'],
          setActive: false,
        }),
      });
      const profileId = createRes.json().profile.id;

      const testRes = await app.inject({
        method: 'POST',
        url: `/api/provider-profiles/${profileId}/test`,
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
        }),
      });
      assert.equal(testRes.statusCode, 200);
      const body = testRes.json();
      assert.equal(body.ok, true);
      assert.deepEqual(
        calls.map((call) => `${call.method} ${new URL(call.url).pathname}`),
        ['GET /claudecode/v1/models', 'POST /claudecode/v1/messages'],
      );
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('rejects blank profile name in create request', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const projectDir = await makeTmpDir('blank-name');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          displayName: '   ',
          authType: 'api_key',
        }),
      });
      assert.equal(createRes.statusCode, 400);
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('POST /api/provider-profiles/:id/test validates openai api_key providers via fetch', async () => {
    const Fastify = (await import('fastify')).default;
    const calls = [];
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes, {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), headers: init?.headers });
        return new Response('{}', { status: 200 });
      },
    });
    await app.ready();

    const projectDir = await makeTmpDir('test-openai');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          displayName: 'codex-sponsor',
          authType: 'api_key',
          baseUrl: 'https://api.openai-proxy.dev',
          apiKey: 'sk-openai',
          models: ['gpt-5.4'],
          setActive: false,
        }),
      });
      assert.equal(createRes.statusCode, 200);
      const profileId = createRes.json().profile.id;

      const testRes = await app.inject({
        method: 'POST',
        url: `/api/provider-profiles/${profileId}/test`,
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
        }),
      });
      assert.equal(testRes.statusCode, 200);
      assert.equal(testRes.json().ok, true);
      assert.equal(new URL(calls[0].url).pathname, '/v1/models');
      assert.equal(calls[0].headers.authorization, 'Bearer sk-openai');
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('POST /api/provider-profiles/:id/test probes Gemini-style /v1beta/models endpoints', async () => {
    const Fastify = (await import('fastify')).default;
    const calls = [];
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes, {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), headers: init?.headers });
        const path = new URL(String(url)).pathname;
        if (path.endsWith('/v1beta/models')) return new Response('{}', { status: 200 });
        return new Response('not found', { status: 404 });
      },
    });
    await app.ready();

    const projectDir = await makeTmpDir('test-google');
    setGlobalRoot(projectDir);
    try {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/provider-profiles',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
          displayName: 'gemini-sponsor',
          authType: 'api_key',
          baseUrl: 'https://generativelanguage.googleapis.com',
          apiKey: 'gsk-google',
          models: ['gemini-2.5-pro'],
          setActive: false,
        }),
      });
      assert.equal(createRes.statusCode, 200);
      const profileId = createRes.json().profile.id;

      const testRes = await app.inject({
        method: 'POST',
        url: `/api/provider-profiles/${profileId}/test`,
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          projectPath: projectDir,
        }),
      });
      assert.equal(testRes.statusCode, 200);
      assert.equal(testRes.json().ok, true);
      assert.equal(new URL(calls[0].url).pathname, '/v1beta/models');
    } finally {
      restoreGlobalRoot();
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('accepts workspace projectPath even when validateProjectPath allowlist excludes it', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const workspaceDir = await makeWorkspaceDir('switch');
    setGlobalRoot(workspaceDir);
    const previousRoots = process.env.PROJECT_ALLOWED_ROOTS;
    const previousAppend = process.env.PROJECT_ALLOWED_ROOTS_APPEND;
    process.env.PROJECT_ALLOWED_ROOTS = '/tmp';
    delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/api/provider-profiles?projectPath=${encodeURIComponent(workspaceDir)}`,
        headers: AUTH_HEADERS,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().projectPath, await realpath(workspaceDir));
    } finally {
      restoreGlobalRoot();
      if (previousRoots === undefined) delete process.env.PROJECT_ALLOWED_ROOTS;
      else process.env.PROJECT_ALLOWED_ROOTS = previousRoots;
      if (previousAppend === undefined) delete process.env.PROJECT_ALLOWED_ROOTS_APPEND;
      else process.env.PROJECT_ALLOWED_ROOTS_APPEND = previousAppend;
      await rm(workspaceDir, { recursive: true, force: true });
      await app.close();
    }
  });

  it('defaults projectPath to CAT_TEMPLATE_PATH directory when query omits projectPath', async () => {
    const Fastify = (await import('fastify')).default;
    const { providerProfilesRoutes } = await import('../dist/routes/provider-profiles.js');
    const app = Fastify();
    await app.register(providerProfilesRoutes);
    await app.ready();

    const projectDir = await makeTmpDir('default-root');
    setGlobalRoot(projectDir);
    const templatePath = join(projectDir, 'office-claw-template.json');
    await writeFile(templatePath, '{}\n', 'utf-8');
    const prevTemplate = process.env.CAT_TEMPLATE_PATH;
    process.env.CAT_TEMPLATE_PATH = templatePath;

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/provider-profiles',
        headers: AUTH_HEADERS,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().projectPath, await realpath(projectDir));
    } finally {
      restoreGlobalRoot();
      if (prevTemplate === undefined) delete process.env.CAT_TEMPLATE_PATH;
      else process.env.CAT_TEMPLATE_PATH = prevTemplate;
      await rm(projectDir, { recursive: true, force: true });
      await app.close();
    }
  });
});
