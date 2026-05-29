/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

const runtimeEnvModule = await import('../dist/config/runtime-env-store.js');
const connectorSecretUpdaterModule = await import('../dist/config/connector-secret-updater.js');
const resolverModule = await import('../dist/config/runtime-env-store-resolver.js');
const secretStoreModule = await import('../dist/config/local-secret-store.js');

const {
  bootstrapRuntimeEnv,
  createLocalDotenvRuntimeEnvStore,
} = runtimeEnvModule;
const { applyConnectorSecretUpdates } = connectorSecretUpdaterModule;
const {
  bootstrapConfiguredRuntimeEnv,
  discoverRuntimeEnvStore,
  getConfiguredRuntimeEnvStore,
  resetDiscoveredRuntimeEnvStoreForTests,
  resolveRuntimeEnvStore,
  setConfiguredRuntimeEnvStore,
} = resolverModule;
const {
  resetLocalSecretBackendForTests,
  setLocalSecretBackendForTests,
} = secretStoreModule;

describe('LocalDotenvRuntimeEnvStore', { concurrency: false }, () => {
  const savedEnv = {};

  function setEnv(key, value) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const key of Object.keys(savedEnv)) delete savedEnv[key];
    setConfiguredRuntimeEnvStore(null);
    resetDiscoveredRuntimeEnvStoreForTests();
    resetLocalSecretBackendForTests();
  });

  it('loads dotenv values and resolves connector refs into plaintext runtime values', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-load-'));
    writeFileSync(
      join(root, '.env'),
      [
        'API_SERVER_PORT=3010',
        'NORMAL_KEY=hello',
        'DINGTALK_APP_SECRET_REF=wincred://OfficeClaw/env/DINGTALK_APP_SECRET',
        '',
      ].join('\n'),
      'utf8',
    );

    setLocalSecretBackendForTests({
      get(key) {
        return key === 'OfficeClaw/env/DINGTALK_APP_SECRET' ? 'secret-from-store' : null;
      },
      getBatch(keys) {
        const result = new Map();
        for (const key of keys) {
          if (key === 'OfficeClaw/env/DINGTALK_APP_SECRET') result.set(key, 'secret-from-store');
        }
        return result;
      },
      set() {},
      delete() {},
    });

    const store = createLocalDotenvRuntimeEnvStore({ envFilePath: join(root, '.env') });
    const loaded = await store.load();
    assert.equal(loaded.API_SERVER_PORT, '3010');
    assert.equal(loaded.NORMAL_KEY, 'hello');
    assert.equal(loaded.DINGTALK_APP_SECRET, 'secret-from-store');
    assert.equal(loaded.DINGTALK_APP_SECRET_REF, 'wincred://OfficeClaw/env/DINGTALK_APP_SECRET');
  });

  it('matches Node dotenv parsing semantics for quoted values and inline comments', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-parse-'));
    writeFileSync(
      join(root, '.env'),
      [
        "SINGLE='hello world'",
        'DOUBLE="hello world"',
        'INLINE=hello # note',
        '',
      ].join('\n'),
      'utf8',
    );

    const store = createLocalDotenvRuntimeEnvStore({ envFilePath: join(root, '.env') });
    const loaded = await store.load();

    assert.equal(loaded.SINGLE, 'hello world');
    assert.equal(loaded.DOUBLE, 'hello world');
    assert.equal(loaded.INLINE, 'hello');
  });

  it('persists plain env values and secret-backed connector values with refs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-save-'));
    writeFileSync(join(root, '.env'), 'EXISTING=1\n', 'utf8');

    const writes = new Map();
    const deletes = [];
    setLocalSecretBackendForTests({
      get() {
        return null;
      },
      getBatch() {
        return new Map();
      },
      set(key, value) {
        writes.set(key, value);
      },
      delete(key) {
        deletes.push(key);
      },
    });

    const store = createLocalDotenvRuntimeEnvStore({ envFilePath: join(root, '.env') });
    await store.save({
      API_SERVER_PORT: '3008',
      DINGTALK_APP_SECRET: 'super-secret',
    });

    const next = readFileSync(join(root, '.env'), 'utf8');
    assert.match(next, /EXISTING=1/);
    assert.match(next, /API_SERVER_PORT=3008/);
    assert.doesNotMatch(next, /DINGTALK_APP_SECRET=/);
    assert.match(next, /DINGTALK_APP_SECRET_REF=wincred:\/\/OfficeClaw\/env\/DINGTALK_APP_SECRET/);
    assert.equal(writes.get('OfficeClaw/env/DINGTALK_APP_SECRET'), 'super-secret');
    assert.deepEqual(deletes, []);
  });

  it('bootstrapRuntimeEnv overwrites inherited env values with store-loaded values', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-bootstrap-'));
    writeFileSync(join(root, '.env'), 'API_SERVER_PORT=3999\nNORMAL_KEY=from-file\n', 'utf8');

    const env = { API_SERVER_PORT: '3004' };
    const store = createLocalDotenvRuntimeEnvStore({ envFilePath: join(root, '.env') });
    const loaded = await bootstrapRuntimeEnv(store, env);

    assert.equal(loaded.API_SERVER_PORT, '3999');
    assert.equal(env.API_SERVER_PORT, '3999');
    assert.equal(env.NORMAL_KEY, 'from-file');
  });

  it('bootstrapRuntimeEnv preserves inherited env keys that the store does not override', async () => {
    const store = {
      async load() {
        return { API_SERVER_PORT: '3999' };
      },
      async save() {},
    };
    const env = {
      API_SERVER_PORT: '3004',
      OPENAI_API_KEY: 'stale-key',
      PATH: 'system-path',
    };

    const loaded = await bootstrapRuntimeEnv(store, env);

    assert.deepEqual(loaded, { API_SERVER_PORT: '3999' });
    assert.equal(env.API_SERVER_PORT, '3999');
    assert.equal(env.OPENAI_API_KEY, 'stale-key');
    assert.equal(env.PATH, 'system-path');
  });

  it('bootstrapConfiguredRuntimeEnv preserves explicit startup env when the resolved store omits that key', async () => {
    const env = {
      API_SERVER_PORT: '3314',
      API_SERVER_HOST: '0.0.0.0',
      REDIS_URL: 'redis://example.test:6380/9',
    };

    const loaded = await bootstrapConfiguredRuntimeEnv({
      env,
      runtimeEnvStore: {
        async load() {
          return { REMOTE_ONLY: '1' };
        },
        async save() {},
      },
    });

    assert.deepEqual(loaded, { REMOTE_ONLY: '1' });
    assert.equal(env.API_SERVER_PORT, '3314');
    assert.equal(env.API_SERVER_HOST, '0.0.0.0');
    assert.equal(env.REDIS_URL, 'redis://example.test:6380/9');
    assert.equal(env.REMOTE_ONLY, '1');
  });

  it('bootstrapRuntimeEnv can preserve explicit startup values for bootstrap-only env vars when requested', async () => {
    const env = {
      API_SERVER_PORT: '3314',
      REDIS_URL: 'redis://example.test:6380/9',
      FRONTEND_URL: 'http://override.example.test:3003',
    };
    const store = {
      async load() {
        return {
          API_SERVER_PORT: '3999',
          REDIS_URL: 'redis://localhost:6399',
          FRONTEND_URL: 'http://from-file.example.test:3003',
          REMOTE_ONLY: '1',
        };
      },
      async save() {},
    };

    const loaded = await bootstrapRuntimeEnv(store, env, { preserveExistingBootstrapOnly: true });

    assert.equal(loaded.API_SERVER_PORT, '3999');
    assert.equal(loaded.REDIS_URL, 'redis://localhost:6399');
    assert.equal(loaded.FRONTEND_URL, 'http://from-file.example.test:3003');
    assert.equal(env.API_SERVER_PORT, '3314');
    assert.equal(env.REDIS_URL, 'redis://example.test:6380/9');
    assert.equal(env.FRONTEND_URL, 'http://from-file.example.test:3003');
    assert.equal(env.REMOTE_ONLY, '1');
  });

  it('bootstrapConfiguredRuntimeEnv does not override explicit startup values for bootstrap-only env vars from dotenv', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-bootstrap-only-'));
    const envFilePath = join(root, '.env');
    writeFileSync(
      envFilePath,
      ['API_SERVER_PORT=3999', 'REDIS_URL=redis://localhost:6399', 'FRONTEND_URL=http://from-file.example.test:3003', ''].join(
        '\n',
      ),
      'utf8',
    );
    const env = {
      API_SERVER_PORT: '3314',
      REDIS_URL: 'redis://example.test:6380/9',
    };

    const loaded = await bootstrapConfiguredRuntimeEnv({ envFilePath, env });

    assert.equal(loaded.API_SERVER_PORT, '3999');
    assert.equal(loaded.REDIS_URL, 'redis://localhost:6399');
    assert.equal(env.API_SERVER_PORT, '3314');
    assert.equal(env.REDIS_URL, 'redis://example.test:6380/9');
    assert.equal(env.FRONTEND_URL, 'http://from-file.example.test:3003');
  });

  it('bootstrapConfiguredRuntimeEnv does not resurrect REDIS_URL from dotenv after launcher chose MEMORY_STORE=1', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-memory-store-'));
    const envFilePath = join(root, '.env');
    writeFileSync(
      envFilePath,
      ['REDIS_URL=redis://localhost:6399', 'API_SERVER_PORT=3999', 'FRONTEND_URL=http://from-file.example.test:3003', ''].join(
        '\n',
      ),
      'utf8',
    );
    const env = {
      MEMORY_STORE: '1',
    };
    delete process.env.REDIS_URL;
    delete process.env.REDIS_PORT;

    const loaded = await bootstrapConfiguredRuntimeEnv({ envFilePath, env });

    assert.equal(loaded.REDIS_URL, 'redis://localhost:6399');
    assert.equal(env.MEMORY_STORE, '1');
    assert.equal(env.REDIS_URL, undefined);
    assert.equal(env.API_SERVER_PORT, '3999');
    assert.equal(env.FRONTEND_URL, 'http://from-file.example.test:3003');
  });

  it('bootstrapConfiguredRuntimeEnv still hydrates other bootstrap-only env vars in memory mode when not explicitly set', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-memory-bootstrap-'));
    const envFilePath = join(root, '.env');
    writeFileSync(envFilePath, 'API_SERVER_PORT=4555\nCAT_TEMPLATE_PATH=D:/configs/office-claw-template.json\n', 'utf8');
    const env = {
      MEMORY_STORE: '1',
    };

    const loaded = await bootstrapConfiguredRuntimeEnv({ envFilePath, env });

    assert.equal(loaded.API_SERVER_PORT, '4555');
    assert.equal(loaded.CAT_TEMPLATE_PATH, 'D:/configs/office-claw-template.json');
    assert.equal(env.API_SERVER_PORT, '4555');
    assert.equal(env.CAT_TEMPLATE_PATH, 'D:/configs/office-claw-template.json');
    assert.equal(env.REDIS_URL, undefined);
  });

  it('restores process.env when connector secret persistence fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-rollback-'));
    const refName = 'DINGTALK_APP_SECRET_REF';
    process.env.DINGTALK_APP_SECRET = 'old-secret';
    process.env[refName] = 'old-ref';

    try {
      await assert.rejects(
        applyConnectorSecretUpdates(
          [{ name: 'DINGTALK_APP_SECRET', value: 'new-secret' }],
          {
            envFilePath: join(root, '.env'),
            runtimeEnvStore: {
              async load() {
                return {};
              },
              async save() {
                throw new Error('persist failed');
              },
            },
          },
        ),
        /persist failed/,
      );

      assert.equal(process.env.DINGTALK_APP_SECRET, 'old-secret');
      assert.equal(process.env[refName], 'old-ref');
    } finally {
      delete process.env.DINGTALK_APP_SECRET;
      delete process.env[refName];
    }
  });

  it('resolveRuntimeEnvStore prefers a configured external store over the local fallback', async () => {
    const externalStore = {
      async load() {
        return { API_SERVER_PORT: '4555' };
      },
      async save() {},
    };
    setConfiguredRuntimeEnvStore(externalStore);

    const resolved = await resolveRuntimeEnvStore();

    assert.equal(resolved, externalStore);
    assert.equal(getConfiguredRuntimeEnvStore(), externalStore);
  });

  it('resolveRuntimeEnvStore returns an explicit store before attempting discovery', async () => {
    const explicitStore = {
      async load() {
        return { API_SERVER_PORT: '6001' };
      },
      async save() {},
    };
    const brokenRoot = mkdtempSync(join(tmpdir(), 'runtime-env-broken-discovery-'));
    const brokenPkgRoot = join(brokenRoot, 'packages', 'broken-runtime-env-store');
    mkdirSync(brokenPkgRoot, { recursive: true });
    writeFileSync(
      join(brokenPkgRoot, 'package.json'),
      JSON.stringify(
        {
          name: '@office-claw/broken-runtime-env-store',
          version: '0.1.0',
          type: 'module',
          main: './dist/missing.js',
          clowder: { kind: 'runtime-env-store' },
        },
        null,
        2,
      ),
      'utf8',
    );

    const resolved = await resolveRuntimeEnvStore({
      runtimeEnvStore: explicitStore,
      searchPaths: [join(brokenRoot, 'packages')],
    });

    assert.equal(resolved, explicitStore);
  });

  it('bootstrapConfiguredRuntimeEnv falls back to the local dotenv store when no external store is configured', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-configured-local-'));
    const envFilePath = join(root, '.env');
    writeFileSync(envFilePath, 'API_SERVER_PORT=4777\n', 'utf8');
    const env = {};

    const loaded = await bootstrapConfiguredRuntimeEnv({ envFilePath, env });

    assert.equal(loaded.API_SERVER_PORT, '4777');
    assert.equal(env.API_SERVER_PORT, '4777');
  });

  it('bootstrapConfiguredRuntimeEnv prefers a configured external store over the local dotenv fallback', async () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-env-configured-remote-'));
    const envFilePath = join(root, '.env');
    writeFileSync(envFilePath, 'API_SERVER_PORT=4888\n', 'utf8');
    const env = {};
    const externalStore = {
      async load() {
        return { API_SERVER_PORT: '4999', REMOTE_ONLY: '1' };
      },
      async save() {},
    };
    setConfiguredRuntimeEnvStore(externalStore);

    const loaded = await bootstrapConfiguredRuntimeEnv({ envFilePath, env });

    assert.deepEqual(loaded, { API_SERVER_PORT: '4999', REMOTE_ONLY: '1' });
    assert.equal(env.API_SERVER_PORT, '4999');
    assert.equal(env.REMOTE_ONLY, '1');
  });

  it('auto-discovers a runtime env store package and prefers it over LocalDotenvRuntimeEnvStore', async () => {
    const discoveryRoot = mkdtempSync(join(tmpdir(), 'runtime-env-discovery-'));
    const packageRoot = join(discoveryRoot, 'packages', 'runtime-env-remote');
    const distDir = join(packageRoot, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify(
        {
          name: '@office-claw/runtime-env-remote',
          version: '0.1.0',
          type: 'module',
          main: './dist/index.js',
          clowder: {
            kind: 'runtime-env-store',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      join(distDir, 'index.js'),
      [
        'export async function createRuntimeEnvStore() {',
        '  return {',
        "    async load() { return { API_SERVER_PORT: '5666', REMOTE_ONLY: 'yes' }; },",
        '    async save() {}',
        '  };',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const discovered = await discoverRuntimeEnvStore([join(discoveryRoot, 'packages')]);
    const resolved = await resolveRuntimeEnvStore({
      envFilePath: join(discoveryRoot, '.env'),
      searchPaths: [join(discoveryRoot, 'packages')],
    });

    assert.ok(discovered);
    assert.equal(discovered, resolved);
    const env = {};
    const loaded = await bootstrapConfiguredRuntimeEnv({
      envFilePath: join(discoveryRoot, '.env'),
      env,
      searchPaths: [join(discoveryRoot, 'packages')],
    });
    assert.deepEqual(loaded, { API_SERVER_PORT: '5666', REMOTE_ONLY: 'yes' });
    assert.equal(env.API_SERVER_PORT, '5666');
    assert.equal(env.REMOTE_ONLY, 'yes');
  });

  it('caches discovery results per searchPaths instead of sharing one global result', async () => {
    const firstRoot = mkdtempSync(join(tmpdir(), 'runtime-env-discovery-a-'));
    const firstPackageRoot = join(firstRoot, 'packages', 'runtime-env-a');
    const firstDistDir = join(firstPackageRoot, 'dist');
    mkdirSync(firstDistDir, { recursive: true });
    writeFileSync(
      join(firstPackageRoot, 'package.json'),
      JSON.stringify(
        {
          name: '@office-claw/runtime-env-a',
          version: '0.1.0',
          type: 'module',
          main: './dist/index.js',
          clowder: { kind: 'runtime-env-store' },
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      join(firstDistDir, 'index.js'),
      [
        'export default {',
        "  async load() { return { STORE_ID: 'A' }; },",
        '  async save() {}',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    const secondRoot = mkdtempSync(join(tmpdir(), 'runtime-env-discovery-b-'));
    const secondPackageRoot = join(secondRoot, 'packages', 'runtime-env-b');
    const secondDistDir = join(secondPackageRoot, 'dist');
    mkdirSync(secondDistDir, { recursive: true });
    writeFileSync(
      join(secondPackageRoot, 'package.json'),
      JSON.stringify(
        {
          name: '@office-claw/runtime-env-b',
          version: '0.1.0',
          type: 'module',
          main: './dist/index.js',
          clowder: { kind: 'runtime-env-store' },
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      join(secondDistDir, 'index.js'),
      [
        'export default {',
        "  async load() { return { STORE_ID: 'B' }; },",
        '  async save() {}',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    const firstStore = await discoverRuntimeEnvStore([join(firstRoot, 'packages')]);
    const secondStore = await discoverRuntimeEnvStore([join(secondRoot, 'packages')]);

    assert.ok(firstStore);
    assert.ok(secondStore);
    assert.deepEqual(await firstStore.load(), { STORE_ID: 'A' });
    assert.deepEqual(await secondStore.load(), { STORE_ID: 'B' });
  });

  it('discovers runtime env stores from non-office-claw scoped packages', async () => {
    const discoveryRoot = mkdtempSync(join(tmpdir(), 'runtime-env-scoped-discovery-'));
    const packageRoot = join(discoveryRoot, 'packages', '@acme', 'runtime-env-store');
    const distDir = join(packageRoot, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify(
        {
          name: '@acme/runtime-env-store',
          version: '0.1.0',
          type: 'module',
          main: './dist/index.js',
          clowder: { kind: 'runtime-env-store' },
        },
        null,
        2,
      ),
      'utf8',
    );
    writeFileSync(
      join(distDir, 'index.js'),
      [
        'export default {',
        "  async load() { return { STORE_SCOPE: 'acme' }; },",
        '  async save() {}',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );

    const discovered = await discoverRuntimeEnvStore([join(discoveryRoot, 'packages')]);

    assert.ok(discovered);
    assert.deepEqual(await discovered.load(), { STORE_SCOPE: 'acme' });
  });
});
