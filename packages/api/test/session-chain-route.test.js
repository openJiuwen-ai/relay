/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Session Chain Route Tests
 * F24: GET /api/threads/:threadId/sessions, GET /api/sessions/:sessionId
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

/** Minimal mock threadStore for auth tests */
function mockThreadStore(threads = {}) {
  return {
    get: async (id) => threads[id] ?? null,
    list: async () => Object.values(threads),
    create: async () => {},
    update: async () => null,
    delete: async () => false,
  };
}

describe('Session Chain Routes', () => {
  let app;
  let SessionChainStore;
  let sessionChainRoutes;

  async function setup(threadStoreOverride, sealerOverride) {
    const storeMod = await import('../dist/domains/agents/services/stores/ports/SessionChainStore.js');
    const routeMod = await import('../dist/routes/session-chain.js');
    SessionChainStore = storeMod.SessionChainStore;
    sessionChainRoutes = routeMod.sessionChainRoutes;

    const store = new SessionChainStore();
    const threadStore =
      threadStoreOverride ??
      mockThreadStore({
        'thread-1': { id: 'thread-1', createdBy: 'user-1' },
        'thread-system': { id: 'thread-system', createdBy: 'system' },
        'unknown-thread': { id: 'unknown-thread', createdBy: 'user-1' },
      });
    app = Fastify();
    const mockSealer = sealerOverride ?? {
      requestSeal: async () => ({ accepted: true }),
      finalize: async () => {},
      reconcileStuck: async () => 0,
      reconcileAllStuck: async () => 0,
    };
    await app.register(sessionChainRoutes, { sessionChainStore: store, threadStore, sessionSealer: mockSealer });
    await app.ready();
    return store;
  }

  // --- P1: Auth / identity tests ---

  it('GET /api/threads/:threadId/sessions returns 401 without identity', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/sessions',
      // no X-Office-Claw-User header, no userId query
    });
    assert.equal(res.statusCode, 401);
  });

  it('GET /api/sessions/:sessionId returns 401 without identity', async () => {
    const store = await setup();
    const record = store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}`,
    });
    assert.equal(res.statusCode, 401);
  });

  it('GET /api/threads/:threadId/sessions returns 403 when user is not thread owner', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/sessions',
      headers: { 'x-office-claw-user': 'other-user' },
    });
    assert.equal(res.statusCode, 403);
  });

  it('GET /api/sessions/:sessionId returns 403 when user is not thread owner', async () => {
    const store = await setup();
    const record = store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}`,
      headers: { 'x-office-claw-user': 'other-user' },
    });
    assert.equal(res.statusCode, 403);
  });

  // --- Normal happy-path tests (with identity) ---

  it('GET /api/threads/:threadId/sessions returns empty array for unknown thread', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/unknown-thread/sessions',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.deepEqual(body.sessions, []);
  });

  it('GET /api/threads/:threadId/sessions returns all sessions', async () => {
    const store = await setup();
    store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.create({ cliSessionId: 'cli-2', threadId: 'thread-1', agentId: 'codex', userId: 'user-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/sessions',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.sessions.length, 2);
  });

  it('GET /api/threads/:threadId/sessions allows authenticated users on system-owned threads', async () => {
    const store = await setup();
    store.create({ cliSessionId: 'cli-system-1', threadId: 'thread-system', agentId: 'opus', userId: 'system' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-system/sessions',
      headers: { 'x-office-claw-user': 'default-user' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].threadId, 'thread-system');
  });

  it('GET /api/threads/:threadId/sessions?agentId=opus filters by cat', async () => {
    const store = await setup();
    store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.create({ cliSessionId: 'cli-2', threadId: 'thread-1', agentId: 'codex', userId: 'user-1' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/sessions?agentId=opus',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.sessions.length, 1);
    assert.equal(body.sessions[0].agentId, 'opus');
  });

  it('GET /api/sessions/:sessionId returns session record', async () => {
    const store = await setup();
    const record = store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.id, record.id);
    assert.equal(body.agentId, 'opus');
    assert.equal(body.status, 'active');
  });

  it('GET /api/sessions/:sessionId allows authenticated users on system-owned threads', async () => {
    const store = await setup();
    const record = store.create({ cliSessionId: 'cli-system-2', threadId: 'thread-system', agentId: 'opus', userId: 'system' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}`,
      headers: { 'x-office-claw-user': 'default-user' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.id, record.id);
    assert.equal(body.threadId, 'thread-system');
  });

  it('GET /api/sessions/:sessionId returns 404 for unknown session', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/non-existent-id',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.ok(body.error);
  });

  it('sessions include contextHealth when set', async () => {
    const store = await setup();
    const record = store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(record.id, {
      contextHealth: {
        usedTokens: 50000,
        windowTokens: 200000,
        fillRatio: 0.25,
        source: 'exact',
        measuredAt: Date.now(),
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    const body = JSON.parse(res.payload);
    assert.ok(body.contextHealth);
    assert.equal(body.contextHealth.fillRatio, 0.25);
    assert.equal(body.contextHealth.source, 'exact');
  });

  it('POST /api/sessions/:sessionId/unseal returns 401 without identity', async () => {
    const store = await setup();
    const sealed = store.create({ cliSessionId: 'cli-sealed', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(sealed.id, { status: 'sealed', sealReason: 'threshold', sealedAt: Date.now(), updatedAt: Date.now() });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sealed.id}/unseal`,
    });
    assert.equal(res.statusCode, 401);
  });

  it('POST /api/sessions/:sessionId/unseal returns 404 for unknown session', async () => {
    await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sessions/non-existent-id/unseal',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 404);
  });

  it('POST /api/sessions/:sessionId/unseal returns 404 when thread no longer exists', async () => {
    const store = await setup();
    const dangling = store.create({
      cliSessionId: 'cli-dangling',
      threadId: 'ghost-thread',
      agentId: 'opus',
      userId: 'user-1',
    });
    store.update(dangling.id, {
      status: 'sealed',
      sealReason: 'threshold',
      sealedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${dangling.id}/unseal`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error, 'Thread not found');
  });

  it('POST /api/sessions/:sessionId/unseal reopens sealed session as a new active record', async () => {
    const store = await setup();
    const sealed = store.create({ cliSessionId: 'cli-reopen', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(sealed.id, { status: 'sealed', sealReason: 'threshold', sealedAt: Date.now(), updatedAt: Date.now() });
    assert.equal(store.getActive('opus', 'thread-1'), null);

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sealed.id}/unseal`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.mode, 'reopened');
    assert.equal(body.fromSessionId, sealed.id);
    assert.equal(body.session.status, 'active');
    assert.equal(body.session.cliSessionId, 'cli-reopen');
    assert.equal(body.session.seq, 1);
  });

  it('POST /api/sessions/:sessionId/unseal displaces empty active session', async () => {
    const store = await setup();
    const sealed = store.create({ cliSessionId: 'cli-old', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(sealed.id, { status: 'sealed', sealReason: 'threshold', sealedAt: Date.now(), updatedAt: Date.now() });
    // Empty active session (messageCount 0 or undefined) — safe to displace
    store.create({ cliSessionId: 'cli-new', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sealed.id}/unseal`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.mode, 'reopened');
    assert.equal(body.fromSessionId, sealed.id);
  });

  it('POST /api/sessions/:sessionId/unseal returns 409 on CAS race during displacement', async () => {
    const rejectingSealer = {
      requestSeal: async () => ({ accepted: false }),
      finalize: async () => {},
    };
    const store = await setup(undefined, rejectingSealer);
    const sealed = store.create({ cliSessionId: 'cli-old', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(sealed.id, { status: 'sealed', sealReason: 'threshold', sealedAt: Date.now(), updatedAt: Date.now() });
    // Empty active session but CAS will reject
    store.create({ cliSessionId: 'cli-new', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sealed.id}/unseal`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.payload);
    assert.match(body.error, /CAS race/);
  });

  it('POST /api/sessions/:sessionId/unseal returns 409 when active session has messages', async () => {
    const store = await setup();
    const sealed = store.create({ cliSessionId: 'cli-old', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(sealed.id, { status: 'sealed', sealReason: 'threshold', sealedAt: Date.now(), updatedAt: Date.now() });
    // Non-empty active session — must not be displaced
    const active = store.create({ cliSessionId: 'cli-new', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(active.id, { messageCount: 5 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/sessions/${sealed.id}/unseal`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.payload);
    assert.equal(body.activeSessionId, active.id);
  });

  // --- GET /api/threads/:threadId/usage tests ---

  it('GET /api/threads/:threadId/usage returns 401 without identity', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/usage',
    });
    assert.equal(res.statusCode, 401);
  });

  it('GET /api/threads/:threadId/usage returns 403 when user is not thread owner', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/usage',
      headers: { 'x-office-claw-user': 'other-user' },
    });
    assert.equal(res.statusCode, 403);
  });

  it('GET /api/threads/:threadId/usage returns zero totals for thread with no sessions', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/unknown-thread/usage',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.threadId, 'unknown-thread');
    assert.equal(body.sessionCount, 0);
    assert.equal(body.total.inputTokens, 0);
    assert.equal(body.total.outputTokens, 0);
    assert.deepEqual(body.byCat, {});
  });

  it('GET /api/threads/:threadId/usage aggregates across sessions and cats', async () => {
    const store = await setup();
    const s1 = store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(s1.id, { lastUsage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500, costUsd: 0.10 } });
    const s2 = store.create({ cliSessionId: 'cli-2', threadId: 'thread-1', agentId: 'codex', userId: 'user-1' });
    store.update(s2.id, { lastUsage: { inputTokens: 3000, outputTokens: 800, cacheReadTokens: 1000, costUsd: 0.30 } });
    // Seal s1 and create a second opus session
    store.update(s1.id, { status: 'sealed', sealReason: 'threshold', sealedAt: Date.now() });
    const s3 = store.create({ cliSessionId: 'cli-3', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(s3.id, { lastUsage: { inputTokens: 2000, outputTokens: 400, cacheReadTokens: 800, costUsd: 0.15 } });

    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/usage',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.sessionCount, 3);
    // opus: 1000+2000=3000 input, 200+400=600 output
    assert.equal(body.byCat['opus'].inputTokens, 3000);
    assert.equal(body.byCat['opus'].outputTokens, 600);
    assert.equal(body.byCat['opus'].sessions, 2);
    // codex: 3000 input, 800 output
    assert.equal(body.byCat['codex'].inputTokens, 3000);
    assert.equal(body.byCat['codex'].outputTokens, 800);
    assert.equal(body.byCat['codex'].sessions, 1);
    // total: 6000 input, 1400 output
    assert.equal(body.total.inputTokens, 6000);
    assert.equal(body.total.outputTokens, 1400);
    assert.equal(body.total.cacheReadTokens, 2300);
    assert.equal(body.total.costUsd, 0.55);
  });

  it('GET /api/threads/:threadId/usage?agentId=opus filters by cat', async () => {
    const store = await setup();
    const s1 = store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(s1.id, { lastUsage: { inputTokens: 1000, outputTokens: 200 } });
    const s2 = store.create({ cliSessionId: 'cli-2', threadId: 'thread-1', agentId: 'codex', userId: 'user-1' });
    store.update(s2.id, { lastUsage: { inputTokens: 5000, outputTokens: 1000 } });

    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/usage?agentId=opus',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.sessionCount, 1);
    assert.equal(body.total.inputTokens, 1000);
    assert.ok(!body.byCat['codex']);
  });

  it('GET /api/threads/:threadId/usage x-cat-id forces own-cat filter', async () => {
    const store = await setup();
    const s1 = store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    store.update(s1.id, { lastUsage: { inputTokens: 1000, outputTokens: 200 } });
    const s2 = store.create({ cliSessionId: 'cli-2', threadId: 'thread-1', agentId: 'codex', userId: 'user-1' });
    store.update(s2.id, { lastUsage: { inputTokens: 5000, outputTokens: 1000 } });

    // x-cat-id=opus without agentId query → should only see opus data
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/usage',
      headers: { 'x-office-claw-user': 'user-1', 'x-cat-id': 'opus' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.sessionCount, 1);
    assert.equal(body.total.inputTokens, 1000);
    assert.ok(!body.byCat['codex']);
  });

  it('GET /api/threads/:threadId/usage x-cat-id rejects cross-cat query', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/usage?agentId=codex',
      headers: { 'x-office-claw-user': 'user-1', 'x-cat-id': 'opus' },
    });
    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.match(body.error, /Cannot query usage/);
  });

  it('GET /api/threads/:threadId/usage skips sessions without lastUsage', async () => {
    const store = await setup();
    // Session with no usage data (newly created, no invocation yet)
    store.create({ cliSessionId: 'cli-1', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });
    const s2 = store.create({ cliSessionId: 'cli-2', threadId: 'thread-1', agentId: 'codex', userId: 'user-1' });
    store.update(s2.id, { lastUsage: { inputTokens: 2000, outputTokens: 500 } });

    const res = await app.inject({
      method: 'GET',
      url: '/api/threads/thread-1/usage',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.sessionCount, 2); // both counted
    assert.equal(body.total.inputTokens, 2000); // only s2 contributes
    assert.ok(!body.byCat['opus']); // opus has no usage bucket
  });
});
