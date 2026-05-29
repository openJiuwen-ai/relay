/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Fastify from 'fastify';

const { scheduleRoutes } = await import('../dist/routes/schedule.js');
const { InvocationRegistry } = await import('../dist/domains/agents/services/agents/invocation/InvocationRegistry.js');

function createTemplate(templateId = 'reminder') {
  return {
    templateId,
    label: '提醒',
    category: 'system',
    description: '提醒任务',
    defaultTrigger: { type: 'cron', expression: '0 9 * * *' },
    paramSchema: {},
    createSpec(instanceId, p) {
      return {
        id: instanceId,
        profile: 'awareness',
        trigger: p.trigger,
        admission: {
          async gate() {
            return { run: false, reason: 'test-only' };
          },
        },
        run: {
          overlap: 'skip',
          timeoutMs: 1_000,
          async execute() {},
        },
        state: { runLedger: 'sqlite' },
        outcome: { whenNoSignal: 'record' },
        enabled: () => true,
        display: { label: '提醒', category: 'system' },
      };
    },
  };
}

function makeDynamicDef(id, overrides = {}) {
  return {
    id,
    templateId: 'reminder',
    trigger: { type: 'interval', ms: 60_000 },
    params: {},
    display: { label: '提醒', category: 'system', description: '提醒任务' },
    deliveryThreadId: null,
    enabled: true,
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createDynamicTaskStore(seed = []) {
  const defs = new Map(seed.map((def) => [def.id, structuredClone(def)]));
  return {
    insert(def) {
      defs.set(def.id, structuredClone(def));
    },
    remove(id) {
      return defs.delete(id);
    },
    setEnabled(id, enabled) {
      const def = defs.get(id);
      if (!def) return false;
      defs.set(id, { ...def, enabled });
      return true;
    },
    update(id, updated) {
      const def = defs.get(id);
      if (!def) return false;
      defs.set(id, { ...def, ...structuredClone(updated) });
      return true;
    },
    getById(id) {
      return defs.get(id) ?? null;
    },
    getAll() {
      return [...defs.values()];
    },
    snapshot() {
      return [...defs.values()];
    },
  };
}

function createTaskRunner(initialDefs = []) {
  const summaries = new Map(
    initialDefs.map((def) => [
      def.id,
      {
        id: def.id,
        profile: 'awareness',
        trigger: def.trigger,
        enabled: def.enabled,
        effectiveEnabled: def.enabled,
        lastRun: null,
        runStats: { total: 0, delivered: 0, failed: 0, skipped: 0 },
        display: def.display,
        subjectPreview: null,
        source: 'dynamic',
        dynamicTaskId: def.id,
      },
    ]),
  );
  const registered = new Set(initialDefs.map((def) => def.id));
  return {
    registerDynamic(spec, dynamicDefId, enabled = true) {
      registered.add(spec.id);
      summaries.set(spec.id, {
        id: spec.id,
        profile: spec.profile,
        trigger: spec.trigger,
        enabled,
        effectiveEnabled: enabled,
        lastRun: null,
        runStats: { total: 0, delivered: 0, failed: 0, skipped: 0 },
        display: spec.display,
        subjectPreview: null,
        source: 'dynamic',
        dynamicTaskId: dynamicDefId,
      });
    },
    unregister(taskId) {
      registered.delete(taskId);
      summaries.delete(taskId);
      return true;
    },
    getRegisteredTasks() {
      return [...registered];
    },
    getTaskSummaries() {
      return [...summaries.values()];
    },
    getLedger() {
      return {
        query() {
          return [];
        },
        queryBySubject() {
          return [];
        },
      };
    },
    replaceDynamic(spec, dynamicDefId, enabled = true) {
      this.unregister(spec.id);
      this.registerDynamic(spec, dynamicDefId, enabled);
    },
    setDynamicEnabled(taskId, enabled) {
      if (!registered.has(taskId)) return false;
      const summary = summaries.get(taskId);
      if (summary) {
        summary.enabled = enabled;
        summary.effectiveEnabled = enabled;
        summaries.set(taskId, summary);
      }
      return true;
    },
  };
}

function createGlobalControlStore() {
  return {
    getGlobalState() {
      return { enabled: true };
    },
    listOverrides() {
      return [];
    },
    setGlobalEnabled() {},
    setTaskOverride() {},
    getTaskOverride() {
      return null;
    },
    removeTaskOverride() {
      return false;
    },
  };
}

function createPackTemplateStore() {
  const defs = new Map([
    [
      'pack-reminder',
      {
        templateId: 'pack-reminder',
        packId: 'pack-1',
        label: '外部提醒',
        description: '来自 pack 的提醒任务',
        category: 'external',
        subjectKind: 'none',
        defaultTrigger: { type: 'interval', ms: 3_600_000 },
        paramSchema: {},
        builtinTemplateRef: 'reminder',
      },
    ],
  ]);
  return {
    listAll() {
      return [...defs.values()];
    },
    install(def) {
      defs.set(def.templateId, def);
    },
    uninstall(id) {
      return defs.delete(id);
    },
    get(id) {
      return defs.get(id) ?? null;
    },
  };
}

function createThreadStore(entries = {}) {
  return {
    async get(id) {
      return entries[id] ?? null;
    },
  };
}

async function createApp({ dynamicDefs = [], threadEntries = {}, registry, browserUserVerifier = () => true } = {}) {
  const taskRunner = createTaskRunner(dynamicDefs);
  const dynamicTaskStore = createDynamicTaskStore(dynamicDefs);
  const templateRegistry = {
    get(id) {
      return id === 'reminder' ? createTemplate(id) : null;
    },
    list() {
      return [createTemplate('reminder')];
    },
  };
  const app = Fastify({ logger: false });
  await app.register(scheduleRoutes, {
    taskRunner,
    dynamicTaskStore,
    templateRegistry,
    registry,
    browserUserVerifier,
    globalControlStore: createGlobalControlStore(),
    packTemplateStore: createPackTemplateStore(),
    threadStore: createThreadStore(threadEntries),
  });
  await app.ready();
  return { app, dynamicTaskStore };
}

describe('schedule authorization matrix', () => {
  test('GET /api/schedule/tasks requires browser auth or callback credentials', async () => {
    const registry = new InvocationRegistry();
    const callback = registry.create('user-1', 'codex', 'thread-1');
    const { app } = await createApp({ registry });

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/schedule/tasks',
    });
    assert.equal(unauthenticated.statusCode, 401);

    const browser = await app.inject({
      method: 'GET',
      url: '/api/schedule/tasks',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(browser.statusCode, 200);

    const callbackQuery = await app.inject({
      method: 'GET',
      url: `/api/schedule/tasks?invocationId=${callback.invocationId}&callbackToken=${callback.callbackToken}`,
    });
    assert.equal(callbackQuery.statusCode, 200);

    await app.close();
  });

  test('rejects arbitrary browser identity headers that are not backed by a primary auth session', async () => {
    const { app } = await createApp({
      browserUserVerifier: (userId) => userId === 'user-1' || userId === 'default-user',
    });

    const invalid = await app.inject({
      method: 'GET',
      url: '/api/schedule/tasks',
      headers: { 'x-office-claw-user': 'attacker' },
    });
    assert.equal(invalid.statusCode, 401);

    const valid = await app.inject({
      method: 'GET',
      url: '/api/schedule/tasks',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(valid.statusCode, 200);

    await app.close();
  });

  test('GET /api/schedule/control rejects callback auth and requires browser auth', async () => {
    const registry = new InvocationRegistry();
    const callback = registry.create('user-1', 'codex', 'thread-1');
    const { app } = await createApp({ registry });

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/schedule/control',
    });
    assert.equal(unauthenticated.statusCode, 401);

    const browser = await app.inject({
      method: 'GET',
      url: '/api/schedule/control',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(browser.statusCode, 200);

    const callbackHeader = await app.inject({
      method: 'GET',
      url: '/api/schedule/control',
      headers: {
        'x-invocation-id': callback.invocationId,
        'x-callback-token': callback.callbackToken,
      },
    });
    assert.ok([401, 403].includes(callbackHeader.statusCode));

    await app.close();
  });

  test('GET /api/schedule/pack-templates requires browser auth', async () => {
    const { app } = await createApp();

    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/api/schedule/pack-templates',
    });
    assert.equal(unauthenticated.statusCode, 401);

    const browser = await app.inject({
      method: 'GET',
      url: '/api/schedule/pack-templates',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(browser.statusCode, 200);

    await app.close();
  });

  test('POST /api/schedule/tasks/preview accepts browser auth and callback body credentials, but rejects anonymous access', async () => {
    const registry = new InvocationRegistry();
    const callback = registry.create('user-1', 'codex', 'thread-1');
    const { app } = await createApp({ registry });
    const payload = {
      templateId: 'reminder',
      trigger: { type: 'interval', ms: 60_000 },
      params: { message: 'preview' },
    };

    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks/preview',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    assert.equal(unauthenticated.statusCode, 401);

    const browser = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks/preview',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload,
    });
    assert.equal(browser.statusCode, 200);

    const callbackBody = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks/preview',
      headers: { 'content-type': 'application/json' },
      payload: {
        ...payload,
        invocationId: callback.invocationId,
        callbackToken: callback.callbackToken,
      },
    });
    assert.equal(callbackBody.statusCode, 200);

    await app.close();
  });

  test('POST /api/schedule/tasks is shared, binds browser-created tasks to trusted actor fields, and rejects inconsistent dual auth', async () => {
    const registry = new InvocationRegistry();
    const matching = registry.create('user-1', 'codex', 'thread-owned');
    const mismatched = registry.create('user-2', 'codex', 'thread-foreign');
    const threadEntries = {
      'thread-owned': { id: 'thread-owned', createdBy: 'user-1', title: 'Owned Thread' },
    };
    const { app, dynamicTaskStore } = await createApp({ registry, threadEntries });
    const payload = {
      templateId: 'reminder',
      trigger: { type: 'interval', ms: 60_000 },
      params: { message: 'create task' },
      deliveryThreadId: 'thread-owned',
    };

    const unauthenticated = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    assert.equal(unauthenticated.statusCode, 401);

    const browser = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload,
    });
    assert.equal(browser.statusCode, 200);
    assert.equal(dynamicTaskStore.snapshot().at(-1)?.createdBy, 'user-1');

    const callbackOnly = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: { 'content-type': 'application/json' },
      payload: {
        ...payload,
        invocationId: matching.invocationId,
        callbackToken: matching.callbackToken,
      },
    });
    assert.equal(callbackOnly.statusCode, 200);

    const inconsistent = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: {
        ...payload,
        invocationId: mismatched.invocationId,
        callbackToken: mismatched.callbackToken,
      },
    });
    assert.equal(inconsistent.statusCode, 403);

    await app.close();
  });

  test('DELETE /api/schedule/tasks/:id enforces browser thread ownership and still allows callback callers', async () => {
    const registry = new InvocationRegistry();
    const callback = registry.create('user-2', 'codex', 'thread-owned');
    const dynamicDefs = [
      makeDynamicDef('dyn-owned', { deliveryThreadId: 'thread-owned' }),
      makeDynamicDef('dyn-foreign', { deliveryThreadId: 'thread-foreign' }),
      makeDynamicDef('dyn-unbound', { deliveryThreadId: null }),
    ];
    const threadEntries = {
      'thread-owned': { id: 'thread-owned', createdBy: 'user-1', title: 'Owned Thread' },
      'thread-foreign': { id: 'thread-foreign', createdBy: 'user-2', title: 'Foreign Thread' },
    };
    const { app } = await createApp({ registry, dynamicDefs, threadEntries });

    const owned = await app.inject({
      method: 'DELETE',
      url: '/api/schedule/tasks/dyn-owned',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(owned.statusCode, 200);

    const foreign = await app.inject({
      method: 'DELETE',
      url: '/api/schedule/tasks/dyn-foreign',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(foreign.statusCode, 403);

    const unbound = await app.inject({
      method: 'DELETE',
      url: '/api/schedule/tasks/dyn-unbound',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(unbound.statusCode, 200);

    const callbackDelete = await app.inject({
      method: 'DELETE',
      url: '/api/schedule/tasks/dyn-foreign',
      headers: {
        'x-invocation-id': callback.invocationId,
        'x-callback-token': callback.callbackToken,
      },
    });
    assert.equal(callbackDelete.statusCode, 200);

    await app.close();
  });

  test('PATCH /api/schedule/tasks/:id edits dynamic task config and enforces new thread ownership', async () => {
    const dynamicDefs = [makeDynamicDef('dyn-edit', { deliveryThreadId: 'thread-owned' })];
    const threadEntries = {
      'thread-owned': { id: 'thread-owned', createdBy: 'user-1', title: 'Owned Thread' },
      'thread-next': { id: 'thread-next', createdBy: 'user-1', title: 'Next Thread' },
      'thread-foreign': { id: 'thread-foreign', createdBy: 'user-2', title: 'Foreign Thread' },
    };
    const { app, dynamicTaskStore } = await createApp({ dynamicDefs, threadEntries });

    const forbidden = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-edit',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: { deliveryThreadId: 'thread-foreign' },
    });
    assert.equal(forbidden.statusCode, 403);

    const edited = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-edit',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: {
        trigger: { type: 'interval', ms: 120_000 },
        params: { message: 'updated' },
        display: { label: 'Updated reminder' },
        deliveryThreadId: 'thread-next',
      },
    });
    assert.equal(edited.statusCode, 200);
    const body = edited.json();
    assert.equal(body.task.trigger.ms, 120_000);
    assert.deepEqual(body.task.params, { message: 'updated' });
    assert.equal(body.task.display.label, 'Updated reminder');
    assert.equal(body.task.display.category, 'system');
    assert.equal(body.task.deliveryThreadId, 'thread-next');

    const stored = dynamicTaskStore.getById('dyn-edit');
    assert.equal(stored.trigger.ms, 120_000);
    assert.deepEqual(stored.params, { message: 'updated' });
    assert.equal(stored.deliveryThreadId, 'thread-next');

    await app.close();
  });

  test('PATCH /api/schedule/tasks/:id is shared, supports callback header credentials, and rejects inconsistent dual auth', async () => {
    const registry = new InvocationRegistry();
    const matching = registry.create('user-1', 'codex', 'thread-owned');
    const mismatched = registry.create('user-2', 'codex', 'thread-foreign');
    const dynamicDefs = [makeDynamicDef('dyn-toggle', { deliveryThreadId: 'thread-owned' })];
    const threadEntries = {
      'thread-owned': { id: 'thread-owned', createdBy: 'user-1', title: 'Owned Thread' },
    };
    const { app } = await createApp({ registry, dynamicDefs, threadEntries });

    const unauthenticated = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-toggle',
      headers: { 'content-type': 'application/json' },
      payload: { enabled: false },
    });
    assert.equal(unauthenticated.statusCode, 401);

    const browser = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-toggle',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: { enabled: false },
    });
    assert.equal(browser.statusCode, 200);

    const callbackHeader = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-toggle',
      headers: {
        'content-type': 'application/json',
        'x-invocation-id': matching.invocationId,
        'x-callback-token': matching.callbackToken,
      },
      payload: { enabled: true },
    });
    assert.equal(callbackHeader.statusCode, 200);

    const inconsistent = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-toggle',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
        'x-invocation-id': mismatched.invocationId,
        'x-callback-token': mismatched.callbackToken,
      },
      payload: { enabled: true },
    });
    assert.equal(inconsistent.statusCode, 403);

    await app.close();
  });

  test('POST /api/schedule/tasks enforces 64-character display label limit', async () => {
    const { app, dynamicTaskStore } = await createApp();

    const accepted = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'interval', ms: 60_000 },
        params: { message: 'create task' },
        display: { label: `  ${'中'.repeat(64)}  `, category: 'system' },
      },
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(dynamicTaskStore.snapshot().at(-1)?.display.label, '中'.repeat(64));

    const rejected = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'interval', ms: 60_000 },
        params: { message: 'create task' },
        display: { label: 'a'.repeat(65), category: 'system' },
      },
    });
    assert.equal(rejected.statusCode, 400);
    assert.match(rejected.body, /display\.label must be at most 64 characters/);

    await app.close();
  });

  test('PATCH /api/schedule/tasks/:id enforces 64-character display label limit', async () => {
    const dynamicDefs = [makeDynamicDef('dyn-edit-label')];
    const { app, dynamicTaskStore } = await createApp({ dynamicDefs });

    const accepted = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-edit-label',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: { display: { label: `  ${'a'.repeat(64)}  ` } },
    });
    assert.equal(accepted.statusCode, 200);
    assert.equal(dynamicTaskStore.getById('dyn-edit-label').display.label, 'a'.repeat(64));

    const rejected = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-edit-label',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'user-1',
      },
      payload: { display: { label: '😀'.repeat(33) } },
    });
    assert.equal(rejected.statusCode, 400);
    assert.match(rejected.body, /display\.label must be at most 64 characters/);

    await app.close();
  });
});
