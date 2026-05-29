/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Session Hooks Route Tests
 * F24 Session Blindness Fix: POST /api/sessions/seal, GET /api/sessions/latest-digest
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

/** Minimal mock TranscriptReader */
function mockTranscriptReader(digests = {}) {
  return {
    readDigest: async (sessionId) => digests[sessionId] ?? null,
    readEvents: async () => ({ events: [], hasMore: false }),
    search: async () => [],
  };
}

describe('Session Hooks Routes', () => {
  let SessionChainStore;
  let SessionSealer;
  let sessionHooksRoutes;

  const DEFAULT_HOOK_TOKEN = 'test-hook-token';

  async function setup({ digestMap, hookToken = DEFAULT_HOOK_TOKEN, noToken = false } = {}) {
    const storeMod = await import('../dist/domains/agents/services/stores/ports/SessionChainStore.js');
    const sealerMod = await import('../dist/domains/agents/services/session/SessionSealer.js');
    const routeMod = await import('../dist/routes/session-hooks.js');
    SessionChainStore = storeMod.SessionChainStore;
    SessionSealer = sealerMod.SessionSealer;
    sessionHooksRoutes = routeMod.sessionHooksRoutes;

    const sessionChainStore = new SessionChainStore();
    const sessionSealer = new SessionSealer(sessionChainStore);
    const transcriptReader = mockTranscriptReader(digestMap ?? {});

    const app = Fastify();
    await app.register(sessionHooksRoutes, {
      sessionChainStore,
      sessionSealer,
      transcriptReader,
      ...(noToken ? {} : { hookToken }),
    });
    await app.ready();
    return { app, sessionChainStore, sessionSealer, hookToken };
  }

  /** Helper: default auth headers for hook requests */
  function authHeaders(token = DEFAULT_HOOK_TOKEN) {
    return { 'x-office-claw-hook-token': token };
  }

  // --- POST /api/sessions/seal ---

  describe('POST /api/sessions/seal', () => {
    it('seals active session found by cliSessionId', async () => {
      const { app, sessionChainStore } = await setup();
      sessionChainStore.create({
        cliSessionId: 'cli-abc',
        threadId: 'thread-1',
        agentId: 'opus',
        userId: 'user-1',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-abc', reason: 'claude-code-compact-auto' },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.status, 'sealing');
      assert.equal(body.threadId, 'thread-1');
      assert.equal(body.agentId, 'opus');
      assert.ok(body.sessionId);
    });

    it('returns 404 for unknown cliSessionId', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: authHeaders(),
        payload: { cliSessionId: 'unknown-cli', reason: 'test' },
      });

      assert.equal(res.statusCode, 404);
    });

    it('returns 409 for already sealed session', async () => {
      const { app, sessionChainStore } = await setup();
      const record = sessionChainStore.create({
        cliSessionId: 'cli-sealed',
        threadId: 'thread-1',
        agentId: 'opus',
        userId: 'user-1',
      });
      // Manually seal it
      sessionChainStore.update(record.id, { status: 'sealed', sealedAt: Date.now() });

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-sealed', reason: 'test' },
      });

      assert.equal(res.statusCode, 409);
    });

    it('returns 400 for missing cliSessionId', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: authHeaders(),
        payload: { reason: 'test' },
      });

      assert.equal(res.statusCode, 400);
    });

    it('returns 400 for missing reason', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-abc' },
      });

      assert.equal(res.statusCode, 400);
    });
  });

  // --- GET /api/sessions/latest-digest ---

  describe('GET /api/sessions/latest-digest', () => {
    it('returns digest for latest sealed session', async () => {
      // We need to know the sessionId to set up the digest mock,
      // but sessionId is generated internally. So we create, seal, then
      // grab the id to set up a fresh app with the right mock.
      const storeMod = await import('../dist/domains/agents/services/stores/ports/SessionChainStore.js');
      const sealerMod = await import('../dist/domains/agents/services/session/SessionSealer.js');
      const routeMod = await import('../dist/routes/session-hooks.js');

      const sessionChainStore = new storeMod.SessionChainStore();
      const record = sessionChainStore.create({
        cliSessionId: 'cli-digest',
        threadId: 'thread-1',
        agentId: 'opus',
        userId: 'user-1',
      });
      // Seal it
      sessionChainStore.update(record.id, {
        status: 'sealed',
        sealedAt: Date.now(),
      });

      const digestData = {
        timeRange: { createdAt: 1000, sealedAt: 2000, durationMs: 1000 },
        toolsUsed: ['Read', 'Bash'],
        filesTouched: [],
        errors: [],
      };

      const transcriptReader = mockTranscriptReader({ [record.id]: digestData });
      const sessionSealer = new sealerMod.SessionSealer(sessionChainStore);

      const app = Fastify();
      await app.register(routeMod.sessionHooksRoutes, {
        sessionChainStore,
        sessionSealer,
        transcriptReader,
        hookToken: DEFAULT_HOOK_TOKEN,
      });
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/latest-digest?cliSessionId=cli-digest',
        headers: authHeaders(),
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.sessionId, record.id);
      assert.deepEqual(body.digest.toolsUsed, ['Read', 'Bash']);
    });

    it('returns 400 when cliSessionId is missing', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/latest-digest',
        headers: authHeaders(),
      });

      assert.equal(res.statusCode, 400);
    });

    it('returns 404 for unknown cliSessionId', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/latest-digest?cliSessionId=unknown',
        headers: authHeaders(),
      });

      assert.equal(res.statusCode, 404);
    });

    it('returns 404 when no sealed sessions exist', async () => {
      const { app, sessionChainStore } = await setup();
      // Create an active session (not sealed)
      sessionChainStore.create({
        cliSessionId: 'cli-active',
        threadId: 'thread-1',
        agentId: 'opus',
        userId: 'user-1',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/latest-digest?cliSessionId=cli-active',
        headers: authHeaders(),
      });

      assert.equal(res.statusCode, 404);
      const body = JSON.parse(res.payload);
      assert.ok(body.error.includes('No sealed sessions'));
    });
  });

  // --- F33: Strategy-aware seal behavior ---

  describe('F33: Strategy-aware seal (POST /api/sessions/seal)', () => {
    let _setTestStrategyOverride;
    let _clearTestStrategyOverrides;

    async function loadStrategyHelpers() {
      const mod = await import('../dist/config/session-strategy.js');
      _setTestStrategyOverride = mod._setTestStrategyOverride;
      _clearTestStrategyOverrides = mod._clearTestStrategyOverrides;
    }

    it('compress strategy: returns compress_allowed and increments compressionCount', async () => {
      await loadStrategyHelpers();
      _setTestStrategyOverride('opus', {
        strategy: 'compress',
        thresholds: { warn: 0.75, action: 0.85 },
        turnBudget: 12_000,
        safetyMargin: 4_000,
      });

      try {
        const { app, sessionChainStore } = await setup();
        const record = sessionChainStore.create({
          cliSessionId: 'cli-compress',
          threadId: 'thread-1',
          agentId: 'opus',
          userId: 'user-1',
        });

        const res = await app.inject({
          method: 'POST',
          url: '/api/sessions/seal',
          headers: authHeaders(),
          payload: { cliSessionId: 'cli-compress', reason: 'claude-code-compact-auto' },
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.equal(body.action, 'compress_allowed');
        assert.equal(body.compressionCount, 1);
        assert.equal(body.strategy, 'compress');

        // Verify store was updated
        const updated = sessionChainStore.get(record.id);
        assert.equal(updated.compressionCount, 1);
        assert.equal(updated.status, 'active', 'session should remain active');
      } finally {
        _clearTestStrategyOverrides();
      }
    });

    it('hybrid strategy: allows compression when under maxCompressions', async () => {
      await loadStrategyHelpers();
      _setTestStrategyOverride('opus', {
        strategy: 'hybrid',
        thresholds: { warn: 0.8, action: 0.9 },
        hybrid: { maxCompressions: 2 },
        turnBudget: 12_000,
        safetyMargin: 4_000,
      });

      try {
        const { app, sessionChainStore } = await setup();
        sessionChainStore.create({
          cliSessionId: 'cli-hybrid',
          threadId: 'thread-1',
          agentId: 'opus',
          userId: 'user-1',
        });

        // First compression: should allow
        const res1 = await app.inject({
          method: 'POST',
          url: '/api/sessions/seal',
          headers: authHeaders(),
          payload: { cliSessionId: 'cli-hybrid', reason: 'claude-code-compact-auto' },
        });

        assert.equal(res1.statusCode, 200);
        const body1 = JSON.parse(res1.payload);
        assert.equal(body1.action, 'compress_allowed');
        assert.equal(body1.compressionCount, 1);
        assert.equal(body1.maxCompressions, 2);
        assert.equal(body1.strategy, 'hybrid');
      } finally {
        _clearTestStrategyOverrides();
      }
    });

    it('hybrid strategy: seals when compressionCount reaches maxCompressions', async () => {
      await loadStrategyHelpers();
      _setTestStrategyOverride('opus', {
        strategy: 'hybrid',
        thresholds: { warn: 0.8, action: 0.9 },
        hybrid: { maxCompressions: 1 },
        turnBudget: 12_000,
        safetyMargin: 4_000,
      });

      try {
        const { app, sessionChainStore } = await setup();
        const record = sessionChainStore.create({
          cliSessionId: 'cli-hybrid-seal',
          threadId: 'thread-1',
          agentId: 'opus',
          userId: 'user-1',
        });
        // Pre-set compressionCount to maxCompressions
        sessionChainStore.update(record.id, { compressionCount: 1 });

        const res = await app.inject({
          method: 'POST',
          url: '/api/sessions/seal',
          headers: authHeaders(),
          payload: { cliSessionId: 'cli-hybrid-seal', reason: 'claude-code-compact-auto' },
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.equal(body.status, 'sealing', 'should seal when at max compressions');
      } finally {
        _clearTestStrategyOverrides();
      }
    });

    it('hybrid strategy: seal reason is max_compressions (not hook reason)', async () => {
      await loadStrategyHelpers();
      _setTestStrategyOverride('opus', {
        strategy: 'hybrid',
        thresholds: { warn: 0.8, action: 0.9 },
        hybrid: { maxCompressions: 1 },
        turnBudget: 12_000,
        safetyMargin: 4_000,
      });

      try {
        const { app, sessionChainStore } = await setup();
        const record = sessionChainStore.create({
          cliSessionId: 'cli-hybrid-reason',
          threadId: 'thread-1',
          agentId: 'opus',
          userId: 'user-1',
        });
        sessionChainStore.update(record.id, { compressionCount: 1 });

        await app.inject({
          method: 'POST',
          url: '/api/sessions/seal',
          headers: authHeaders(),
          payload: { cliSessionId: 'cli-hybrid-reason', reason: 'claude-code-compact-auto' },
        });

        // Check that the session's sealReason is max_compressions, not the hook reason
        const sealed = sessionChainStore.get(record.id);
        assert.equal(sealed.sealReason, 'max_compressions');
      } finally {
        _clearTestStrategyOverrides();
      }
    });

    it('handoff strategy (default): seals normally', async () => {
      // No override → uses default handoff
      const { app, sessionChainStore } = await setup();
      sessionChainStore.create({
        cliSessionId: 'cli-handoff',
        threadId: 'thread-1',
        agentId: 'opus',
        userId: 'user-1',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-handoff', reason: 'test-seal' },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.status, 'sealing');
    });
  });

  // --- Hook Token Authentication ---

  describe('Hook token authentication', () => {
    it('returns 401 when hookToken is configured but request has no token', async () => {
      const { app } = await setup({ hookToken: 'secret-token-123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        payload: { cliSessionId: 'cli-abc', reason: 'test' },
      });

      assert.equal(res.statusCode, 401);
      const body = JSON.parse(res.payload);
      assert.ok(body.error.includes('hook token'));
    });

    it('returns 401 when hookToken is configured but request has wrong token', async () => {
      const { app } = await setup({ hookToken: 'secret-token-123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: { 'x-office-claw-hook-token': 'wrong-token' },
        payload: { cliSessionId: 'cli-abc', reason: 'test' },
      });

      assert.equal(res.statusCode, 401);
    });

    it('allows request when hookToken matches', async () => {
      const { app, sessionChainStore } = await setup({ hookToken: 'secret-token-123' });
      sessionChainStore.create({
        cliSessionId: 'cli-auth',
        threadId: 'thread-1',
        agentId: 'opus',
        userId: 'user-1',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        headers: { 'x-office-claw-hook-token': 'secret-token-123' },
        payload: { cliSessionId: 'cli-auth', reason: 'test-auth' },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.status, 'sealing');
    });

    it('returns 503 when hookToken is not configured (fail-closed)', async () => {
      const { app } = await setup({ noToken: true }); // explicitly no hookToken

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/seal',
        payload: { cliSessionId: 'cli-noauth', reason: 'test' },
      });

      assert.equal(res.statusCode, 503);
      const body = JSON.parse(res.payload);
      assert.ok(body.error.includes('OFFICE_CLAW_HOOK_TOKEN'));
    });

    it('returns 401 for GET endpoint when token is missing', async () => {
      const { app } = await setup({ hookToken: 'secret-token-123' });

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/latest-digest?cliSessionId=cli-abc',
      });

      assert.equal(res.statusCode, 401);
    });
  });

  // --- F073 P4: SOP stage bookmark ---

  describe('POST /api/sessions/sop-bookmark (F073 P4)', () => {
    it('stores SOP bookmark for cliSessionId', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/sop-bookmark',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-sop-1', skill: 'tdd', sopStage: 'development' },
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.ok, true);
    });

    it('GET retrieves stored SOP bookmark', async () => {
      const { app } = await setup();

      // Store first
      await app.inject({
        method: 'POST',
        url: '/api/sessions/sop-bookmark',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-sop-2', skill: 'quality-gate', sopStage: 'quality-gate' },
      });

      // Retrieve
      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/sop-bookmark?cliSessionId=cli-sop-2',
        headers: authHeaders(),
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.equal(body.skill, 'quality-gate');
      assert.equal(body.sopStage, 'quality-gate');
      assert.ok(body.recordedAt);
    });

    it('GET returns 404 for unknown cliSessionId', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/sop-bookmark?cliSessionId=unknown-cli',
        headers: authHeaders(),
      });

      assert.equal(res.statusCode, 404);
    });

    it('POST overwrites previous bookmark for same cliSessionId', async () => {
      const { app } = await setup();

      await app.inject({
        method: 'POST',
        url: '/api/sessions/sop-bookmark',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-sop-3', skill: 'tdd', sopStage: 'development' },
      });

      await app.inject({
        method: 'POST',
        url: '/api/sessions/sop-bookmark',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-sop-3', skill: 'merge-gate', sopStage: 'merge' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/sessions/sop-bookmark?cliSessionId=cli-sop-3',
        headers: authHeaders(),
      });

      const body = JSON.parse(res.payload);
      assert.equal(body.skill, 'merge-gate');
      assert.equal(body.sopStage, 'merge');
    });

    it('POST returns 400 for missing required fields', async () => {
      const { app } = await setup();

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/sop-bookmark',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-sop-4' },
      });

      assert.equal(res.statusCode, 400);
    });

    it('requires hook token authentication', async () => {
      const { app } = await setup({ hookToken: 'secret-token-123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/sessions/sop-bookmark',
        payload: { cliSessionId: 'cli-sop-5', skill: 'tdd', sopStage: 'development' },
      });

      assert.equal(res.statusCode, 401);
    });

    it('TTL sweep removes entries older than 24h on next write', async () => {
      const { app } = await setup();

      // Store an old bookmark
      await app.inject({
        method: 'POST',
        url: '/api/sessions/sop-bookmark',
        headers: authHeaders(),
        payload: { cliSessionId: 'cli-old', skill: 'tdd', sopStage: 'development' },
      });

      // Verify it exists
      const check1 = await app.inject({
        method: 'GET',
        url: '/api/sessions/sop-bookmark?cliSessionId=cli-old',
        headers: authHeaders(),
      });
      assert.equal(check1.statusCode, 200, 'old bookmark should exist initially');

      // Monkey-patch Date to simulate 25h passing on next write
      const realNow = Date.now;
      Date.now = () => realNow() + 25 * 60 * 60 * 1000;
      try {
        // Write a new bookmark — triggers TTL sweep
        await app.inject({
          method: 'POST',
          url: '/api/sessions/sop-bookmark',
          headers: authHeaders(),
          payload: { cliSessionId: 'cli-new', skill: 'merge-gate', sopStage: 'merge' },
        });
      } finally {
        Date.now = realNow;
      }

      // Old bookmark should be swept
      const check2 = await app.inject({
        method: 'GET',
        url: '/api/sessions/sop-bookmark?cliSessionId=cli-old',
        headers: authHeaders(),
      });
      assert.equal(check2.statusCode, 404, 'old bookmark should be swept by TTL');

      // New bookmark should still exist
      const check3 = await app.inject({
        method: 'GET',
        url: '/api/sessions/sop-bookmark?cliSessionId=cli-new',
        headers: authHeaders(),
      });
      assert.equal(check3.statusCode, 200, 'new bookmark should survive TTL sweep');
    });
  });
});
