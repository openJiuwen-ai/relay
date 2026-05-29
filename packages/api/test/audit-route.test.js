/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

function mockThreadStore(threads = {}) {
  return {
    get: async (id) => threads[id] ?? null,
    list: async () => Object.values(threads),
    create: async () => {},
    update: async () => null,
    delete: async () => false,
  };
}

describe('Audit routes', () => {
  it('GET /api/audit/thread/:threadId allows authenticated users on system-owned threads', async () => {
    const { auditRoutes } = await import('../dist/routes/audit.js');
    const app = Fastify();

    await app.register(auditRoutes, {
      threadStore: mockThreadStore({
        'thread-system': { id: 'thread-system', createdBy: 'system' },
      }),
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/audit/thread/thread-system',
      headers: { 'x-office-claw-user': 'default-user' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.events));
    assert.ok(Array.isArray(body.logFiles));

    await app.close();
  });
});
