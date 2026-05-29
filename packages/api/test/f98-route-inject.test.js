/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F98 Route Inject Tests — Review P1
 * Fastify inject tests for session-transcript route changes:
 * - GET /api/sessions/:sessionId/events?view=  (view modes)
 * - GET /api/sessions/:sessionId/invocations/:invocationId
 *
 * Also covers P2-1 (extractTextContent type guard) and P2-2 (keyMessages limit).
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
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

describe('F98 Route Inject: session-transcript', () => {
  let app;
  let tmpDir;

  const THREAD = { id: 'thread-1', createdBy: 'user-1' };

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'f98-route-'));
  });

  afterEach(async () => {
    if (app) await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setup() {
    const { SessionChainStore } = await import('../dist/domains/agents/services/stores/ports/SessionChainStore.js');
    const { TranscriptWriter } = await import('../dist/domains/agents/services/session/TranscriptWriter.js');
    const { TranscriptReader } = await import('../dist/domains/agents/services/session/TranscriptReader.js');
    const { sessionTranscriptRoutes } = await import('../dist/routes/session-transcript.js');

    const sessionChainStore = new SessionChainStore();
    const threadStore = mockThreadStore({ 'thread-1': THREAD });
    const transcriptReader = new TranscriptReader({ dataDir: tmpDir });
    const writer = new TranscriptWriter({ dataDir: tmpDir });

    app = Fastify();
    await app.register(sessionTranscriptRoutes, {
      sessionChainStore,
      threadStore,
      transcriptReader,
    });
    await app.ready();

    return { sessionChainStore, writer, transcriptReader };
  }

  async function createSessionWithEvents(sessionChainStore, writer) {
    const record = sessionChainStore.create({
      cliSessionId: 'cli-1',
      threadId: 'thread-1',
      agentId: 'opus',
      userId: 'user-1',
    });
    const sessInfo = {
      sessionId: record.id,
      threadId: 'thread-1',
      agentId: 'opus',
      cliSessionId: 'cli-1',
      seq: 0,
    };
    const invId = 'inv-test-001';

    writer.appendEvent(
      sessInfo,
      {
        type: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      invId,
    );
    writer.appendEvent(
      sessInfo,
      {
        type: 'assistant',
        content: [{ type: 'text', text: 'Hi there!' }],
      },
      invId,
    );
    writer.appendEvent(
      sessInfo,
      {
        type: 'tool_use',
        name: 'Read',
        input: { file_path: '/a.ts' },
      },
      invId,
    );

    // Seal so transcript is readable
    sessionChainStore.update(record.id, { status: 'sealed' });
    await writer.flush(sessInfo, { createdAt: 1000, sealedAt: 2000 });

    return { record, invId };
  }

  // --- Auth tests ---

  it('GET /events returns 401 without identity', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/events`,
    });
    assert.equal(res.statusCode, 401);
  });

  it('GET /events returns 403 for wrong user', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/events`,
      headers: { 'x-office-claw-user': 'other-user' },
    });
    assert.equal(res.statusCode, 403);
  });

  it('GET /events returns 404 for unknown session', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/nonexistent/events',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 404);
  });

  // --- view parameter tests ---

  it('GET /events?view=invalid returns 400', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/events?view=banana`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes('Invalid view'));
  });

  it('GET /events?view=raw returns events array (backward compat)', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/events?view=raw`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.events));
    assert.equal(body.events.length, 3);
  });

  it('GET /events (no view) returns raw events (default)', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/events`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.events));
  });

  it('GET /events?view=chat returns messages array', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/events?view=chat`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.messages));
    // 2 messages: user + assistant (tool_use filtered out)
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.messages[1].role, 'assistant');
  });

  it('GET /events?view=handoff returns invocations array', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/events?view=handoff`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.invocations));
    assert.equal(body.invocations.length, 1);
    assert.equal(body.invocations[0].invocationId, 'inv-test-001');
    assert.deepEqual(body.invocations[0].toolCalls, ['Read']);
  });

  // --- Invocation detail endpoint tests ---

  it('GET /invocations/:invocationId returns 401 without identity', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record, invId } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/invocations/${invId}`,
    });
    assert.equal(res.statusCode, 401);
  });

  it('GET /invocations/:invocationId returns 404 for unknown session', async () => {
    await setup();
    const res = await app.inject({
      method: 'GET',
      url: '/api/sessions/nonexistent/invocations/inv-xyz',
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 404);
  });

  it('GET /invocations/:invocationId returns 404 for unknown invocation', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/invocations/inv-nonexistent`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 404);
  });

  it('GET /invocations/:invocationId returns events for valid invocation', async () => {
    const { sessionChainStore, writer } = await setup();
    const { record, invId } = await createSessionWithEvents(sessionChainStore, writer);

    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${record.id}/invocations/${invId}`,
      headers: { 'x-office-claw-user': 'user-1' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.invocationId, invId);
    assert.equal(body.total, 3);
    assert.equal(body.events.length, 3);
  });
});

