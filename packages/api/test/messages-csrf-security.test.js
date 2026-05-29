/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import Fastify from 'fastify';

await import('tsx/esm');

function buildDeps() {
  return {
    registry: {
      register: mock.fn(),
      verify: mock.fn(),
    },
    messageStore: {
      append: mock.fn(async (message) => ({ id: 'msg-1', ...message })),
      getByThread: mock.fn(async () => []),
      getByThreadBefore: mock.fn(async () => []),
    },
    socketManager: {
      broadcastAgentMessage: mock.fn(),
      broadcastToRoom: mock.fn(),
      emitToUser: mock.fn(),
    },
    router: {
      resolveTargetsAndIntent: mock.fn(async () => ({
        targetCats: ['opus'],
        intent: { intent: 'execute' },
      })),
      routeExecution: mock.fn(async function* () {
        yield { type: 'done', catId: 'opus', timestamp: Date.now() };
      }),
      ackCollectedCursors: mock.fn(async () => {}),
      route: mock.fn(async function* () {
        yield { type: 'done' };
      }),
    },
    invocationTracker: {
      start: mock.fn(() => new AbortController()),
      tryStartThread: mock.fn(() => new AbortController()),
      complete: mock.fn(),
      has: mock.fn(() => false),
      cancel: mock.fn(() => ({ cancelled: true, catIds: ['opus'] })),
      isDeleting: mock.fn(() => false),
    },
    invocationRecordStore: {
      create: mock.fn(async () => ({
        outcome: 'created',
        invocationId: 'inv-1',
      })),
      update: mock.fn(async () => {}),
    },
  };
}

describe('POST /api/messages identity hardening', () => {
  let app;

  beforeEach(async () => {
    const { messagesRoutes } = await import('../src/routes/messages.ts');
    app = Fastify();
    await app.register(messagesRoutes, buildDeps());
    await app.ready();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('rejects body-only userId spoofing when no trusted identity header exists', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        content: 'spoof attempt',
        userId: 'domain-1:alice',
      },
    });

    assert.equal(res.statusCode, 401);
  });

  it('still allows trusted header-authenticated JSON requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'domain-1:alice',
      },
      payload: {
        content: 'hello from trusted ui',
      },
    });

    assert.equal(res.statusCode, 200);
  });

  it('still allows trusted header-authenticated multipart requests', async () => {
    const boundary = '----catcafe-trusted-boundary';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="content"\r\n\r\nhello trusted multipart\r\n`),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-office-claw-user': 'domain-1:alice',
      },
      payload,
    });

    assert.equal(res.statusCode, 200);
  });
});
