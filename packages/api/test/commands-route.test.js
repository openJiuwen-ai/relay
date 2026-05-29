/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Commands API route tests
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { MessageStore } from '../dist/domains/agents/services/stores/ports/MessageStore.js';
import { TaskStore } from '../dist/domains/agents/services/stores/ports/TaskStore.js';
import { ThreadStore } from '../dist/domains/agents/services/stores/ports/ThreadStore.js';
import { commandsRoutes } from '../dist/routes/commands.js';

// Mock opus service
const mockOpusService = {
  async *invoke() {
    yield { type: 'text', content: '[{"title": "Extracted task", "why": "From test", "sourceIndex": 0}]' };
    yield { type: 'done', agentId: 'opus' };
  },
};

// Mock socket manager
const mockSocketManager = {
  broadcastToRoom: () => {},
};

describe('Commands Routes', () => {
  let app;
  let messageStore;
  let taskStore;
  let threadStore;
  let ownThreadId;
  let otherThreadId;

  beforeEach(async () => {
    app = Fastify();
    messageStore = new MessageStore();
    taskStore = new TaskStore();
    threadStore = new ThreadStore();
    ownThreadId = threadStore.create('test-user', 'Own thread').id;
    otherThreadId = threadStore.create('other-user', 'Other thread').id;

    await app.register(commandsRoutes, {
      messageStore,
      taskStore,
      socketManager: mockSocketManager,
      opusService: mockOpusService,
      threadStore,
    });
    await app.ready();
  });

  it('POST /api/commands/extract-tasks creates tasks', async () => {
    // Add some messages first
    await messageStore.append({
      content: 'TODO: write tests',
      userId: 'test-user',
      threadId: ownThreadId,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/commands/extract-tasks',
      headers: { 'x-office-claw-user': 'test-user' },
      payload: {
        threadId: ownThreadId,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.count, 1);
    assert.equal(body.tasks[0].title, 'Extracted task');
  });

  it('POST /api/commands/extract-tasks returns 400 for missing threadId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commands/extract-tasks',
      headers: { 'x-office-claw-user': 'test-user' },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
  });

  it('POST /api/commands/extract-tasks returns empty for no messages', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commands/extract-tasks',
      headers: { 'x-office-claw-user': 'test-user' },
      payload: {
        threadId: ownThreadId,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.count, 0);
    assert.equal(body.degraded, false);
  });

  it('uses X-Office-Claw-User header over legacy payload userId', async () => {
    await messageStore.append({
      content: 'TODO: header identity should win',
      userId: 'test-user',
      threadId: ownThreadId,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/commands/extract-tasks',
      headers: { 'x-office-claw-user': 'test-user' },
      payload: {
        threadId: ownThreadId,
        userId: 'legacy-user-should-not-win',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.count, 1);
  });

  it('returns 401 when identity is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/commands/extract-tasks',
      payload: {
        threadId: ownThreadId,
      },
    });

    assert.equal(res.statusCode, 401);
  });

  it('returns 403 when accessing another user thread', async () => {
    await messageStore.append({
      content: 'TODO: should not be visible',
      userId: 'other-user',
      threadId: otherThreadId,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/commands/extract-tasks',
      headers: { 'x-office-claw-user': 'test-user' },
      payload: {
        threadId: otherThreadId,
      },
    });

    assert.equal(res.statusCode, 403);
  });
});
