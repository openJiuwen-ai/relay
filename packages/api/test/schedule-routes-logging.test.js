/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';

const { scheduleRoutes } = await import('../dist/routes/schedule.js');

function formatLogArgs(args) {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function createTemplate(templateId = 'repo-activity') {
  return {
    templateId,
    label: '仓库动态',
    category: 'repo',
    description: '监控 GitHub 仓库的新 Issue 和 PR',
    defaultTrigger: { type: 'interval', ms: 3_600_000 },
    paramSchema: {},
    createSpec(instanceId, p) {
      return {
        id: instanceId,
        profile: 'poller',
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
        display: { label: '仓库动态', category: 'repo' },
      };
    },
  };
}

function createDynamicTaskStore(seed = []) {
  const defs = new Map(seed.map((def) => [def.id, { ...def }]));
  return {
    insert(def) {
      defs.set(def.id, { ...def });
    },
    remove(id) {
      return defs.delete(id);
    },
    setEnabled(id, enabled) {
      const def = defs.get(id);
      if (!def) return false;
      def.enabled = enabled;
      defs.set(id, def);
      return true;
    },
    getById(id) {
      return defs.get(id) ?? null;
    },
  };
}

function createTaskRunner(initialTasks = []) {
  const normalized = initialTasks.map((task) =>
    typeof task === 'string'
      ? {
          id: task,
          profile: 'poller',
          trigger: { type: 'interval', ms: 3_600_000 },
          enabled: true,
          effectiveEnabled: true,
          lastRun: null,
          runStats: { total: 0, delivered: 0, failed: 0, skipped: 0 },
          display: { label: '仓库动态', category: 'repo' },
          subjectPreview: null,
          source: 'dynamic',
          dynamicTaskId: task,
        }
      : {
          lastRun: null,
          runStats: { total: 0, delivered: 0, failed: 0, skipped: 0 },
          display: { label: '仓库动态', category: 'repo' },
          subjectPreview: null,
          source: 'dynamic',
          dynamicTaskId: task.id,
          ...task,
        },
  );
  const summaries = new Map(normalized.map((task) => [task.id, { ...task }]));
  const registered = new Set(normalized.map((task) => task.id));
  const calls = {
    registerDynamic: [],
    unregister: [],
    triggerNow: [],
    setDynamicEnabled: [],
  };
  return {
    calls,
    getTaskSummaries() {
      return [...summaries.values()];
    },
    getRegisteredTasks() {
      return [...registered];
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
    registerDynamic(spec, dynamicDefId, enabled = true) {
      registered.add(spec.id);
      summaries.set(spec.id, {
        id: spec.id,
        profile: spec.profile,
        trigger: spec.trigger,
        enabled,
        effectiveEnabled: enabled,
        actor: spec.actor,
        context: spec.context,
        lastRun: null,
        runStats: { total: 0, delivered: 0, failed: 0, skipped: 0 },
        display: spec.display,
        subjectPreview: null,
        source: 'dynamic',
        dynamicTaskId: dynamicDefId,
      });
      calls.registerDynamic.push({ spec, dynamicDefId, enabled });
    },
    unregister(taskId) {
      registered.delete(taskId);
      summaries.delete(taskId);
      calls.unregister.push(taskId);
      return true;
    },
    setDynamicEnabled(taskId, enabled) {
      calls.setDynamicEnabled.push({ taskId, enabled });
      if (!registered.has(taskId)) return false;
      const summary = summaries.get(taskId);
      if (summary) {
        summary.enabled = enabled;
        summary.effectiveEnabled = enabled;
        summaries.set(taskId, summary);
      }
      return true;
    },
    async triggerNow(taskId, opts) {
      calls.triggerNow.push({ taskId, opts });
    },
  };
}

describe('schedule routes logging', () => {
  let templateRegistry;
  let loggerEntries;

  beforeEach(() => {
    templateRegistry = {
      get(id) {
        return id === 'repo-activity' ? createTemplate(id) : null;
      },
      list() {
        return [createTemplate('repo-activity')];
      },
    };
    loggerEntries = [];
  });

  async function createApp({ taskRunner, dynamicTaskStore }) {
    const app = Fastify({ logger: false });
    app.log.info = (...args) => {
      loggerEntries.push(formatLogArgs(args));
    };
    await app.register(scheduleRoutes, {
      taskRunner,
      dynamicTaskStore,
      templateRegistry,
      browserUserVerifier: () => true,
      threadStore: {
        async get(id) {
          if (id === 'thread-123') return { id, createdBy: 'default-user', title: 'Logging Thread' };
          return null;
        },
      },
    });
    await app.ready();
    return app;
  }

  test('logs dynamic task creation with trigger details', async () => {
    const taskRunner = createTaskRunner();
    const dynamicTaskStore = createDynamicTaskStore();
    const app = await createApp({ taskRunner, dynamicTaskStore });

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'repo-activity',
        trigger: { type: 'interval', ms: 7_200_000 },
        params: { repo: 'openai/openai-cookbook' },
        deliveryThreadId: 'thread-123',
      },
    });

    assert.equal(response.statusCode, 200);
    const { task } = response.json();
    assert.ok(
      loggerEntries.some(
        (entry) =>
          entry.includes('[schedule] registered dynamic task') &&
          entry.includes(`task=${task.id}`) &&
          entry.includes('template=repo-activity') &&
          entry.includes('trigger=interval:7200000ms') &&
          entry.includes('requestedBy=default-user'),
      ),
    );

    await app.close();
  });

  test('logs manual trigger requests and completion with trigger details', async () => {
    const taskRunner = createTaskRunner([
      {
        id: 'dyn-trigger',
        profile: 'poller',
        trigger: { type: 'cron', expression: '0 */2 * * *', timezone: 'Asia/Shanghai' },
        enabled: true,
        effectiveEnabled: true,
      },
    ]);
    const dynamicTaskStore = createDynamicTaskStore();
    const app = await createApp({ taskRunner, dynamicTaskStore });

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks/dyn-trigger/trigger',
      headers: {
        'x-office-claw-user': 'default-user',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.ok(
      loggerEntries.some(
        (entry) =>
          entry.includes('[schedule] manual trigger requested task=dyn-trigger') &&
          entry.includes('trigger=cron:0 */2 * * *@Asia/Shanghai') &&
          entry.includes('requestedBy=default-user'),
      ),
    );
    assert.ok(
      loggerEntries.some(
        (entry) =>
          entry.includes('[schedule] manual trigger completed task=dyn-trigger') &&
          entry.includes('trigger=cron:0 */2 * * *@Asia/Shanghai') &&
          entry.includes('requestedBy=default-user'),
      ),
    );

    await app.close();
  });

  test('logs dynamic task deletion with full stored task info', async () => {
    const taskRunner = createTaskRunner(['dyn-delete']);
    const dynamicTaskStore = createDynamicTaskStore([
      {
        id: 'dyn-delete',
        templateId: 'repo-activity',
        trigger: { type: 'interval', ms: 3_600_000 },
        params: { repo: 'openai/openai-cookbook' },
        display: { label: '仓库动态', category: 'repo' },
        deliveryThreadId: 'thread-123',
        enabled: true,
        createdBy: 'codex',
        createdAt: '2026-04-13T00:00:00.000Z',
      },
    ]);
    const app = await createApp({ taskRunner, dynamicTaskStore });

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/schedule/tasks/dyn-delete',
      headers: {
        'x-office-claw-user': 'default-user',
      },
    });

    assert.equal(response.statusCode, 200);
    assert.ok(
      loggerEntries.some(
        (entry) =>
          entry.includes('[schedule] deleted dynamic task') &&
          entry.includes('task=dyn-delete') &&
          entry.includes('requestedBy=default-user') &&
          entry.includes('"templateId":"repo-activity"') &&
          entry.includes('"deliveryThreadId":"thread-123"') &&
          entry.includes('"createdBy":"codex"'),
      ),
    );

    await app.close();
  });

  test('logs enable and disable operations for dynamic tasks', async () => {
    const taskRunner = createTaskRunner([
      {
        id: 'dyn-toggle',
        profile: 'poller',
        trigger: { type: 'cron', expression: '0 */2 * * *', timezone: 'Asia/Shanghai' },
        enabled: true,
        effectiveEnabled: true,
      },
    ]);
    const dynamicTaskStore = createDynamicTaskStore([
      {
        id: 'dyn-toggle',
        templateId: 'repo-activity',
        trigger: { type: 'cron', expression: '0 */2 * * *', timezone: 'Asia/Shanghai' },
        params: { repo: 'openai/openai-cookbook' },
        display: { label: '仓库动态', category: 'repo' },
        deliveryThreadId: 'thread-123',
        enabled: true,
        createdBy: 'codex',
        createdAt: '2026-04-13T00:00:00.000Z',
      },
    ]);
    const app = await createApp({ taskRunner, dynamicTaskStore });

    const disableResponse = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-toggle',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: { enabled: false },
    });

    assert.equal(disableResponse.statusCode, 200);
    assert.ok(
      loggerEntries.some(
        (entry) =>
          entry.includes('[schedule] updated dynamic task enabled state') &&
          entry.includes('task=dyn-toggle') &&
          entry.includes('enabled=false') &&
          entry.includes('requestedBy=default-user'),
      ),
    );

    const enableResponse = await app.inject({
      method: 'PATCH',
      url: '/api/schedule/tasks/dyn-toggle',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: { enabled: true },
    });

    assert.equal(enableResponse.statusCode, 200);
    assert.ok(
      loggerEntries.some(
        (entry) =>
          entry.includes('[schedule] updated dynamic task enabled state') &&
          entry.includes('task=dyn-toggle') &&
          entry.includes('enabled=true') &&
          entry.includes('requestedBy=default-user'),
      ),
    );

    assert.deepEqual(taskRunner.calls.setDynamicEnabled, [
      { taskId: 'dyn-toggle', enabled: false },
      { taskId: 'dyn-toggle', enabled: true },
    ]);

    await app.close();
  });
});
