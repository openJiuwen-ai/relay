/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F12: env-registry + GET /api/config/env-summary tests
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { getHubEnvPatchWhitelist } from '../dist/config/env-patch-whitelist.js';
import { buildEnvSummary, ENV_CATEGORIES, ENV_VARS, maskUrlCredentials } from '../dist/config/env-registry.js';

// Save and restore env vars around tests
const savedEnv = {};
const BOOTSTRAP_ONLY_NEXT_PUBLIC_VARS = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WHISPER_URL',
  'NEXT_PUBLIC_LLM_POSTPROCESS_URL',
  'NEXT_PUBLIC_PROJECT_ROOT',
  'NEXT_PUBLIC_DEBUG_SKIP_FILE_CHANGE_UI',
];
const HUB_ENV_PATCH_WHITELIST_ENV_NAME = 'OFFICE_CLAW_ENV_PATCH_WHITELIST';
const PAID_SEARCH_API_KEYS = [
  'PERPLEXITY_API_KEY',
  'SERPER_API_KEY',
  'JINA_API_KEY',
  'BOCHA_API_KEY',
];

function setEnv(key, value) {
  savedEnv[key] = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function markRequestAuthenticated(app, userId = 'codex') {
  app.addHook('onRequest', async (request) => {
    request.authenticatedUserId = userId;
  });
}

describe('env-registry', () => {
  afterEach(() => restoreEnv());

  it('exports at least 20 env var definitions', () => {
    assert.ok(ENV_VARS.length >= 20, `Expected >= 20, got ${ENV_VARS.length}`);
  });

  it('has no duplicate env var names', () => {
    const names = ENV_VARS.map((v) => v.name);
    const unique = new Set(names);
    assert.equal(unique.size, names.length, `Duplicate names found: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
  });

  it('every env var has a valid category', () => {
    const validCategories = Object.keys(ENV_CATEGORIES);
    for (const def of ENV_VARS) {
      assert.ok(validCategories.includes(def.category), `${def.name} has invalid category: ${def.category}`);
    }
  });

  it('OPENAI_API_KEY is marked sensitive', () => {
    const apiKey = ENV_VARS.find((v) => v.name === 'OPENAI_API_KEY');
    assert.ok(apiKey, 'OPENAI_API_KEY should be in registry');
    assert.equal(apiKey.sensitive, true);
  });

  it('REDIS_URL has maskMode url', () => {
    const redis = ENV_VARS.find((v) => v.name === 'REDIS_URL');
    assert.ok(redis, 'REDIS_URL should be in registry');
    assert.equal(redis.maskMode, 'url');
  });

  it('keeps API server port bootstrap-only while allowing explicitly whitelisted runtime edits', () => {
    const apiPort = ENV_VARS.find((v) => v.name === 'API_SERVER_PORT');
    const frontendUrl = ENV_VARS.find((v) => v.name === 'FRONTEND_URL');
    assert.ok(apiPort, 'API_SERVER_PORT should be in registry');
    assert.ok(frontendUrl, 'FRONTEND_URL should be in registry');
    assert.equal(apiPort.runtimeEditable, false);
    assert.notEqual(frontendUrl.runtimeEditable, false);
  });

  it('marks CAT_TEMPLATE_PATH and REDIS_URL as bootstrap-only in hub env editor', () => {
    const templatePath = ENV_VARS.find((v) => v.name === 'CAT_TEMPLATE_PATH');
    const redisUrl = ENV_VARS.find((v) => v.name === 'REDIS_URL');
    assert.ok(templatePath, 'CAT_TEMPLATE_PATH should be in registry');
    assert.ok(redisUrl, 'REDIS_URL should be in registry');
    assert.equal(templatePath.runtimeEditable, false);
    assert.equal(redisUrl.runtimeEditable, false);
  });

  it('marks client-bundled NEXT_PUBLIC vars as bootstrap-only in the hub env editor', () => {
    for (const name of BOOTSTRAP_ONLY_NEXT_PUBLIC_VARS) {
      const envVar = ENV_VARS.find((v) => v.name === name);
      assert.ok(envVar, `${name} should be in registry`);
      assert.equal(envVar.runtimeEditable, false, `${name} should be bootstrap-only`);
    }
  });

  it('no HINDSIGHT_* vars remain after D-1 cleanup', () => {
    const hindsightVars = ENV_VARS.filter((v) => v.name.startsWith('HINDSIGHT_'));
    assert.equal(hindsightVars.length, 0, 'All HINDSIGHT_* vars should be removed');
  });
});

describe('env patch whitelist', () => {
  afterEach(() => restoreEnv());

  it('parses semicolon-delimited whitelist entries from env', () => {
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY; DINGTALK_APP_SECRET ;XIAOYI_AGENT_ID;;');
    const whitelist = getHubEnvPatchWhitelist();
    assert.deepEqual([...whitelist], ['DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET', 'XIAOYI_AGENT_ID']);
  });
});

describe('maskUrlCredentials', () => {
  it('masks user:password in redis URL', () => {
    const result = maskUrlCredentials('redis://user:super-secret@localhost:6399/15');
    assert.ok(!result.includes('super-secret'), `Leaked password: ${result}`);
    assert.ok(result.includes('localhost:6399'), `Lost host: ${result}`);
    assert.ok(result.includes('/15'), `Lost db: ${result}`);
  });

  it('preserves URL without credentials', () => {
    const result = maskUrlCredentials('redis://localhost:6399');
    assert.ok(result.includes('localhost:6399'), `Lost host: ${result}`);
    assert.ok(!result.includes('***'), `Unnecessary masking: ${result}`);
  });

  it('masks user-only auth', () => {
    const result = maskUrlCredentials('redis://admin@localhost:6399');
    assert.ok(!result.includes('admin'), `Leaked username: ${result}`);
    assert.ok(result.includes('***'), `Should have masked: ${result}`);
  });

  it('returns *** for non-URL strings', () => {
    assert.equal(maskUrlCredentials('not-a-url'), '***');
  });
});

describe('buildEnvSummary', () => {
  afterEach(() => restoreEnv());

  it('returns currentValue for set env vars', () => {
    setEnv('API_SERVER_PORT', '4000');
    const summary = buildEnvSummary();
    const entry = summary.find((v) => v.name === 'API_SERVER_PORT');
    assert.ok(entry);
    assert.equal(entry.currentValue, '4000');
  });

  it('returns null for unset env vars', () => {
    setEnv('FRONTEND_URL', undefined);
    const summary = buildEnvSummary();
    const entry = summary.find((v) => v.name === 'FRONTEND_URL');
    assert.ok(entry);
    assert.equal(entry.currentValue, null);
  });

  it('masks sensitive env vars with ***', () => {
    setEnv('OPENAI_API_KEY', 'sk-secret-key-12345');
    const summary = buildEnvSummary();
    const entry = summary.find((v) => v.name === 'OPENAI_API_KEY');
    assert.ok(entry);
    assert.equal(entry.currentValue, '***');
  });

  it('masks REDIS_URL credentials but preserves host', () => {
    setEnv('REDIS_URL', 'redis://user:super-secret@myhost:6399/15');
    const summary = buildEnvSummary();
    const entry = summary.find((v) => v.name === 'REDIS_URL');
    assert.ok(entry);
    assert.ok(!entry.currentValue.includes('super-secret'), `Leaked password: ${entry.currentValue}`);
    assert.ok(entry.currentValue.includes('myhost:6399'), `Lost host: ${entry.currentValue}`);
  });

  it('returns same number of entries as ENV_VARS', () => {
    const summary = buildEnvSummary();
    assert.ok(summary.length < ENV_VARS.length);
  });

  it('marks only whitelisted vars as runtime editable in hub summary', () => {
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY;DINGTALK_APP_SECRET');
    const summary = buildEnvSummary();
    const dingtalkAppKey = summary.find((v) => v.name === 'DINGTALK_APP_KEY');
    const frontendUrl = summary.find((v) => v.name === 'FRONTEND_URL');
    assert.ok(dingtalkAppKey);
    assert.ok(frontendUrl);
    assert.notEqual(dingtalkAppKey.runtimeEditable, false);
    assert.equal(frontendUrl.runtimeEditable, false);
  });

  it('hides per-cat runtime budget env vars from hub summary', () => {
    const summary = buildEnvSummary();
    assert.equal(
      summary.some((v) => v.name === 'CAT_OPUS_MAX_PROMPT_CHARS'),
      false,
    );
    assert.equal(
      summary.some((v) => v.name === 'CAT_CODEX_MAX_PROMPT_CHARS'),
      false,
    );
    assert.equal(
      summary.some((v) => v.name === 'CAT_GEMINI_MAX_PROMPT_CHARS'),
      false,
    );
    assert.equal(
      summary.some((v) => v.name === 'MAX_PROMPT_TOKENS'),
      false,
    );
  });
});

describe('GET /api/config/env-summary (route)', () => {
  it('projectRoot follows CAT_TEMPLATE_PATH directory when set', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-summary-'));
    const templatePath = resolve(tempRoot, 'office-claw-template.json');
    writeFileSync(templatePath, '{}', 'utf8');
    setEnv('CAT_TEMPLATE_PATH', templatePath);
    const app = Fastify({ logger: false });
    try {
      await configRoutes(app);
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/api/config/env-summary' });
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      const root = body.paths.projectRoot;
      assert.equal(root, tempRoot);
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('dataDirs returns absolute resolved paths from API', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const app = Fastify({ logger: false });
    await configRoutes(app);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/config/env-summary' });
    const body = JSON.parse(res.payload);
    const { dataDirs } = body.paths;

    assert.ok(dataDirs, 'paths.dataDirs should exist');
    for (const key of ['auditLogs', 'cliArchive', 'redisDevSandbox', 'uploads']) {
      assert.ok(dataDirs[key], `dataDirs.${key} should exist`);
      assert.ok(isAbsolute(dataDirs[key]), `dataDirs.${key} should be absolute, got: ${dataDirs[key]}`);
    }

    await app.close();
  });
});

describe('PATCH /api/config/env (route)', () => {
  afterEach(() => restoreEnv());

  it('rejects channel env writes when the whitelist env is missing', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    writeFileSync(envFilePath, 'DINGTALK_APP_KEY=ding-old\n', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'DINGTALK_APP_KEY', value: 'ding-new' }],
        },
      });

      assert.equal(res.statusCode, 400);
      assert.match(JSON.parse(res.payload).error, /not editable/i);
      assert.equal(readFileSync(envFilePath, 'utf8'), 'DINGTALK_APP_KEY=ding-old\n');
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows paid search keys even when whitelist env is missing', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-search-'));
    const envFilePath = resolve(tempRoot, '.env');
    writeFileSync(envFilePath, 'BOCHA_API_KEY=old-key\n', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'BOCHA_API_KEY', value: 'new-key' }],
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.ok, true);
      assert.equal(readFileSync(envFilePath, 'utf8'), 'BOCHA_API_KEY=new-key\n');
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('writes runtime-editable env vars back to the configured .env file', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    const auditEvents = [];
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY');
    writeFileSync(envFilePath, 'DINGTALK_APP_KEY=ding-old\nOPENAI_API_KEY=sk-old\n', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: {
          append: async (event) => {
            auditEvents.push(event);
          },
        },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'DINGTALK_APP_KEY', value: 'ding-new' }],
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.ok, true);
      assert.equal(readFileSync(envFilePath, 'utf8'), 'DINGTALK_APP_KEY=ding-new\nOPENAI_API_KEY=sk-old\n');
      assert.equal(process.env.DINGTALK_APP_KEY, 'ding-new');
      assert.equal(auditEvents.length, 1);
      assert.equal(auditEvents[0].data.target, '.env');
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rolls back process.env when runtimeEnvStore.save fails', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY');
    writeFileSync(envFilePath, 'DINGTALK_APP_KEY=ding-old\n', 'utf8');
    process.env.DINGTALK_APP_KEY = 'ding-old';

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        runtimeEnvStore: {
          async load() {
            return {};
          },
          async save() {
            throw new Error('save failed');
          },
        },
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'DINGTALK_APP_KEY', value: 'ding-new' }],
        },
      });

      assert.equal(res.statusCode, 500);
      assert.equal(process.env.DINGTALK_APP_KEY, 'ding-old');
      assert.equal(readFileSync(envFilePath, 'utf8'), 'DINGTALK_APP_KEY=ding-old\n');
    } finally {
      delete process.env.DINGTALK_APP_KEY;
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('writes whitelisted paid search keys back to the configured .env file', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-search-'));
    const envFilePath = resolve(tempRoot, '.env');
    const auditEvents = [];
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, PAID_SEARCH_API_KEYS.join(';'));
    writeFileSync(
      envFilePath,
      [
        'PERPLEXITY_API_KEY=old-perplexity',
        'SERPER_API_KEY=old-serper',
        'JINA_API_KEY=old-jina',
        'BOCHA_API_KEY=old-bocha',
      ].join('\n') + '\n',
      'utf8',
    );

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: {
          append: async (event) => {
            auditEvents.push(event);
          },
        },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: PAID_SEARCH_API_KEYS.map((name) => ({ name, value: `new-${name.toLowerCase()}` })),
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.ok, true);

      const nextEnv = readFileSync(envFilePath, 'utf8');
      for (const name of PAID_SEARCH_API_KEYS) {
        assert.match(nextEnv, new RegExp(`^${name}=new-${name.toLowerCase()}$`, 'm'));
        assert.equal(process.env[name], `new-${name.toLowerCase()}`);
      }
      assert.equal(auditEvents.length, 1);
      assert.deepEqual(auditEvents[0].data.keys, PAID_SEARCH_API_KEYS);
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('triggers connector runtime reconcile and reports immediate apply for connector env vars', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY');
    writeFileSync(envFilePath, 'DINGTALK_APP_KEY=old-key\n', 'utf8');
    const reconcileCalls = [];
    const ownerCalls = [];

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        connectorRuntimeManager: {
          async setOwnerUserId(userId) {
            ownerCalls.push(userId);
          },
          async reconcile(keys) {
            reconcileCalls.push(keys);
            return {
              applied: true,
              attemptedConnectors: ['dingtalk'],
              appliedConnectors: ['dingtalk'],
              unchangedConnectors: [],
              failedConnectors: [],
            };
          },
        },
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'DINGTALK_APP_KEY', value: 'new-key' }],
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.ok, true);
      assert.equal(body.requiresRestart, false);
      assert.equal(body.runtime.applied, true);
      assert.deepEqual(ownerCalls, ['codex']);
      assert.deepEqual(reconcileCalls, [['DINGTALK_APP_KEY']]);
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('trims connector credentials before persisting them to .env', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY;DINGTALK_APP_SECRET');
    const reconcileCalls = [];

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        connectorRuntimeManager: {
          async reconcile(keys) {
            reconcileCalls.push(keys);
            return {
              applied: true,
              attemptedConnectors: ['dingtalk'],
              appliedConnectors: ['dingtalk'],
              unchangedConnectors: [],
              failedConnectors: [],
            };
          },
        },
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [
            { name: 'DINGTALK_APP_KEY', value: '  ding-key  ' },
            { name: 'DINGTALK_APP_SECRET', value: '\nding-secret\t' },
          ],
        },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.ok, true);
      assert.equal(process.env.DINGTALK_APP_KEY, 'ding-key');
      assert.equal(process.env.DINGTALK_APP_SECRET, 'ding-secret');
      assert.equal(
        readFileSync(envFilePath, 'utf8'),
        'DINGTALK_APP_KEY=ding-key\nDINGTALK_APP_SECRET_REF=wincred://OfficeClaw/env/DINGTALK_APP_SECRET\n',
      );
      assert.equal(process.env.DINGTALK_APP_SECRET_REF, 'wincred://OfficeClaw/env/DINGTALK_APP_SECRET');
      assert.deepEqual(reconcileCalls, [['DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET']]);
    } finally {
      await app.close();
      delete process.env.DINGTALK_APP_KEY;
      delete process.env.DINGTALK_APP_SECRET;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('escapes shell substitution characters when persisting .env values', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    const literal = 'https://proxy.example/$HOME/$(whoami)/`whoami`';
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY');
    writeFileSync(envFilePath, '', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'DINGTALK_APP_KEY', value: literal }],
        },
      });

      assert.equal(res.statusCode, 200);
      const persisted = readFileSync(envFilePath, 'utf8');
      assert.match(persisted, /^DINGTALK_APP_KEY="https:\/\/proxy\.example\/\$HOME\/\$\(whoami\)\/`whoami`"$/m);

      const { createLocalDotenvRuntimeEnvStore } = await import('../dist/config/runtime-env-store.js');
      const loaded = await createLocalDotenvRuntimeEnvStore({ envFilePath }).load();
      assert.equal(loaded.DINGTALK_APP_KEY, literal);
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('escapes CR/LF characters to avoid multiline env injection', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    const literal = 'line1\r\nline2\nline3';
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'DINGTALK_APP_KEY');
    writeFileSync(envFilePath, '', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'DINGTALK_APP_KEY', value: literal }],
        },
      });

      assert.equal(res.statusCode, 200);
      const persisted = readFileSync(envFilePath, 'utf8');
      assert.match(persisted, /^DINGTALK_APP_KEY="line1\\r\\nline2\\nline3"$/m);
      assert.equal(persisted.trimEnd().split('\n').length, 1);

      const { createLocalDotenvRuntimeEnvStore } = await import('../dist/config/runtime-env-store.js');
      const loaded = await createLocalDotenvRuntimeEnvStore({ envFilePath }).load();
      assert.equal(loaded.DINGTALK_APP_KEY, 'line1\\r\nline2\nline3');
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects sensitive env vars from hub writes', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    writeFileSync(envFilePath, 'OPENAI_API_KEY=sk-old\n', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'OPENAI_API_KEY', value: 'sk-new' }],
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.match(body.error, /not editable/);
      assert.equal(readFileSync(envFilePath, 'utf8'), 'OPENAI_API_KEY=sk-old\n');
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects client-bundled NEXT_PUBLIC vars from hub writes because the browser reads them at build time', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    writeFileSync(
      envFilePath,
      [
        'NEXT_PUBLIC_API_URL=http://localhost:3004',
        'NEXT_PUBLIC_WHISPER_URL=http://localhost:9876',
        'NEXT_PUBLIC_LLM_POSTPROCESS_URL=http://localhost:9878',
        'NEXT_PUBLIC_PROJECT_ROOT=/tmp/project',
        'NEXT_PUBLIC_DEBUG_SKIP_FILE_CHANGE_UI=0',
      ].join('\n') + '\n',
      'utf8',
    );

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const beforeRaw = readFileSync(envFilePath, 'utf8');
      for (const name of BOOTSTRAP_ONLY_NEXT_PUBLIC_VARS) {
        const res = await app.inject({
          method: 'PATCH',
          url: '/api/config/env',
          headers: { 'x-office-claw-user': 'codex' },
          payload: {
            updates: [{ name, value: `${name}-changed` }],
          },
        });

        assert.equal(res.statusCode, 400, `${name} should be rejected`);
        const body = JSON.parse(res.payload);
        assert.match(body.error, /not editable/);
        assert.equal(readFileSync(envFilePath, 'utf8'), beforeRaw);
      }
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects internal runtime budget env vars from hub writes', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    writeFileSync(envFilePath, 'CAT_OPUS_MAX_PROMPT_CHARS=150000\n', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'CAT_OPUS_MAX_PROMPT_CHARS', value: '180000' }],
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.match(body.error, /not editable/);
      assert.equal(readFileSync(envFilePath, 'utf8'), 'CAT_OPUS_MAX_PROMPT_CHARS=150000\n');
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('applies the env whitelist before evaluating runtime-editable status', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    setEnv(HUB_ENV_PATCH_WHITELIST_ENV_NAME, 'FRONTEND_URL');
    writeFileSync(envFilePath, 'API_SERVER_PORT=3003\nFRONTEND_URL=http://localhost:3004\n', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const apiPortRes = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'API_SERVER_PORT', value: '3203' }],
        },
      });
      assert.equal(apiPortRes.statusCode, 400);
      assert.match(JSON.parse(apiPortRes.payload).error, /not editable/i);

      const frontendUrlRes = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'FRONTEND_URL', value: 'http://localhost:3200' }],
        },
      });
      assert.equal(frontendUrlRes.statusCode, 200);

      const nextEnv = readFileSync(envFilePath, 'utf8');
      assert.match(nextEnv, /API_SERVER_PORT=3003/);
      assert.match(nextEnv, /FRONTEND_URL=http:\/\/localhost:3200/);
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects REDIS_URL from hub writes because runtime redis clients are bootstrapped at startup', async () => {
    const { configRoutes } = await import('../dist/routes/config.js');
    const tempRoot = mkdtempSync(resolve(tmpdir(), 'office-claw-env-'));
    const envFilePath = resolve(tempRoot, '.env');
    writeFileSync(envFilePath, 'REDIS_URL=redis://localhost:6399/15\n', 'utf8');

    const app = Fastify({ logger: false });
    markRequestAuthenticated(app);
    try {
      await configRoutes(app, {
        projectRoot: tempRoot,
        envFilePath,
        auditLog: { append: async () => {} },
      });
      await app.ready();

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/config/env',
        headers: { 'x-office-claw-user': 'codex' },
        payload: {
          updates: [{ name: 'REDIS_URL', value: 'redis://localhost:6398/15' }],
        },
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.match(body.error, /not editable/i);
      assert.equal(readFileSync(envFilePath, 'utf8'), 'REDIS_URL=redis://localhost:6399/15\n');
    } finally {
      await app.close();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
