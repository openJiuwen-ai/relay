/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Tasks Route Tests (毛线球)
 * Uses lightweight Fastify injection (no real HTTP server).
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';

function createMockSocketManager() {
  const events = [];
  return {
    broadcastToRoom(room, event, data) {
      events.push({ room, event, data });
    },
    getEvents() {
      return events;
    },
  };
}

describe('Tasks Routes', () => {
  let taskStore;
  let socketManager;

  beforeEach(async () => {
    const { TaskStore } = await import('../dist/domains/agents/services/stores/ports/TaskStore.js');
    taskStore = new TaskStore();
    socketManager = createMockSocketManager();
  });

  async function createApp() {
    const { tasksRoutes } = await import('../dist/routes/tasks.js');
    const app = Fastify();
    await app.register(tasksRoutes, { taskStore, socketManager });
    return app;
  }

  // ---- POST /api/tasks ----

  test('POST creates a task and returns 201', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        threadId: 'thread-1',
        title: '重构 AgentRouter',
        why: '超过 200 行',
        createdBy: 'opus',
      },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.ok(body.id);
    assert.equal(body.threadId, 'thread-1');
    assert.equal(body.title, '重构 AgentRouter');
    assert.equal(body.status, 'todo');
    assert.equal(body.createdBy, 'opus');
  });

  test('POST broadcasts task_created event', async () => {
    const app = await createApp();
    await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        threadId: 'thread-1',
        title: 'Test task',
        why: 'Testing',
        createdBy: 'user',
      },
    });

    const events = socketManager.getEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0].room, 'thread:thread-1');
    assert.equal(events[0].event, 'task_created');
    assert.equal(events[0].data.title, 'Test task');
  });

  test('POST rejects missing required fields', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { threadId: 'thread-1' },
    });

    assert.equal(response.statusCode, 400);
  });

  test('POST rejects invalid createdBy', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: {
        threadId: 'thread-1',
        title: 'Test',
        why: '',
        createdBy: 'invalid-cat',
      },
    });

    assert.equal(response.statusCode, 400);
  });

  // ---- GET /api/tasks?threadId ----

  test('GET lists tasks for a thread', async () => {
    const app = await createApp();

    // Create two tasks
    await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { threadId: 'thread-1', title: 'Task A', why: '', createdBy: 'opus' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { threadId: 'thread-1', title: 'Task B', why: '', createdBy: 'codex' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks?threadId=thread-1',
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.tasks.length, 2);
  });

  test('GET requires threadId parameter', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks',
    });

    assert.equal(response.statusCode, 400);
  });

  // ---- GET /api/tasks/:id ----

  test('GET by id returns task', async () => {
    const app = await createApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { threadId: 'thread-1', title: 'Task A', why: '', createdBy: 'opus' },
    });
    const taskId = createRes.json().id;

    const response = await app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().title, 'Task A');
  });

  test('GET by id returns 404 for nonexistent', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/tasks/nonexistent',
    });

    assert.equal(response.statusCode, 404);
  });

  // ---- PATCH /api/tasks/:id ----

  test('PATCH updates status and broadcasts', async () => {
    const app = await createApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { threadId: 'thread-1', title: 'Task A', why: '', createdBy: 'opus' },
    });
    const taskId = createRes.json().id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { status: 'doing' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'doing');

    // Should have 2 events: task_created + task_updated
    const events = socketManager.getEvents();
    assert.equal(events.length, 2);
    assert.equal(events[1].event, 'task_updated');
  });

  test('PATCH returns 404 for nonexistent task', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/tasks/nonexistent',
      payload: { status: 'done' },
    });

    assert.equal(response.statusCode, 404);
  });

  test('PATCH rejects invalid status value', async () => {
    const app = await createApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { threadId: 'thread-1', title: 'Task A', why: '', createdBy: 'opus' },
    });
    const taskId = createRes.json().id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/tasks/${taskId}`,
      payload: { status: 'invalid-status' },
    });

    assert.equal(response.statusCode, 400);
  });

  // ---- DELETE /api/tasks/:id ----

  test('DELETE removes task and returns 204', async () => {
    const app = await createApp();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      payload: { threadId: 'thread-1', title: 'Task A', why: '', createdBy: 'opus' },
    });
    const taskId = createRes.json().id;

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/tasks/${taskId}`,
    });

    assert.equal(response.statusCode, 204);

    // Verify it's gone
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/tasks/${taskId}`,
    });
    assert.equal(getRes.statusCode, 404);
  });

  test('DELETE returns 404 for nonexistent', async () => {
    const app = await createApp();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/tasks/nonexistent',
    });

    assert.equal(response.statusCode, 404);
  });
});
