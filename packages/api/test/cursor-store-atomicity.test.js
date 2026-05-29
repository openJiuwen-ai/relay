/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Cursor Store Atomicity & Fallback Tests
 *
 * Red→Green tests for cloud Codex + Codex findings:
 * P1: Redis recovery regression — ack low value after Redis recovers
 *     with empty key while in-memory holds higher cursor
 * P2: Redis null doesn't fall back to in-memory cursor
 *
 * These tests use mock SessionStore to simulate Redis behavior
 * without requiring actual Redis.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

/** @type {typeof import('../dist/domains/agents/services/stores/ports/DeliveryCursorStore.js').DeliveryCursorStore} */
let DeliveryCursorStoreClass;

describe('DeliveryCursorStore atomicity & fallback', () => {
  beforeEach(async () => {
    const mod = await import('../dist/domains/agents/services/stores/ports/DeliveryCursorStore.js');
    DeliveryCursorStoreClass = mod.DeliveryCursorStore;
  });

  // ---- P1: Redis recovery must not regress in-memory cursor ----

  describe('P1: Redis recovery cursor regression', () => {
    test('delivery cursor: Redis down → in-memory high → Redis up (empty) → ack low → cursor stays high', async () => {
      // This test proves the P1 fix: without the max(deliveredToId, memCursor)
      // guard, the second ack would write msg-001 to Redis and cursor would
      // regress from msg-010 to msg-001.
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setDeliveryCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor() {
          return null;
        },
        async setMentionAckCursor() {
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Redis DOWN → ack msg-010 → falls to in-memory
      redisWorking = false;
      await store.ackCursor('u1', 'opus', 't1', 'msg-010');

      // Step 2: Redis UP (key is empty) → ack msg-001 (lower value)
      redisWorking = true;
      await store.ackCursor('u1', 'opus', 't1', 'msg-001');

      // Step 3: Cursor must be msg-010 (the in-memory high), NOT msg-001
      const cursor = await store.getCursor('u1', 'opus', 't1');
      assert.equal(
        cursor,
        'msg-010',
        'cursor must not regress: in-memory had msg-010, Redis recovery ack of msg-001 should be clamped',
      );
    });

    test('mention-ack cursor: Redis down → in-memory high → Redis up (empty) → ack low → cursor stays high', async () => {
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor() {
          return null;
        },
        async setDeliveryCursor() {
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setMentionAckCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Redis DOWN → ack msg-020 → falls to in-memory
      redisWorking = false;
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-020');

      // Step 2: Redis UP (empty) → ack msg-005 (lower)
      redisWorking = true;
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-005');

      // Step 3: Must stay at msg-020
      const cursor = await store.getMentionAckCursor('u1', 'opus', 't1');
      assert.equal(cursor, 'msg-020', 'mention-ack cursor must not regress from msg-020 to msg-005');
    });

    test('delivery cursor: CAS noop syncs Redis high value to memory (prevents fallback regression)', async () => {
      // Scenario from Codex R3: Redis has msg-010, ack msg-001 (CAS noop).
      // Without fix, memory gets polluted with msg-001. Then if Redis goes
      // down, fallback reads msg-001 instead of msg-010.
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setDeliveryCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor() {
          return null;
        },
        async setMentionAckCursor() {
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Write msg-010 to Redis (succeeds)
      await store.ackCursor('u1', 'opus', 't1', 'msg-010');

      // Step 2: Ack msg-001 (lower) → CAS returns false (noop in Redis)
      // After fix: memory should sync to Redis's msg-010, not msg-001
      await store.ackCursor('u1', 'opus', 't1', 'msg-001');

      // Step 3: Redis goes DOWN — fallback to in-memory
      redisWorking = false;
      const cursor = await store.getCursor('u1', 'opus', 't1');
      assert.equal(
        cursor,
        'msg-010',
        'CAS noop must sync Redis high value to memory; fallback must not regress to msg-001',
      );
    });

    test('mention-ack cursor: CAS noop syncs Redis high value to memory (prevents fallback regression)', async () => {
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor() {
          return null;
        },
        async setDeliveryCursor() {
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setMentionAckCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Write msg-020 to Redis
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-020');

      // Step 2: Ack msg-005 (lower) → CAS noop
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-005');

      // Step 3: Redis DOWN → fallback must be msg-020
      redisWorking = false;
      const cursor = await store.getMentionAckCursor('u1', 'opus', 't1');
      assert.equal(
        cursor,
        'msg-020',
        'CAS noop must sync Redis high value to memory; fallback must not regress to msg-005',
      );
    });

    test('delivery cursor: CAS noop + GET throws → memory stays unchanged (no regression)', async () => {
      // Cloud Codex P1: after CAS returns false, the GET to sync Redis's
      // actual value also fails (transient disconnect). Without inner
      // try-catch, the outer catch writes `effective` (lower) to memory.
      let redisWorking = true;
      let getThrows = false;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          if (getThrows) throw new Error('Redis transient failure on GET');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setDeliveryCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor() {
          return null;
        },
        async setMentionAckCursor() {
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Write msg-010 to Redis (succeeds, syncs to memory)
      await store.ackCursor('u1', 'opus', 't1', 'msg-010');

      // Step 2: CAS noop (msg-001 < msg-010), then GET throws
      getThrows = true;
      await store.ackCursor('u1', 'opus', 't1', 'msg-001');
      getThrows = false;

      // Step 3: Redis goes DOWN — fallback to in-memory
      redisWorking = false;
      const cursor = await store.getCursor('u1', 'opus', 't1');
      assert.equal(cursor, 'msg-010', 'CAS noop + GET failure must not pollute memory; fallback must stay at msg-010');
    });

    test('mention-ack cursor: CAS noop + GET throws → memory stays unchanged (no regression)', async () => {
      let redisWorking = true;
      let getThrows = false;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor() {
          return null;
        },
        async setDeliveryCursor() {
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          if (getThrows) throw new Error('Redis transient failure on GET');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setMentionAckCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Write msg-020 to Redis
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-020');

      // Step 2: CAS noop (msg-005 < msg-020), then GET throws
      getThrows = true;
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-005');
      getThrows = false;

      // Step 3: Redis DOWN → fallback must be msg-020
      redisWorking = false;
      const cursor = await store.getMentionAckCursor('u1', 'opus', 't1');
      assert.equal(cursor, 'msg-020', 'CAS noop + GET failure must not pollute memory; fallback must stay at msg-020');
    });

    test('delivery cursor: Redis stale value does not regress high memory cursor', async () => {
      // Codex R5 P1: Redis has msg-005, Redis down, ack msg-010 (memory),
      // Redis recovers (still msg-005). getCursor must return msg-010 not msg-005.
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setDeliveryCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor() {
          return null;
        },
        async setMentionAckCursor() {
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Write msg-005 to Redis
      await store.ackCursor('u1', 'opus', 't1', 'msg-005');

      // Step 2: Redis DOWN → ack msg-010 falls to in-memory
      redisWorking = false;
      await store.ackCursor('u1', 'opus', 't1', 'msg-010');

      // Step 3: Redis recovers — still has msg-005 (stale)
      redisWorking = true;
      const cursor = await store.getCursor('u1', 'opus', 't1');
      assert.equal(cursor, 'msg-010', 'getCursor must return max(redis=msg-005, memory=msg-010) = msg-010');
    });

    test('mention-ack cursor: Redis stale value does not regress high memory cursor', async () => {
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor() {
          return null;
        },
        async setDeliveryCursor() {
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setMentionAckCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Write msg-005 to Redis
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-005');

      // Step 2: Redis DOWN → ack msg-010 falls to in-memory
      redisWorking = false;
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-010');

      // Step 3: Redis recovers — still has msg-005 (stale)
      redisWorking = true;
      const cursor = await store.getMentionAckCursor('u1', 'opus', 't1');
      assert.equal(cursor, 'msg-010', 'getMentionAckCursor must return max(redis=msg-005, memory=msg-010) = msg-010');
    });

    test('delivery cursor: sequential acks always advance (normal path)', async () => {
      const redisStore = {};
      const mockSessionStore = {
        async getDeliveryCursor(_u, _c, _t) {
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setDeliveryCursor(_u, _c, _t, messageId) {
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor() {
          return null;
        },
        async setMentionAckCursor() {
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      await store.ackCursor('u1', 'opus', 't1', 'msg-001');
      await store.ackCursor('u1', 'opus', 't1', 'msg-003');
      await store.ackCursor('u1', 'opus', 't1', 'msg-002'); // backwards

      const cursor = await store.getCursor('u1', 'opus', 't1');
      assert.equal(cursor, 'msg-003', 'cursor should be at highest acked value');
    });
  });

  // ---- P2: Redis null falls back to in-memory ----

  describe('P2: Redis null fallback to in-memory', () => {
    test('delivery cursor: Redis write fails → in-memory fallback → Redis recovers → still reads in-memory value', async () => {
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setDeliveryCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor() {
          return null;
        },
        async setMentionAckCursor() {
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Redis DOWN → write falls back to in-memory
      redisWorking = false;
      await store.ackCursor('u1', 'opus', 't1', 'msg-010');

      // Step 2: Redis recovers — but has no cursor (null)
      redisWorking = true;

      // Step 3: Read should find the in-memory cursor, NOT return undefined
      const cursor = await store.getCursor('u1', 'opus', 't1');
      assert.equal(
        cursor,
        'msg-010',
        'After Redis recovery, getCursor must fall back to in-memory value when Redis returns null',
      );
    });

    test('mention-ack cursor: Redis write fails → in-memory fallback → Redis recovers → still reads in-memory value', async () => {
      let redisWorking = true;
      const redisStore = {};

      const mockSessionStore = {
        async getDeliveryCursor() {
          return null;
        },
        async setDeliveryCursor() {
          return true;
        },
        async deleteDeliveryCursor() {
          return 0;
        },
        async getMentionAckCursor(_u, _c, _t) {
          if (!redisWorking) throw new Error('Redis connection lost');
          return redisStore[`${_u}:${_c}:${_t}`] ?? null;
        },
        async setMentionAckCursor(_u, _c, _t, messageId) {
          if (!redisWorking) throw new Error('Redis connection lost');
          const key = `${_u}:${_c}:${_t}`;
          const cur = redisStore[key];
          if (cur && messageId <= cur) return false;
          redisStore[key] = messageId;
          return true;
        },
        async deleteMentionAckCursor() {
          return 0;
        },
      };

      const store = new DeliveryCursorStoreClass(mockSessionStore);

      // Step 1: Redis DOWN → write falls back to in-memory
      redisWorking = false;
      await store.ackMentionCursor('u1', 'opus', 't1', 'msg-020');

      // Step 2: Redis recovers (empty)
      redisWorking = true;

      // Step 3: Read should find in-memory cursor
      const cursor = await store.getMentionAckCursor('u1', 'opus', 't1');
      assert.equal(
        cursor,
        'msg-020',
        'After Redis recovery, getMentionAckCursor must fall back to in-memory value when Redis returns null',
      );
    });
  });
});
