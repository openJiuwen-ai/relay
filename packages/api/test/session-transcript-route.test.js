/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

describe('Session transcript routes', () => {
  async function setup() {
    const { sessionTranscriptRoutes } = await import('../dist/routes/session-transcript.js');
    const app = Fastify();
    const session = {
      id: 'sess-system',
      threadId: 'thread-system',
      agentId: 'opus',
      userId: 'system',
      status: 'sealed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    };

    await app.register(sessionTranscriptRoutes, {
      sessionChainStore: {
        get: async (id) => (id === session.id ? session : null),
      },
      threadStore: {
        get: async (id) => (id === 'thread-system' ? { id, createdBy: 'system' } : null),
      },
      transcriptReader: {
        readEvents: async () => ({ events: [], total: 0, nextCursor: null }),
        readDigest: async () => ({ summary: 'ok' }),
        readInvocationEvents: async () => [],
        search: async () => [],
      },
    });
    await app.ready();
    return app;
  }

  it('GET /api/sessions/:sessionId/events allows authenticated users on system-owned threads', async () => {
    const app = await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/sess-system/events',
      headers: { 'x-office-claw-user': 'default-user' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.deepEqual(body.events, []);

    await app.close();
  });

  it('GET /api/threads/:threadId/sessions/search allows authenticated users on system-owned threads', async () => {
    const app = await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-system/sessions/search?q=test',
      headers: { 'x-office-claw-user': 'default-user' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.deepEqual(body.hits, []);

    await app.close();
  });
});
