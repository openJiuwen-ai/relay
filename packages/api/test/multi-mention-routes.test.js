/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Multi-Mention Callback Route Tests (F086 M1)
 *
 * Tests POST /api/callbacks/multi-mention and GET /api/callbacks/multi-mention-status
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';
import Fastify from 'fastify';
import { resetMultiMentionOrchestrator } from '../dist/routes/callback-multi-mention-routes.js';

// Bootstrap officeClawRegistry from OFFICE_CLAW_CONFIGS (same as server startup)
for (const [id, config] of Object.entries(OFFICE_CLAW_CONFIGS)) {
  if (!officeClawRegistry.has(id)) officeClawRegistry.register(id, config);
}

// ── Mocks ──────────────────────────────────────────────────────────────

function createMockRegistry() {
  const records = new Map();
  return {
    register(agentId, threadId, userId) {
      const id = `inv-${records.size}`;
      const token = `tok-${records.size}`;
      records.set(id, { agentId, threadId, userId, invocationId: id, callbackToken: token });
      return { invocationId: id, callbackToken: token };
    },
    verify(invocationId, callbackToken) {
      const r = records.get(invocationId);
      if (!r || r.callbackToken !== callbackToken) return null;
      return r;
    },
    isLatest() {
      return true;
    },
    claimClientMessageId() {
      return true;
    },
  };
}

function createMockSocketManager() {
  const messages = [];
  const roomEvents = [];
  return {
    broadcastAgentMessage(msg, threadId) {
      messages.push({ ...msg, threadId });
    },
    broadcastToRoom(room, event, data) {
      roomEvents.push({ room, event, data });
    },
    getMessages() {
      return messages;
    },
    getRoomEvents() {
      return roomEvents;
    },
  };
}

function createMockMessageStore() {
  const messages = [];
  return {
    append(msg) {
      const stored = { id: `msg-${messages.length}`, ...msg };
      messages.push(stored);
      return stored;
    },
    getMessages() {
      return messages;
    },
  };
}

function createMockInvocationRecordStore() {
  let counter = 0;
  const created = [];
  const updates = [];
  const records = new Map();
  return {
    create(input) {
      const id = `inv-mm-${counter++}`;
      created.push({ id, ...input });
      records.set(id, {
        id,
        status: 'queued',
        ...input,
      });
      return { outcome: 'created', invocationId: id };
    },
    update(id, data) {
      updates.push({ id, data: { ...data } });
      const existing = records.get(id) ?? { id };
      const next = { ...existing, ...data };
      records.set(id, next);
      return next;
    },
    getCreated() {
      return created;
    },
    getUpdates() {
      return updates;
    },
    getRecord(id) {
      return records.get(id);
    },
  };
}

function createMockInvocationTracker() {
  const starts = [];
  const completes = [];
  return {
    start(threadId, agentId, userId, agentIds) {
      const controller = new AbortController();
      starts.push({ threadId, agentId, userId, agentIds, controller });
      return controller;
    },
    complete(threadId, agentId, controller) {
      completes.push({ threadId, agentId, controller });
    },
    getStarts() {
      return starts;
    },
    getCompletes() {
      return completes;
    },
  };
}

function createMockOutboundHook() {
  const deliveries = [];
  const batchDoneCalls = [];
  return {
    async deliver(threadId, content, agentId, richBlocks, threadMeta, origin, triggerMessageId, presentation) {
      deliveries.push({ threadId, content, agentId, richBlocks, threadMeta, origin, triggerMessageId, presentation });
    },
    async notifyDeliveryBatchDone(threadId, chainDone) {
      batchDoneCalls.push({ threadId, chainDone });
    },
    getDeliveries() {
      return deliveries;
    },
    getBatchDoneCalls() {
      return batchDoneCalls;
    },
  };
}

function createMockRouter(responses = {}) {
  const executions = [];
  return {
    async *routeExecution(userId, message, threadId, _invId, targetAgents, _intent, _opts) {
      executions.push({ userId, message, threadId, targetAgents });
      const agentId = targetAgents[0];
      const text = responses[agentId] ?? `Response from ${agentId}`;
      yield { type: 'text', agentId, content: text, timestamp: Date.now() };
      yield { type: 'done', agentId, isFinal: true, timestamp: Date.now() };
    },
    getExecutions() {
      return executions;
    },
  };
}

// ── Test setup ─────────────────────────────────────────────────────────