// --- Cloud R1 P1-1: production event types (type:'text') ---

describe('Cloud P1-1: chat view handles production event type (text)', () => {
  it('includes type:text events as role:assistant', async () => {
    const { formatEventsChat } = await import('../dist/domains/agents/services/session/TranscriptFormatter.js');
    const events = [
      {
        v: 1,
        t: 1000,
        threadId: 't',
        agentId: 'opus',
        sessionId: 's',
        cliSessionId: 'c',
        invocationId: 'inv-1',
        eventNo: 0,
        event: { type: 'text', content: 'I will fix the bug.' },
      },
      {
        v: 1,
        t: 1001,
        threadId: 't',
        agentId: 'opus',
        sessionId: 's',
        cliSessionId: 'c',
        invocationId: 'inv-1',
        eventNo: 1,
        event: { type: 'tool_use', toolName: 'Edit', toolInput: { file_path: '/app.ts' } },
      },
    ];
    const messages = formatEventsChat(events);
    assert.equal(messages.length, 1, 'Should extract 1 text message, skip tool_use');
    assert.equal(messages[0].role, 'assistant');
    assert.equal(messages[0].content, 'I will fix the bug.');
  });
});

// --- Cloud R1 P1-2: production toolName field ---

describe('Cloud P1-2: handoff view reads toolName field', () => {
  it('extracts tool names from toolName (production format)', async () => {
    const { formatEventsHandoff } = await import('../dist/domains/agents/services/session/TranscriptFormatter.js');
    const events = [
      {
        v: 1,
        t: 1000,
        threadId: 't',
        agentId: 'opus',
        sessionId: 's',
        cliSessionId: 'c',
        invocationId: 'inv-1',
        eventNo: 0,
        event: { type: 'tool_use', toolName: 'Read' },
      },
      {
        v: 1,
        t: 1001,
        threadId: 't',
        agentId: 'opus',
        sessionId: 's',
        cliSessionId: 'c',
        invocationId: 'inv-1',
        eventNo: 1,
        event: { type: 'tool_use', toolName: 'Edit' },
      },
    ];
    const summaries = formatEventsHandoff(events);
    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0].toolCalls, ['Read', 'Edit']);
  });

  it('extracts key messages from type:text events', async () => {
    const { formatEventsHandoff } = await import('../dist/domains/agents/services/session/TranscriptFormatter.js');
    const events = [
      {
        v: 1,
        t: 1000,
        threadId: 't',
        agentId: 'opus',
        sessionId: 's',
        cliSessionId: 'c',
        invocationId: 'inv-1',
        eventNo: 0,
        event: { type: 'text', content: 'Found the bug in app.ts.' },
      },
    ];
    const summaries = formatEventsHandoff(events);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].keyMessages.length, 1);
    assert.equal(summaries[0].keyMessages[0], 'Found the bug in app.ts.');
  });
});

// --- P2-1: extractTextContent type guard ---

describe('P2-1: extractTextContent rejects non-string text', () => {
  it('skips content items where text is not a string', async () => {
    const { formatEventsChat } = await import('../dist/domains/agents/services/session/TranscriptFormatter.js');
    const events = [
      {
        v: 1,
        t: 1000,
        threadId: 't',
        agentId: 'opus',
        sessionId: 's',
        cliSessionId: 'c',
        eventNo: 0,
        event: {
          type: 'assistant',
          content: [
            { type: 'text', text: 42 }, // number, not string
            { type: 'text' }, // missing text field
            { type: 'text', text: 'valid' }, // valid
          ],
        },
      },
    ];
    const messages = formatEventsChat(events);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].content, 'valid');
  });
});

// --- P2-2: keyMessages upper bound ---

describe('P2-2: handoff keyMessages capped at 5', () => {
  it('limits keyMessages to 5 per invocation', async () => {
    const { formatEventsHandoff } = await import('../dist/domains/agents/services/session/TranscriptFormatter.js');
    // Create 10 assistant events in same invocation
    const events = Array.from({ length: 10 }, (_, i) => ({
      v: 1,
      t: 1000 + i,
      threadId: 't',
      agentId: 'opus',
      sessionId: 's',
      cliSessionId: 'c',
      invocationId: 'inv-many',
      eventNo: i,
      event: {
        type: 'assistant',
        content: `Message number ${i}`,
      },
    }));
    const summaries = formatEventsHandoff(events);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].keyMessages.length, 5);
  });
});
