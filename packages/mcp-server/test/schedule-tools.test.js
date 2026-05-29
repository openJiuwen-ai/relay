/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('schedule MCP tools callback auth propagation', () => {
  let originalEnv;
  let originalFetch;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.OFFICE_CLAW_API_URL = 'http://127.0.0.1:3004';
    process.env.OFFICE_CLAW_INVOCATION_ID = 'test-invocation';
    process.env.OFFICE_CLAW_CALLBACK_TOKEN = 'test-token';
    process.env.OFFICE_CLAW_CAT_ID = 'codex';
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    globalThis.fetch = originalFetch;
  });

  test('list and template tools send callback auth in query params', async () => {
    const { handleListScheduledTasks, handleListScheduleTemplates } = await import('../dist/tools/schedule-tools.js');

    const capturedUrls = [];
    globalThis.fetch = async (url) => {
      capturedUrls.push(String(url));
      return {
        ok: true,
        json: async () => ({ ok: true }),
      };
    };

    const listTasksResult = await handleListScheduledTasks({});
    const listTemplatesResult = await handleListScheduleTemplates({});

    assert.equal(listTasksResult.isError, undefined);
    assert.equal(listTemplatesResult.isError, undefined);
    assert.equal(capturedUrls.length, 2);
    assert.ok(capturedUrls[0].includes('/api/schedule/tasks?'));
    assert.ok(capturedUrls[0].includes('invocationId=test-invocation'));
    assert.ok(capturedUrls[0].includes('callbackToken=test-token'));
    assert.ok(capturedUrls[1].includes('/api/schedule/templates?'));
    assert.ok(capturedUrls[1].includes('invocationId=test-invocation'));
    assert.ok(capturedUrls[1].includes('callbackToken=test-token'));
  });

  test('preview and register tools send callback auth in request body', async () => {
    const { handlePreviewScheduledTask, handleRegisterScheduledTask } = await import('../dist/tools/schedule-tools.js');

    const captured = [];
    globalThis.fetch = async (_url, options) => {
      captured.push({
        method: options?.method,
        body: JSON.parse(options?.body ?? '{}'),
      });
      return {
        ok: true,
        json: async () => ({ ok: true }),
      };
    };

    const previewResult = await handlePreviewScheduledTask({
      templateId: 'reminder',
      trigger: JSON.stringify({ type: 'interval', ms: 60_000 }),
      params: JSON.stringify({ message: 'preview me' }),
      deliveryThreadId: 'thread-1',
    });
    const registerResult = await handleRegisterScheduledTask({
      templateId: 'reminder',
      trigger: JSON.stringify({ type: 'interval', ms: 60_000 }),
      params: JSON.stringify({ message: 'register me' }),
      deliveryThreadId: 'thread-1',
      label: 'Reminder',
      category: 'system',
      description: 'test task',
    });

    assert.equal(previewResult.isError, undefined);
    assert.equal(registerResult.isError, undefined);
    assert.equal(captured.length, 2);
    assert.equal(captured[0].method, 'POST');
    assert.equal(captured[0].body.invocationId, 'test-invocation');
    assert.equal(captured[0].body.callbackToken, 'test-token');
    assert.equal(captured[1].method, 'POST');
    assert.equal(captured[1].body.invocationId, 'test-invocation');
    assert.equal(captured[1].body.callbackToken, 'test-token');
  });

  test('set enabled and remove tools send callback auth in headers', async () => {
    const { handleSetScheduledTaskEnabled, handleRemoveScheduledTask } = await import(
      '../dist/tools/schedule-tools.js'
    );

    const captured = [];
    globalThis.fetch = async (_url, options) => {
      captured.push({
        method: options?.method,
        headers: options?.headers,
        body: options?.body ? JSON.parse(options.body) : null,
      });
      return {
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => '',
      };
    };

    const patchResult = await handleSetScheduledTaskEnabled({ taskId: 'dyn-1', enabled: false });
    const deleteResult = await handleRemoveScheduledTask({ taskId: 'dyn-1' });

    assert.equal(patchResult.isError, undefined);
    assert.equal(deleteResult.isError, undefined);
    assert.equal(captured.length, 2);
    assert.equal(captured[0].method, 'PATCH');
    assert.equal(captured[0].headers['x-invocation-id'], 'test-invocation');
    assert.equal(captured[0].headers['x-callback-token'], 'test-token');
    assert.deepEqual(captured[0].body, { enabled: false });
    assert.equal(captured[1].method, 'DELETE');
    assert.equal(captured[1].headers['x-invocation-id'], 'test-invocation');
    assert.equal(captured[1].headers['x-callback-token'], 'test-token');
  });

  test('register and update tools reject labels over 64 JavaScript string length characters', async () => {
    const { handleRegisterScheduledTask, handleUpdateScheduledTask } = await import('../dist/tools/schedule-tools.js');

    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount += 1;
      return {
        ok: true,
        json: async () => ({ ok: true }),
      };
    };

    const registerResult = await handleRegisterScheduledTask({
      templateId: 'reminder',
      trigger: JSON.stringify({ type: 'interval', ms: 60_000 }),
      label: 'a'.repeat(65),
    });
    const updateResult = await handleUpdateScheduledTask({
      taskId: 'dyn-1',
      label: '😀'.repeat(33),
    });

    assert.equal(registerResult.isError, true);
    assert.match(registerResult.content[0].text, /label must be at most 64 characters/);
    assert.equal(updateResult.isError, true);
    assert.match(updateResult.content[0].text, /label must be at most 64 characters/);
    assert.equal(fetchCount, 0);
  });
});
