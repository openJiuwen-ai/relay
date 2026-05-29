/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { SessionSealer } from '../dist/domains/agents/services/session/SessionSealer.js';
import { SessionChainStore } from '../dist/domains/agents/services/stores/ports/SessionChainStore.js';
import { ThreadStore } from '../dist/domains/agents/services/stores/ports/ThreadStore.js';

/**
 * Minimal TranscriptWriter mock: flush writes a digest to our fake reader.
 */
function createMockTranscriptWriter(fakeReader) {
  return {
    appendEvent() {},
    flush(session, timestamps) {
      // Store digest that the fakeReader will return
      const digest = {
        v: 1,
        sessionId: session.sessionId,
        threadId: session.threadId,
        agentId: session.agentId,
        seq: session.seq,
        time: timestamps,
        invocations: [{ toolNames: ['Edit', 'Read'] }],
        filesTouched: [{ path: 'src/index.ts', ops: ['edit'] }],
        errors: [],
      };
      fakeReader._digestStore.set(`${session.threadId}/${session.agentId}/${session.sessionId}`, digest);
    },
  };
}

function createMockTranscriptReader() {
  const reader = {
    _digestStore: new Map(),
    async readDigest(sessionId, threadId, agentId) {
      return reader._digestStore.get(`${threadId}/${agentId}/${sessionId}`) ?? null;
    },
    async readEvents() {
      return { events: [], total: 0 };
    },
    async search() {
      return [];
    },
    async readInvocationEvents() {
      return null;
    },
    async hasTranscript() {
      return false;
    },
  };
  return reader;
}

describe('SessionSealer — ThreadMemory integration', () => {
  let chainStore;
  let threadStore;
  let fakeReader;
  let fakeWriter;
  let sealer;

  beforeEach(() => {
    chainStore = new SessionChainStore();
    threadStore = new ThreadStore();
    fakeReader = createMockTranscriptReader();
    fakeWriter = createMockTranscriptWriter(fakeReader);

    sealer = new SessionSealer(
      chainStore,
      fakeWriter,
      threadStore,
      fakeReader,
      () => 180000, // Opus maxPromptTokens
    );
  });

  it('updates ThreadMemory on finalize', async () => {
    // Create thread + session
    const thread = threadStore.create('user1', 'test thread');
    const session = chainStore.create({
      cliSessionId: 'cli-1',
      threadId: thread.id,
      agentId: 'opus',
      userId: 'user1',
    });

    // Request seal + finalize
    await sealer.requestSeal({ sessionId: session.id, reason: 'threshold' });
    await sealer.finalize({ sessionId: session.id });

    // Check thread memory was created
    const mem = threadStore.getThreadMemory(thread.id);
    assert.ok(mem, 'ThreadMemory should exist after seal');
    assert.equal(mem.v, 1);
    assert.equal(mem.sessionsIncorporated, 1);
    assert.ok(mem.summary.includes('Session #1'));
    assert.ok(mem.summary.includes('Edit'));
  });

  it('accumulates across multiple seals', async () => {
    const thread = threadStore.create('user1', 'multi-seal');

    // Seal session 1
    const s1 = chainStore.create({
      cliSessionId: 'cli-1',
      threadId: thread.id,
      agentId: 'opus',
      userId: 'user1',
    });
    await sealer.requestSeal({ sessionId: s1.id, reason: 'threshold' });
    await sealer.finalize({ sessionId: s1.id });

    // Seal session 2
    const s2 = chainStore.create({
      cliSessionId: 'cli-2',
      threadId: thread.id,
      agentId: 'opus',
      userId: 'user1',
    });
    await sealer.requestSeal({ sessionId: s2.id, reason: 'threshold' });
    await sealer.finalize({ sessionId: s2.id });

    const mem = threadStore.getThreadMemory(thread.id);
    assert.ok(mem);
    assert.equal(mem.sessionsIncorporated, 2);
    assert.ok(mem.summary.includes('Session #2'));
    assert.ok(mem.summary.includes('Session #1'));
  });

  it('still seals when ThreadMemory update fails', async () => {
    // Use a threadStore that throws on updateThreadMemory
    const brokenThreadStore = new ThreadStore();
    brokenThreadStore.updateThreadMemory = () => {
      throw new Error('boom');
    };

    const brokenSealer = new SessionSealer(chainStore, fakeWriter, brokenThreadStore, fakeReader, () => 180000);

    const thread = brokenThreadStore.create('user1', 'broken');
    const session = chainStore.create({
      cliSessionId: 'cli-3',
      threadId: thread.id,
      agentId: 'opus',
      userId: 'user1',
    });

    await brokenSealer.requestSeal({ sessionId: session.id, reason: 'threshold' });
    await brokenSealer.finalize({ sessionId: session.id });

    // Session should still be sealed despite ThreadMemory failure
    const record = chainStore.get(session.id);
    assert.equal(record.status, 'sealed');
  });

  it('uses dynamic token cap based on getMaxPromptTokens', async () => {
    // Spark: 64k → cap = max(1200, min(3000, floor(64000*0.03))) = max(1200,1920) = 1920
    const sparkSealer = new SessionSealer(chainStore, fakeWriter, threadStore, fakeReader, () => 64000);

    const thread = threadStore.create('user1', 'spark');
    const session = chainStore.create({
      cliSessionId: 'cli-4',
      threadId: thread.id,
      agentId: 'spark',
      userId: 'user1',
    });
    await sparkSealer.requestSeal({ sessionId: session.id, reason: 'threshold' });
    await sparkSealer.finalize({ sessionId: session.id });

    const mem = threadStore.getThreadMemory(thread.id);
    assert.ok(mem);
    // Can't directly test the cap, but we verify it doesn't crash
    assert.equal(mem.sessionsIncorporated, 1);
  });
});
