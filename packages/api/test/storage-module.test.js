/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

const noop = () => ({});
function createMockProvider(overrides) {
  return {
    id: 'mock',
    createMessageStore: noop,
    createThreadStore: noop,
    createTaskStore: noop,
    createBacklogStore: noop,
    createMemoryStore: noop,
    createDraftStore: noop,
    createSessionChainStore: noop,
    createInvocationRecordStore: noop,
    createPendingRequestStore: noop,
    createAuthorizationRuleStore: noop,
    createAuthorizationAuditStore: noop,
    createPushSubscriptionStore: noop,
    createReadStateStore: noop,
    createWorkflowSopStore: noop,
    ...overrides,
  };
}

describe('StorageModule', () => {
  let savedProvider;
  let savedProviderModules;
  let savedMemoryStore;
  let savedRedisUrl;

  beforeEach(() => {
    savedProvider = process.env.OFFICE_CLAW_STORAGE_PROVIDER;
    savedProviderModules = process.env.OFFICE_CLAW_STORAGE_PROVIDER_MODULES;
    savedMemoryStore = process.env.MEMORY_STORE;
    savedRedisUrl = process.env.REDIS_URL;
  });

  afterEach(() => {
    const restore = (key, saved) => {
      if (saved !== undefined) process.env[key] = saved;
      else delete process.env[key];
    };
    restore('OFFICE_CLAW_STORAGE_PROVIDER', savedProvider);
    restore('OFFICE_CLAW_STORAGE_PROVIDER_MODULES', savedProviderModules);
    restore('MEMORY_STORE', savedMemoryStore);
    restore('REDIS_URL', savedRedisUrl);
  });

  it('explicit memory provider creates in-memory stores', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const env = { OFFICE_CLAW_STORAGE_PROVIDER: 'memory' };
    const module = await createStorageModule({ env });

    assert.equal(module.activeProviderId, 'memory');
    const msgStore = await module.getActiveProvider().createMessageStore();
    assert.ok(msgStore);
    assert.equal(typeof msgStore.append, 'function');

    const threadStore = await module.getActiveProvider().createThreadStore();
    assert.ok(threadStore);
    assert.equal(typeof threadStore.create, 'function');
  });

  it('legacy fallback: MEMORY_STORE=1 without explicit provider', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const env = { MEMORY_STORE: '1' };
    const module = await createStorageModule({ env });

    assert.equal(module.activeProviderId, 'memory');
  });

  it('fast-fail: no provider, no redis, no MEMORY_STORE', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const env = {};

    await assert.rejects(() => createStorageModule({ env }), {
      message: /No storage provider configured/,
    });
  });

  it('fast-fail: explicit provider not registered', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const env = { OFFICE_CLAW_STORAGE_PROVIDER: 'postgres' };

    await assert.rejects(() => createStorageModule({ env }), {
      message: /Storage provider 'postgres' not found/,
    });
  });

  it('fast-fail: external module that exports nothing', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const env = { OFFICE_CLAW_STORAGE_PROVIDER_MODULES: 'fake-module' };
    const fakeLoader = async () => ({ notAProvider: true });

    await assert.rejects(() => createStorageModule({ env, moduleLoader: fakeLoader }), {
      message: /exported no storage providers/,
    });
  });

  it('external module with valid provider is registered', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const mockProvider = createMockProvider({
      id: 'test-external',
      displayName: 'Test External',
      createMessageStore: () => ({ append: () => {} }),
      createThreadStore: () => ({ create: () => {} }),
    });
    const env = {
      OFFICE_CLAW_STORAGE_PROVIDER: 'test-external',
      OFFICE_CLAW_STORAGE_PROVIDER_MODULES: 'test-module',
    };
    const fakeLoader = async () => ({ storageProvider: mockProvider });

    const module = await createStorageModule({ env, moduleLoader: fakeLoader });
    assert.equal(module.activeProviderId, 'test-external');
  });

  it('external provider works without Redis or MEMORY_STORE', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const mockProvider = createMockProvider({
      id: 'custom-db',
      displayName: 'Custom DB',
      createMessageStore: () => ({ append: () => {}, getById: () => null }),
      createThreadStore: () => ({ create: () => {}, get: () => null }),
    });
    const env = {
      OFFICE_CLAW_STORAGE_PROVIDER: 'custom-db',
      OFFICE_CLAW_STORAGE_PROVIDER_MODULES: 'custom-db-module',
    };
    const fakeLoader = async () => ({ storageProvider: mockProvider });

    const module = await createStorageModule({ env, moduleLoader: fakeLoader });
    assert.equal(module.activeProviderId, 'custom-db');

    const msgStore = await module.getActiveProvider().createMessageStore();
    assert.ok(msgStore);
    const threadStore = await module.getActiveProvider().createThreadStore();
    assert.ok(threadStore);
  });

  it('partial provider: missing stores fallback to memory', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const partialProvider = {
      id: 'partial-test',
      createMessageStore: () => ({ append: () => 'custom-msg' }),
      createThreadStore: () => ({ create: () => 'custom-thread' }),
    };
    const env = {
      OFFICE_CLAW_STORAGE_PROVIDER: 'partial-test',
      OFFICE_CLAW_STORAGE_PROVIDER_MODULES: 'partial-module',
    };
    const fakeLoader = async () => ({ storageProvider: partialProvider });

    const module = await createStorageModule({ env, moduleLoader: fakeLoader });
    assert.equal(module.activeProviderId, 'partial-test');

    const msgStore = await module.getActiveProvider().createMessageStore();
    assert.equal(msgStore.append(), 'custom-msg');

    const taskStore = await module.getActiveProvider().createTaskStore();
    assert.ok(taskStore);
    assert.equal(typeof taskStore.create, 'function');
  });

  it('partial provider: this binding preserved for provider methods', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const partialProvider = {
      id: 'this-test',
      client: 'expected-client',
      createMessageStore() {
        return { client: this.client };
      },
    };
    const env = {
      OFFICE_CLAW_STORAGE_PROVIDER: 'this-test',
      OFFICE_CLAW_STORAGE_PROVIDER_MODULES: 'this-module',
    };
    const fakeLoader = async () => ({ storageProvider: partialProvider });

    const module = await createStorageModule({ env, moduleLoader: fakeLoader });
    const msgStore = await module.getActiveProvider().createMessageStore();
    assert.equal(msgStore.client, 'expected-client');
  });

  it('partial provider: bootstrap/shutdown this binding preserved', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const log = [];
    const partialProvider = {
      id: 'lifecycle-test',
      dbName: 'test-db',
      createMessageStore: () => ({}),
      async bootstrap() {
        log.push(`boot:${this.dbName}`);
      },
      async shutdown() {
        log.push(`shut:${this.dbName}`);
      },
    };
    const env = {
      OFFICE_CLAW_STORAGE_PROVIDER: 'lifecycle-test',
      OFFICE_CLAW_STORAGE_PROVIDER_MODULES: 'lifecycle-module',
    };
    const fakeLoader = async () => ({ storageProvider: partialProvider });

    const module = await createStorageModule({ env, moduleLoader: fakeLoader });
    assert.deepEqual(log, ['boot:test-db']);

    await module.getActiveProvider().shutdown();
    assert.deepEqual(log, ['boot:test-db', 'shut:test-db']);
  });

  it('registry lists all registered provider IDs', async () => {
    const { createStorageModule } = await import('../dist/storage/module.js');
    const env = { OFFICE_CLAW_STORAGE_PROVIDER: 'memory' };
    const module = await createStorageModule({ env });

    const ids = module.providerRegistry.listIds();
    assert.ok(ids.includes('memory'));
  });
});