describe('Multi-Mention Routes', () => {
  /** @type {import('fastify').FastifyInstance} */
  let app;
  let mockRegistry;
  let mockSocket;
  let mockMessageStore;
  let mockInvocationRecordStore;
  let mockInvocationTracker;
  let mockOutboundHook;
  let mockRouter;
  let creds;

  beforeEach(async () => {
    resetMultiMentionOrchestrator();

    mockRegistry = createMockRegistry();
    mockSocket = createMockSocketManager();
    mockMessageStore = createMockMessageStore();
    mockInvocationRecordStore = createMockInvocationRecordStore();
    mockInvocationTracker = createMockInvocationTracker();
    mockOutboundHook = createMockOutboundHook();
    mockRouter = createMockRouter({ codex: 'Codex says hello', gemini: 'Gemini says hi' });

    // Register a caller invocation (opus calling)
    creds = mockRegistry.register('opus', 'thread-1', 'user-1');

    app = Fastify({ logger: false });

    const { registerMultiMentionRoutes } = await import('../dist/routes/callback-multi-mention-routes.js');

    registerMultiMentionRoutes(app, {
      registry: mockRegistry,
      messageStore: mockMessageStore,
      socketManager: mockSocket,
      outboundHook: mockOutboundHook,
      router: mockRouter,
      invocationRecordStore: mockInvocationRecordStore,
      invocationTracker: mockInvocationTracker,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── POST /api/callbacks/multi-mention ──────────────────────────────

  test('creates multi-mention request and returns requestId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'What do you think?',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.requestId);
    assert.equal(body.status, 'running');
  });

  test('flushes aggregated multi-mention result to outbound delivery hook', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'What do you think?',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 200);

    const start = Date.now();
    while (mockOutboundHook.getDeliveries().length === 0 && Date.now() - start < 1000) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const deliveries = mockOutboundHook.getDeliveries();
    assert.equal(deliveries.length, 1, 'aggregated result should be delivered outbound once');
    assert.equal(deliveries[0].threadId, 'thread-1');
    assert.equal(deliveries[0].agentId, 'opus');
    assert.equal(deliveries[0].origin, 'callback');
    assert.deepEqual(deliveries[0].presentation, {
      headerTitle: '共识总结结果汇总',
      suppressCatPrefix: true,
      suppressOriginDecoration: true,
      stripLeadingHeaderFromFormattedBody: true,
    });
    assert.ok(deliveries[0].content.startsWith('## 共识总结结果汇总'), 'plain-text connectors need the heading');
    assert.ok(deliveries[0].content.includes('Codex says hello'));
    assert.deepEqual(mockOutboundHook.getBatchDoneCalls(), [{ threadId: 'thread-1', chainDone: true }]);
  });

  test('rejects invalid callback credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: 'fake',
        callbackToken: 'fake',
        targets: ['codex'],
        question: 'test',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 401);
  });

  test('rejects unknown target cat', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['nonexistent-cat'],
        question: 'test',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Unknown cat'));
  });

  test('rejects unknown callbackTo cat', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'test',
        callbackTo: 'nonexistent-cat',
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('callbackTo'));
  });

  test('dispatches to all targets', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex', 'gemini'],
        question: 'Review this design',
        callbackTo: 'opus',
      },
    });

    // Wait for async dispatch to complete
    await new Promise((r) => setTimeout(r, 100));

    // Should have dispatched to both targets
    const executions = mockRouter.getExecutions();
    assert.equal(executions.length, 2);
    assert.ok(executions.some((e) => e.targetAgents[0] === 'codex'));
    assert.ok(executions.some((e) => e.targetAgents[0] === 'gemini'));
  });

  test('broadcasts intent_mode and tracks active slots for dispatched targets', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex', 'gemini'],
        question: 'Review this design',
        callbackTo: 'opus',
      },
    });

    await new Promise((r) => setTimeout(r, 100));

    const starts = mockInvocationTracker.getStarts();
    assert.equal(starts.length, 2);
    assert.deepEqual(starts.map((entry) => entry.agentId).sort(), ['codex', 'gemini']);

    const roomEvents = mockSocket.getRoomEvents().filter((event) => event.event === 'intent_mode');
    assert.equal(roomEvents.length, 2);
    assert.deepEqual(roomEvents.map((event) => event.data.targetAgents[0]).sort(), ['codex', 'gemini']);
    for (const event of roomEvents) {
      assert.equal(event.data.threadId, 'thread-1');
      assert.ok(event.data.invocationId, 'intent_mode should include invocationId');
    }

    const agentMessages = mockSocket
      .getMessages()
      .filter((message) => ['text', 'done'].includes(message.type) && ['codex', 'gemini'].includes(message.agentId));
    assert.ok(agentMessages.length >= 4, 'expected streamed text+done messages for both targets');
    for (const message of agentMessages) {
      assert.ok(message.invocationId, 'streamed multi-mention events should carry invocationId');
    }

    const completes = mockInvocationTracker.getCompletes();
    assert.equal(completes.length, 2);
  });

  test('includes multi-mention prefix in dispatched message', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'What is your opinion?',
        callbackTo: 'opus',
      },
    });

    await new Promise((r) => setTimeout(r, 100));

    const executions = mockRouter.getExecutions();
    assert.equal(executions.length, 1);
    assert.ok(executions[0].message.includes('[共识总结 from opus]'));
    assert.ok(executions[0].message.includes('What is your opinion?'));
  });

  test('uses default timeout when not specified', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'test',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 200);
  });

  test('accepts optional fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'test',
        callbackTo: 'opus',
        context: 'Some context',
        idempotencyKey: 'key-1',
        timeoutMinutes: 10,
        triggerType: 'design_review',
        searchEvidenceRefs: ['ref-1'],
      },
    });

    assert.equal(res.statusCode, 200);
  });

  // ── GET /api/callbacks/multi-mention-status ────────────────────────

  test('returns status for existing request', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'test',
        callbackTo: 'opus',
      },
    });

    const { requestId } = JSON.parse(createRes.body);

    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/callbacks/multi-mention-status',
      query: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        requestId,
      },
    });

    assert.equal(statusRes.statusCode, 200);
    const body = JSON.parse(statusRes.body);
    assert.equal(body.requestId, requestId);
    assert.ok(['running', 'partial', 'done'].includes(body.status));
  });

  test('returns 404 for unknown requestId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/multi-mention-status',
      query: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        requestId: 'nonexistent',
      },
    });

    assert.equal(res.statusCode, 404);
  });

  test('rejects status query with invalid credentials', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/callbacks/multi-mention-status',
      query: {
        invocationId: 'fake',
        callbackToken: 'fake',
        requestId: 'any',
      },
    });

    assert.equal(res.statusCode, 401);
  });

  // ── Result aggregation ────────────────────────────────────────────

  test('flushes aggregated result when all targets respond', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: creds.invocationId,
        callbackToken: creds.callbackToken,
        targets: ['codex'],
        question: 'Quick question',
        callbackTo: 'opus',
      },
    });

    // Wait for dispatch + flush
    await new Promise((r) => setTimeout(r, 200));

    // Should have stored the aggregated result
    const stored = mockMessageStore.getMessages();
    assert.ok(stored.length > 0);

    const resultMsg = stored.find((m) => m.content.includes('共识总结结果汇总'));
    assert.ok(resultMsg, 'Should have stored aggregated result message');
    assert.ok(resultMsg.content.includes('Quick question'));

    // Should have broadcast via connector_message
    const roomEvents = mockSocket.getRoomEvents();
    const connectorEvent = roomEvents.find((e) => e.event === 'connector_message');
    assert.ok(connectorEvent, 'Should have broadcast connector_message');
  });

  // ── Anti-cascade ──────────────────────────────────────────────────

  test('rejects multi-mention from active target cat (anti-cascade)', async () => {
    // Manually set up orchestrator state: opus created a multi-mention targeting codex
    const { getMultiMentionOrchestrator } = await import('../dist/routes/callback-multi-mention-routes.js');
    const orch = getMultiMentionOrchestrator();
    const { createAgentId } = await import('@openjiuwen/relay-shared');
    const req = orch.create({
      threadId: 'thread-1',
      initiator: createAgentId('opus'),
      callbackTo: createAgentId('opus'),
      targets: [createAgentId('codex')],
      question: 'First question',
      timeoutMinutes: 8,
    });
    orch.start(req.id);

    // Register codex invocation in same thread
    const codexCreds = mockRegistry.register('codex', 'thread-1', 'user-1');

    // codex tries to create another multi-mention — should be rejected
    const res = await app.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: codexCreds.invocationId,
        callbackToken: codexCreds.callbackToken,
        targets: ['gemini'],
        question: 'Cascading question',
        callbackTo: 'codex',
      },
    });

    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Anti-cascade'));
  });

  // ── InvocationTracker concurrent abort bug ──────────────────────

  test('concurrent dispatches are NOT aborted by InvocationTracker (per-thread singleton)', async () => {
    // Reproduce the bug: InvocationTracker.start() aborts prior invocation
    // for the same threadId, causing all but the last dispatch to lose their response.
    resetMultiMentionOrchestrator();

    const { InvocationTracker } = await import('../dist/domains/agents/services/agents/invocation/InvocationTracker.js');
    const tracker = new InvocationTracker();

    // Slow mock router: each target yields text after a delay, giving tracker
    // time to abort earlier dispatches
    const slowRouter = {
      async *routeExecution(_userId, _message, _threadId, _invId, targetAgents, _intent, opts) {
        const agentId = targetAgents[0];
        // Small delay to let concurrent starts happen
        await new Promise((r) => setTimeout(r, 30));
        // Check if we've been aborted
        if (opts?.signal?.aborted) return;
        yield { type: 'text', agentId, content: `Reply from ${agentId}`, timestamp: Date.now() };
        yield { type: 'done', agentId, isFinal: true, timestamp: Date.now() };
      },
    };

    // Re-create app with invocationTracker
    const trackerApp = Fastify({ logger: false });
    const { registerMultiMentionRoutes } = await import('../dist/routes/callback-multi-mention-routes.js');
    registerMultiMentionRoutes(trackerApp, {
      registry: mockRegistry,
      messageStore: mockMessageStore,
      socketManager: mockSocket,
      router: slowRouter,
      invocationRecordStore: mockInvocationRecordStore,
      invocationTracker: tracker,
    });
    await trackerApp.ready();

    // Use a separate creds so initiator (codex) is different from all targets
    const callerCreds = mockRegistry.register('codex', 'thread-1', 'user-1');

    await trackerApp.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: callerCreds.invocationId,
        callbackToken: callerCreds.callbackToken,
        targets: ['opus', 'gemini'],
        question: 'Test concurrent dispatch',
        callbackTo: 'codex',
      },
    });

    // Wait for all dispatches to complete
    await new Promise((r) => setTimeout(r, 500));

    // The aggregated result should contain replies from BOTH cats
    const stored = mockMessageStore.getMessages();
    const resultMsg = stored.find((m) => m.content.includes('共识总结结果汇总'));
    assert.ok(resultMsg, 'Should have aggregated result');
    assert.ok(resultMsg.content.includes('Reply from opus'), `Opus response missing. Got:\n${resultMsg?.content}`);
    assert.ok(resultMsg.content.includes('Reply from gemini'), `Gemini response missing. Got:\n${resultMsg?.content}`);

    await trackerApp.close();
  });

  // ── Idempotency ───────────────────────────────────────────────────

  test('idempotency key returns same requestId', async () => {
    const payload = {
      invocationId: creds.invocationId,
      callbackToken: creds.callbackToken,
      targets: ['codex'],
      question: 'test',
      callbackTo: 'opus',
      idempotencyKey: 'idem-1',
    };

    const res1 = await app.inject({ method: 'POST', url: '/api/callbacks/multi-mention', payload });
    const res2 = await app.inject({ method: 'POST', url: '/api/callbacks/multi-mention', payload });

    const body1 = JSON.parse(res1.body);
    const body2 = JSON.parse(res2.body);
    assert.equal(body1.requestId, body2.requestId);
  });

  // ── F122: target crash releases target slot (AC-A7) ────────────

  test('F122 AC-A7: target execution failure releases target tracker slot', async () => {
    resetMultiMentionOrchestrator();

    const { InvocationTracker } = await import('../dist/domains/agents/services/agents/invocation/InvocationTracker.js');
    const tracker = new InvocationTracker();

    // Router that throws (simulating target crash / context limit exceeded)
    const crashRouter = {
      async *routeExecution() {
        throw new Error('prompt token count of 158302 exceeds the limit of 128000');
      },
    };

    const crashApp = Fastify({ logger: false });
    const { registerMultiMentionRoutes } = await import('../dist/routes/callback-multi-mention-routes.js');
    registerMultiMentionRoutes(crashApp, {
      registry: mockRegistry,
      messageStore: mockMessageStore,
      socketManager: mockSocket,
      router: crashRouter,
      invocationRecordStore: mockInvocationRecordStore,
      invocationTracker: tracker,
    });
    await crashApp.ready();

    const crashCreds = mockRegistry.register('opus', 'thread-crash', 'user-1');

    const res = await crashApp.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: crashCreds.invocationId,
        callbackToken: crashCreds.callbackToken,
        targets: ['codex'],
        question: 'This will crash',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 200);

    // Wait for background dispatch to complete (with error)
    await new Promise((r) => setTimeout(r, 200));

    // The key assertion: target slot must be released after crash
    assert.equal(
      tracker.has('thread-crash', 'codex'),
      false,
      'Target cat slot must be released after execution failure',
    );
    // Thread-level check
    assert.equal(tracker.has('thread-crash'), false, 'Thread must have no active slots after target crash');
    const failedUpdate = mockInvocationRecordStore
      .getUpdates()
      .find((entry) => entry.data.status === 'failed' && entry.data.error === 'dispatch_error');
    assert.ok(failedUpdate, 'crashed multi-mention target must converge InvocationRecord to failed');

    await crashApp.close();
  });

  test('F122 AC-A7: pre-aborted controller still releases target tracker slot', async () => {
    resetMultiMentionOrchestrator();

    const { InvocationTracker } = await import('../dist/domains/agents/services/agents/invocation/InvocationTracker.js');
    const tracker = new InvocationTracker();

    // Pre-abort the slot: simulate another invocation aborting this one
    // by starting a slot for codex, then starting again (which aborts the first)
    const controller1 = tracker.start('thread-preabort', 'codex', 'user-1', ['codex']);
    // The slot is now active and not aborted
    assert.equal(tracker.has('thread-preabort', 'codex'), true);
    // Abort it to simulate preemption
    controller1.abort();
    tracker.complete('thread-preabort', 'codex', controller1);

    // Now the slot should be free for the next dispatch
    // The router doesn't matter here — what matters is the aborted-before-start path
    const normalRouter = {
      async *routeExecution(_u, _m, _t, _i, targetAgents) {
        const agentId = targetAgents[0];
        yield { type: 'text', agentId, content: 'ok', timestamp: Date.now() };
        yield { type: 'done', agentId, isFinal: true, timestamp: Date.now() };
      },
    };

    const preAbortApp = Fastify({ logger: false });
    const { registerMultiMentionRoutes } = await import('../dist/routes/callback-multi-mention-routes.js');
    registerMultiMentionRoutes(preAbortApp, {
      registry: mockRegistry,
      messageStore: mockMessageStore,
      socketManager: mockSocket,
      router: normalRouter,
      invocationRecordStore: mockInvocationRecordStore,
      invocationTracker: tracker,
    });
    await preAbortApp.ready();

    const preCreds = mockRegistry.register('opus', 'thread-preabort', 'user-1');

    const res = await preAbortApp.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: preCreds.invocationId,
        callbackToken: preCreds.callbackToken,
        targets: ['codex'],
        question: 'After preempt',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 200);
    await new Promise((r) => setTimeout(r, 200));

    // Slot must be released regardless of whether dispatch ran or was pre-aborted
    assert.equal(tracker.has('thread-preabort', 'codex'), false, 'Slot must be released after pre-aborted dispatch');

    await preAbortApp.close();
  });

  // ── F122: parentInvocationId passthrough ───────────────────────

  test('F122 AC-A1: dispatchToTarget passes parentInvocationId to routeExecution', async () => {
    resetMultiMentionOrchestrator();

    const capturedOpts = [];
    const capturingRouter = {
      async *routeExecution(_userId, _message, _threadId, _invId, targetAgents, _intent, opts) {
        capturedOpts.push(opts);
        const agentId = targetAgents[0];
        yield { type: 'text', agentId, content: `Response from ${agentId}`, timestamp: Date.now() };
        yield { type: 'done', agentId, isFinal: true, timestamp: Date.now() };
      },
    };

    const capApp = Fastify({ logger: false });
    const { registerMultiMentionRoutes } = await import('../dist/routes/callback-multi-mention-routes.js');
    registerMultiMentionRoutes(capApp, {
      registry: mockRegistry,
      messageStore: mockMessageStore,
      socketManager: mockSocket,
      router: capturingRouter,
      invocationRecordStore: mockInvocationRecordStore,
      invocationTracker: mockInvocationTracker,
    });
    await capApp.ready();

    const capCreds = mockRegistry.register('opus', 'thread-pid', 'user-1');

    const res = await capApp.inject({
      method: 'POST',
      url: '/api/callbacks/multi-mention',
      payload: {
        invocationId: capCreds.invocationId,
        callbackToken: capCreds.callbackToken,
        targets: ['codex'],
        question: 'F122 parentInvocationId test',
        callbackTo: 'opus',
      },
    });

    assert.equal(res.statusCode, 200);

    // Wait for background dispatch
    await new Promise((r) => setTimeout(r, 100));

    assert.equal(capturedOpts.length, 1, 'routeExecution should be called once');
    assert.ok(capturedOpts[0].parentInvocationId, 'opts must include parentInvocationId');
    assert.ok(typeof capturedOpts[0].parentInvocationId === 'string', 'parentInvocationId must be a string');
    assert.ok(capturedOpts[0].signal, 'opts must still include signal');

    await capApp.close();
  });
});
