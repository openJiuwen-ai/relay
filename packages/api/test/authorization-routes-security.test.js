/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';

await import('tsx/esm');
const { authorizationRoutes } = await import('../src/routes/authorization.ts');

describe('authorization routes security hardening', () => {
  let app;

  beforeEach(async () => {
    app = Fastify();
    await app.register(authorizationRoutes, {
      authManager: {
        async respond() {
          return null;
        },
        async getPending() {
          return [];
        },
      },
      ruleStore: {
        async list() {
          return [];
        },
        async add(rule) {
          return { id: 'rule-1', ...rule };
        },
        async remove() {
          return false;
        },
      },
      auditStore: {
        async list() {
          return [];
        },
      },
      socketManager: {
        broadcastToRoom() {},
      },
      jiuwenPermissionBridge: {
        async submitAuthorizationDecision() {},
      },
    });
    await app.ready();
  });

  after(async () => {
    await app?.close();
  });

  it('rejects legacy x-user-id header on pending list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/pending',
      headers: { 'x-user-id': 'spoofed-user' },
    });

    assert.equal(res.statusCode, 401);
    assert.match(res.body, /X-Office-Claw-User header/);
  });

  it('accepts X-Office-Claw-User header on pending list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/authorization/pending',
      headers: { 'X-Office-Claw-User': 'owner-1' },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { pending: [] });
  });
});
