/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Fastify from 'fastify';

const { scheduleRoutes } = await import('../dist/routes/schedule.js');
const { TaskRunnerV2 } = await import('../dist/infrastructure/scheduler/TaskRunnerV2.js');

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

function createDynamicTaskStore() {
  const defs = [];
  return {
    defs,
    insert(def) {
      defs.push(structuredClone(def));
    },
    remove() {
      return false;
    },
    setEnabled() {
      return false;
    },
    getById() {
      return null;
    },
    getAll() {
      return defs.slice();
    },
  };
}

function createTaskRunnerStub() {
  const registered = [];
  return {
    registered,
    registerDynamic(spec, dynamicDefId) {
      registered.push({ spec, dynamicDefId });
    },
    unregister() {
      return true;
    },
    getRegisteredTasks() {
      return registered.map((entry) => entry.spec.id);
    },
    getTaskSummaries() {
      return registered.map((entry) => ({
        id: entry.spec.id,
        profile: entry.spec.profile,
        trigger: entry.spec.trigger,
        enabled: true,
        effectiveEnabled: true,
        lastRun: null,
        runStats: { total: 0, delivered: 0, failed: 0, skipped: 0 },
        display: entry.spec.display,
        subjectPreview: null,
        source: 'dynamic',
        dynamicTaskId: entry.dynamicDefId,
      }));
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
    async triggerNow() {},
    setDynamicEnabled() {
      return false;
    },
  };
}

async function createApp() {
  const taskRunner = createTaskRunnerStub();
  const dynamicTaskStore = createDynamicTaskStore();
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
    browserUserVerifier: () => true,
    threadStore: {
      async get(id) {
        if (id === 'thread-test') return { id, createdBy: 'default-user', title: 'Test Thread' };
        return null;
      },
    },
  });
  await app.ready();
  return { app, taskRunner, dynamicTaskStore };
}

function createRunner() {
  const ledger = {
    query: () => [],
    stats: () => ({ total: 0, delivered: 0, failed: 0, skipped: 0 }),
    record: () => {},
  };
  return new TaskRunnerV2({
    logger: { info: () => {}, error: () => {} },
    ledger,
  });
}

function installFakeTimeAndTimers(fixedNow) {
  const realDate = globalThis.Date;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const timers = [];
  const clearedTimers = [];

  class FixedDate extends realDate {
    constructor(...args) {
      if (args.length === 0) {
        super(fixedNow);
        return;
      }
      super(...args);
    }

    static now() {
      return fixedNow;
    }

    static parse(value) {
      return realDate.parse(value);
    }

    static UTC(...args) {
      return realDate.UTC(...args);
    }
  }

  globalThis.Date = FixedDate;
  globalThis.setTimeout = (fn, delay, ...args) => {
    const timer = {
      delay,
      fn,
      args,
      unrefCalled: false,
      unref() {
        this.unrefCalled = true;
        return this;
      },
    };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    clearedTimers.push(timer);
  };

  return {
    timers,
    clearedTimers,
    realSetTimeout,
    restore() {
      globalThis.Date = realDate;
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    },
  };
}

