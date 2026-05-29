/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F98: Session Query Tools Upgrade Tests
 *
 * Gap 1: read_session_events view modes (raw/chat/handoff)
 * Gap 2: readInvocationEvents (for read_invocation_detail)
 * Gap 3: session_search returns invocationId in pointer
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('F98: Session Query Tools Upgrade', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'f98-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function loadModules() {
    const { TranscriptWriter } = await import('../dist/domains/agents/services/session/TranscriptWriter.js');
    const { TranscriptReader } = await import('../dist/domains/agents/services/session/TranscriptReader.js');
    const { formatEventsChat, formatEventsHandoff } = await import(
      '../dist/domains/agents/services/session/TranscriptFormatter.js'
    );
    return { TranscriptWriter, TranscriptReader, formatEventsChat, formatEventsHandoff };
  }

  const SESSION_INFO = {
    sessionId: 'sess-f98',
    threadId: 'thread-f98',
    agentId: 'opus',
    cliSessionId: 'cli-f98',
    seq: 0,
  };

  const INV_A = 'inv-aaa';
  const INV_B = 'inv-bbb';

  async function createFixtureWithInvocations(modules) {
    const { TranscriptWriter, TranscriptReader } = modules;
    const writer = new TranscriptWriter({ dataDir: tmpDir });
    const reader = new TranscriptReader({ dataDir: tmpDir });

    // Invocation A: user asks, assistant responds, uses Edit tool
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'user',
        content: [{ type: 'text', text: 'Please fix the bug in app.ts' }],
      },
      INV_A,
    );
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'assistant',
        content: [{ type: 'text', text: 'I will fix the bug in app.ts now.' }],
      },
      INV_A,
    );
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'tool_use',
        name: 'Edit',
        input: { file_path: '/src/app.ts' },
      },
      INV_A,
    );
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'tool_result',
        content: 'File edited successfully',
      },
      INV_A,
    );

    // Invocation B: user asks about tests, assistant responds, tool error
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'user',
        content: [{ type: 'text', text: 'Run the tests please' }],
      },
      INV_B,
    );
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'assistant',
        content: [{ type: 'text', text: 'Running tests now.' }],
      },
      INV_B,
    );
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'tool_use',
        name: 'Bash',
        input: { command: 'npm test' },
      },
      INV_B,
    );
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'tool_result',
        content: 'Test failed: assertion error',
        is_error: true,
      },
      INV_B,
    );
    writer.appendEvent(
      SESSION_INFO,
      {
        type: 'assistant',
        content: 'The test failed with an assertion error. Let me investigate.',
      },
      INV_B,
    );

    await writer.flush(SESSION_INFO, { createdAt: 1000, sealedAt: 5000 });
    return { writer, reader };
  }

  // --- Gap 1: View modes ---

  describe('Gap 1: formatEventsChat()', () => {
    test('extracts only message events with role/content', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureWithInvocations(modules);
      const { formatEventsChat } = modules;

      const result = await reader.readEvents('sess-f98', 'thread-f98', 'opus');
      const messages = formatEventsChat(result.events);

      // Should have 5 messages (2 user + 3 assistant), skip 2 tool_use + 2 tool_result
      assert.equal(messages.length, 5);
      assert.equal(messages[0].role, 'user');
      assert.equal(messages[0].content, 'Please fix the bug in app.ts');
      assert.equal(messages[1].role, 'assistant');
      assert.ok(messages[0].invocationId === INV_A);
    });

    test('skips events without text content', async () => {
      const modules = await loadModules();
      const { TranscriptWriter, TranscriptReader, formatEventsChat } = modules;
      const writer = new TranscriptWriter({ dataDir: tmpDir });
      const reader = new TranscriptReader({ dataDir: tmpDir });
      const session = { ...SESSION_INFO, sessionId: 'sess-empty' };

      writer.appendEvent(session, { type: 'system', content: [] }, 'inv-x');
      writer.appendEvent(session, { type: 'tool_use', name: 'Read' }, 'inv-x');
      await writer.flush(session, { createdAt: 1000, sealedAt: 2000 });

      const result = await reader.readEvents('sess-empty', 'thread-f98', 'opus');
      const messages = formatEventsChat(result.events);
      assert.equal(messages.length, 0);
    });
  });

  describe('Gap 1: formatEventsHandoff()', () => {
    test('groups events by invocationId', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureWithInvocations(modules);
      const { formatEventsHandoff } = modules;

      const result = await reader.readEvents('sess-f98', 'thread-f98', 'opus');
      const summaries = formatEventsHandoff(result.events);

      assert.equal(summaries.length, 2);

      const invA = summaries.find((s) => s.invocationId === INV_A);
      const invB = summaries.find((s) => s.invocationId === INV_B);
      assert.ok(invA);
      assert.ok(invB);

      // Invocation A: 4 events, 1 tool (Edit), 0 errors
      assert.equal(invA.eventCount, 4);
      assert.deepEqual(invA.toolCalls, ['Edit']);
      assert.equal(invA.errors, 0);

      // Invocation B: 5 events, 1 tool (Bash), 1 error
      assert.equal(invB.eventCount, 5);
      assert.deepEqual(invB.toolCalls, ['Bash']);
      assert.equal(invB.errors, 1);
    });

    test('deduplicates tool names per invocation', async () => {
      const modules = await loadModules();
      const { TranscriptWriter, TranscriptReader, formatEventsHandoff } = modules;
      const writer = new TranscriptWriter({ dataDir: tmpDir });
      const reader = new TranscriptReader({ dataDir: tmpDir });
      const session = { ...SESSION_INFO, sessionId: 'sess-dedup' };

      writer.appendEvent(session, { type: 'tool_use', name: 'Edit' }, 'inv-c');
      writer.appendEvent(session, { type: 'tool_use', name: 'Edit' }, 'inv-c');
      writer.appendEvent(session, { type: 'tool_use', name: 'Read' }, 'inv-c');
      await writer.flush(session, { createdAt: 1000, sealedAt: 2000 });

      const result = await reader.readEvents('sess-dedup', 'thread-f98', 'opus');
      const summaries = formatEventsHandoff(result.events);

      assert.equal(summaries.length, 1);
      assert.deepEqual(summaries[0].toolCalls, ['Edit', 'Read']);
    });

    test('handles events without invocationId', async () => {
      const modules = await loadModules();
      const { TranscriptWriter, TranscriptReader, formatEventsHandoff } = modules;
      const writer = new TranscriptWriter({ dataDir: tmpDir });
      const reader = new TranscriptReader({ dataDir: tmpDir });
      const session = { ...SESSION_INFO, sessionId: 'sess-noinv' };

      // No invocationId passed
      writer.appendEvent(session, { type: 'assistant', content: 'hello' });
      await writer.flush(session, { createdAt: 1000, sealedAt: 2000 });

      const result = await reader.readEvents('sess-noinv', 'thread-f98', 'opus');
      const summaries = formatEventsHandoff(result.events);

      assert.equal(summaries.length, 1);
      assert.equal(summaries[0].invocationId, '_unknown');
    });
  });

  // --- Gap 2: readInvocationEvents ---

  describe('Gap 2: readInvocationEvents()', () => {
    test('returns events filtered by invocationId', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureWithInvocations(modules);

      const events = await reader.readInvocationEvents('sess-f98', 'thread-f98', 'opus', INV_A);
      assert.ok(events);
      assert.equal(events.length, 4);
      for (const evt of events) {
        assert.equal(evt.invocationId, INV_A);
      }
    });

    test('returns null for nonexistent invocationId', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureWithInvocations(modules);

      const events = await reader.readInvocationEvents('sess-f98', 'thread-f98', 'opus', 'inv-nonexistent');
      assert.equal(events, null);
    });

    test('returns null for nonexistent session', async () => {
      const modules = await loadModules();
      const reader = new modules.TranscriptReader({ dataDir: tmpDir });

      const events = await reader.readInvocationEvents('nonexistent', 'thread-f98', 'opus', INV_A);
      assert.equal(events, null);
    });
  });

  // --- Gap 3: search returns invocationId ---

  describe('Gap 3: search returns invocationId in pointer', () => {
    test('event hits include invocationId when present', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureWithInvocations(modules);

      const hits = await reader.search('thread-f98', 'bug', { scope: 'transcripts' });
      assert.ok(hits.length > 0);

      const eventHit = hits.find((h) => h.kind === 'event');
      assert.ok(eventHit);
      assert.ok(eventHit.pointer.invocationId, 'Should have invocationId in pointer');
      assert.equal(eventHit.pointer.invocationId, INV_A);
    });

    test('digest hits have no invocationId in pointer', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureWithInvocations(modules);

      const hits = await reader.search('thread-f98', 'Edit', { scope: 'digests' });
      const digestHit = hits.find((h) => h.kind === 'digest');
      if (digestHit) {
        assert.equal(digestHit.pointer.invocationId, undefined);
      }
    });
  });
});
