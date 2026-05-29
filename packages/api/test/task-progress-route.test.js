/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F045: GET /api/threads/:threadId/task-progress route tests
 * P0/P1 review fix: auth + ownership check
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';

describe('GET /api/threads/:threadId/task-progress', () => {
  let app;
  let threadStore;
  let taskProgressStore;
  let threadId;

  beforeEach(async () => {
    const { ThreadStore } = await import('../dist/domains/agents/services/stores/ports/ThreadStore.js');
    const { threadsRoutes } = await import('../dist/routes/threads.js');
    const { MemoryTaskProgressStore } = await import(
      '../dist/domains/agents/services/agents/invocation/MemoryTaskProgressStore.js'
    );

    threadStore = new ThreadStore();
    taskProgressStore = new MemoryTaskProgressStore();
    app = Fastify();
    await app.register(threadsRoutes, { threadStore, taskProgressStore });
    await app.ready();

    // Create a thread owned by alice (ID is auto-generated)
    const thread = threadStore.create('alice', 'Test Thread');
    threadId = thread.id;

    // Populate task progress snapshot
    await taskProgressStore.setSnapshot({
      threadId,
      agentId: 'opus',
      tasks: [{ id: 't1', subject: 'Do thing', status: 'in_progress' }],
      status: 'running',
      updatedAt: Date.now(),
    });
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 401 when no identity header provided', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/task-progress`,
    });
    assert.equal(res.statusCode, 401);
  });

  it('returns 404 when thread does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/nonexistent/task-progress',
      headers: { 'x-office-claw-user': 'alice' },
    });
    assert.equal(res.statusCode, 404);
  });

  it('returns 403 when user is not thread owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/task-progress`,
      headers: { 'x-office-claw-user': 'eve' },
    });
    assert.equal(res.statusCode, 403);
  });

  it('returns task progress for thread owner', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/task-progress`,
      headers: { 'x-office-claw-user': 'alice' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.threadId, threadId);
    assert.ok(body.taskProgress.opus);
    assert.equal(body.taskProgress.opus.tasks[0].subject, 'Do thing');
  });

  it('returns empty taskProgress when no cache hit', async () => {
    await taskProgressStore.deleteSnapshot(threadId, 'opus');
    const res = await app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/task-progress`,
      headers: { 'x-office-claw-user': 'alice' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.deepEqual(body.taskProgress, {});
  });

  it('allows system-owned threads for any authenticated user', async () => {
    const sysThread = threadStore.create('system', 'Default');
    await taskProgressStore.setSnapshot({
      threadId: sysThread.id,
      agentId: 'codex',
      tasks: [{ id: 's1', subject: 'System task', status: 'pending' }],
      status: 'running',
      updatedAt: Date.now(),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/threads/${sysThread.id}/task-progress`,
      headers: { 'x-office-claw-user': 'anyone' },
    });
    assert.equal(res.statusCode, 200);
  });
});
