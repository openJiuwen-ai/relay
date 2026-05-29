/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// @ts-check
/**
 * PR Tracking Route tests — regression tests for cloud Codex R6 findings.
 * P1: cross-user overwrite prevention
 * P2: strict numeric PR param in DELETE
 */

import './helpers/setup-agent-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { MemoryPrTrackingStore } from '../dist/infrastructure/email/PrTrackingStore.js';
import { prTrackingRoutes } from '../dist/routes/pr-tracking.js';

const ALICE = { 'x-office-claw-user': 'alice' };
const BOB = { 'x-office-claw-user': 'bob' };

/** @returns {{ app: import('fastify').FastifyInstance, store: InstanceType<typeof MemoryPrTrackingStore> }} */
function buildApp() {
  const store = new MemoryPrTrackingStore();
  const app = Fastify();
  app.register(prTrackingRoutes, { prTrackingStore: store });
  return { app, store };
}

const validBody = {
  repoFullName: 'owner/repo',
  prNumber: 42,
  agentId: 'opus',
  threadId: 'thread-1',
};

describe('PR Tracking Routes', () => {
  describe('P1: cross-user overwrite', () => {
    it('rejects registration when PR is already tracked by another user', async () => {
      const { app } = buildApp();
      await app.ready();

      // Alice registers first
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/pr-tracking',
        headers: { ...ALICE, 'content-type': 'application/json' },
        payload: validBody,
      });
      assert.equal(res1.statusCode, 201);

      // Bob tries to overwrite
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/pr-tracking',
        headers: { ...BOB, 'content-type': 'application/json' },
        payload: { ...validBody, agentId: 'codex', threadId: 'thread-bob' },
      });
      assert.equal(res2.statusCode, 409);
      assert.ok(JSON.parse(res2.body).error.includes('already tracked'));

      await app.close();
    });

    it('allows same user to update their own PR registration', async () => {
      const { app } = buildApp();
      await app.ready();

      // Alice registers
      await app.inject({
        method: 'POST',
        url: '/api/pr-tracking',
        headers: { ...ALICE, 'content-type': 'application/json' },
        payload: validBody,
      });

      // Alice updates (different cat/thread)
      const res = await app.inject({
        method: 'POST',
        url: '/api/pr-tracking',
        headers: { ...ALICE, 'content-type': 'application/json' },
        payload: { ...validBody, agentId: 'codex', threadId: 'thread-new' },
      });
      assert.equal(res.statusCode, 200); // 200 for update, not 201

      await app.close();
    });
  });

  describe('P2: strict PR number validation in DELETE', () => {
    it('rejects malformed PR number like "123abc"', async () => {
      const { app, store } = buildApp();
      await app.ready();

      // Register PR 123
      store.register({ ...validBody, prNumber: 123, userId: 'alice' });

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/pr-tracking/owner%2Frepo/123abc',
        headers: ALICE,
      });
      assert.equal(res.statusCode, 400);
      assert.ok(JSON.parse(res.body).error.includes('Invalid PR number'));

      // Entry should still exist
      assert.ok(store.get('owner/repo', 123));

      await app.close();
    });

    it('accepts valid numeric PR number', async () => {
      const { app, store } = buildApp();
      await app.ready();

      store.register({ ...validBody, prNumber: 123, userId: 'alice' });

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/pr-tracking/owner%2Frepo/123',
        headers: ALICE,
      });
      assert.equal(res.statusCode, 200);
      assert.strictEqual(store.get('owner/repo', 123), null);

      await app.close();
    });
  });
});