describe('schedule trigger validation', () => {
  test('POST /api/schedule/tasks normalizes once delayMs into fireAt', async () => {
    const { app, dynamicTaskStore, taskRunner } = await createApp();

    const before = Date.now();
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'once', delayMs: 60_000 },
        params: { message: 'one shot' },
        deliveryThreadId: 'thread-test',
      },
    });
    const after = Date.now();

    assert.equal(response.statusCode, 200);
    assert.equal(taskRunner.registered.length, 1);
    assert.equal(taskRunner.registered[0].spec.trigger.type, 'once');
    assert.equal(dynamicTaskStore.defs.length, 1);
    assert.equal(dynamicTaskStore.defs[0].trigger.type, 'once');
    assert.equal(typeof dynamicTaskStore.defs[0].trigger.fireAt, 'number');
    assert.ok(dynamicTaskStore.defs[0].trigger.fireAt >= before + 60_000);
    assert.ok(dynamicTaskStore.defs[0].trigger.fireAt <= after + 60_000 + 50);

    await app.close();
  });

  test('POST /api/schedule/tasks rejects interval trigger without ms', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'interval' },
        params: { message: 'bad interval' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /interval trigger ms/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('POST /api/schedule/tasks/preview rejects interval trigger below minimum 10s', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks/preview',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'interval', ms: 5_000 },
        params: { message: 'too fast' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /interval trigger ms must be a finite number >= 10000/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('POST /api/schedule/tasks rejects once trigger with delayMs below 1s', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'once', delayMs: 500 },
        params: { message: 'too soon' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /once trigger delayMs must be a finite number >= 1000/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('POST /api/schedule/tasks rejects once trigger with past fireAt', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'once', fireAt: Date.now() - 60_000 },
        params: { message: 'already passed' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /once trigger fireAt must be a finite epoch ms in the future/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('TaskRunnerV2 throws for invalid interval trigger instead of scheduling undefined ms', () => {
    const runner = createRunner();
    runner.register({
      id: 'bad-interval',
      profile: 'awareness',
      trigger: { type: 'interval' },
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
    });

    assert.throws(() => runner.start(), /interval trigger ms must be a finite number >= 10000/);
  });

  test('TaskRunnerV2 chunks long cron delays without executing at chunk boundary', async () => {
    const runner = createRunner();
    const fixedNow = Date.parse('2026-04-29T03:19:16.524Z');
    const fake = installFakeTimeAndTimers(fixedNow);
    let executeCount = 0;

    try {
      runner.register({
        id: 'yearly-cron',
        profile: 'awareness',
        trigger: { type: 'cron', expression: '0 9 1 3 *', timezone: 'Asia/Shanghai' },
        admission: {
          async gate() {
            return { run: true, workItems: [{ signal: 'ready', subjectKey: 'yearly-cron' }] };
          },
        },
        run: {
          overlap: 'skip',
          timeoutMs: 1_000,
          async execute() {
            executeCount++;
          },
        },
        state: { runLedger: 'sqlite' },
        outcome: { whenNoSignal: 'record' },
        enabled: () => true,
      });

      runner.start();

      assert.equal(fake.timers.length, 1);
      assert.equal(fake.timers[0].delay, 2_147_483_647);
      assert.equal(executeCount, 0);

      fake.timers[0].fn(...fake.timers[0].args);
      await new Promise((resolve) => fake.realSetTimeout(resolve, 0));

      assert.equal(executeCount, 0);
      assert.equal(fake.timers.length, 2);
      assert.equal(fake.timers[1].delay, 2_147_483_647);
    } finally {
      fake.restore();
    }
  });

  test('TaskRunnerV2 does not resurrect unregistered long once task at chunk boundary', () => {
    const runner = createRunner();
    const fixedNow = Date.parse('2026-04-29T03:19:16.524Z');
    const fake = installFakeTimeAndTimers(fixedNow);
    let executeCount = 0;

    try {
      runner.register({
        id: 'long-once',
        profile: 'awareness',
        trigger: { type: 'once', fireAt: fixedNow + 2_147_483_647 + 60_000 },
        admission: {
          async gate() {
            return { run: true, workItems: [{ signal: 'ready', subjectKey: 'long-once' }] };
          },
        },
        run: {
          overlap: 'skip',
          timeoutMs: 1_000,
          async execute() {
            executeCount++;
          },
        },
        state: { runLedger: 'sqlite' },
        outcome: { whenNoSignal: 'record' },
        enabled: () => true,
      });

      runner.start();

      assert.equal(fake.timers.length, 1);
      assert.equal(fake.timers[0].delay, 2_147_483_647);

      assert.equal(runner.unregister('long-once'), true);
      assert.equal(fake.clearedTimers.length, 1);

      fake.timers[0].fn(...fake.timers[0].args);

      assert.equal(executeCount, 0);
      assert.equal(fake.timers.length, 1);
    } finally {
      fake.restore();
    }
  });
});
