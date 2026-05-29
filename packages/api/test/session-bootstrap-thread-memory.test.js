/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSessionBootstrap } from '../dist/domains/agents/services/session/SessionBootstrap.js';
import { SessionChainStore } from '../dist/domains/agents/services/stores/ports/SessionChainStore.js';
import { ThreadStore } from '../dist/domains/agents/services/stores/ports/ThreadStore.js';

/** Fake TranscriptReader that returns stored digests */
function createFakeTranscriptReader(digests = new Map()) {
  return {
    async readDigest(sessionId, _threadId, _agentId) {
      return digests.get(sessionId) ?? null;
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
}

describe('SessionBootstrap — ThreadMemory injection', () => {
  it('includes thread memory when threadStore has memory', async () => {
    const chainStore = new SessionChainStore();
    const threadStore = new ThreadStore();
    const thread = threadStore.create('user1', 'test');

    // Create and seal a session (so bootstrap triggers for session #2)
    const s1 = chainStore.create({
      cliSessionId: 'cli-1',
      threadId: thread.id,
      agentId: 'opus',
      userId: 'user1',
    });
    chainStore.update(s1.id, { status: 'sealed', sealedAt: Date.now() });

    // Set ThreadMemory
    threadStore.updateThreadMemory(thread.id, {
      v: 1,
      summary: 'Session #1 (10:00-10:05, 5min): Edit, Read. Files: src/index.ts.',
      sessionsIncorporated: 1,
      updatedAt: Date.now(),
    });

    const fakeReader = createFakeTranscriptReader();
    const result = await buildSessionBootstrap(
      { sessionChainStore: chainStore, transcriptReader: fakeReader, threadStore },
      'opus',
      thread.id,
    );

    assert.ok(result);
    assert.equal(result.hasThreadMemory, true);
    assert.ok(result.text.includes('Thread Memory'));
    assert.ok(result.text.includes('Session #1'));
    assert.ok(result.text.includes('1 sessions'));
  });

  it('returns hasThreadMemory=false when no memory exists', async () => {
    const chainStore = new SessionChainStore();
    const threadStore = new ThreadStore();
    const thread = threadStore.create('user1', 'test');

    const s1 = chainStore.create({
      cliSessionId: 'cli-1',
      threadId: thread.id,
      agentId: 'opus',
      userId: 'user1',
    });
    chainStore.update(s1.id, { status: 'sealed', sealedAt: Date.now() });

    const fakeReader = createFakeTranscriptReader();
    const result = await buildSessionBootstrap(
      { sessionChainStore: chainStore, transcriptReader: fakeReader, threadStore },
      'opus',
      thread.id,
    );

    assert.ok(result);
    assert.equal(result.hasThreadMemory, false);
  });

  it('works without threadStore (backward compatible)', async () => {
    const chainStore = new SessionChainStore();

    const s1 = chainStore.create({
      cliSessionId: 'cli-1',
      threadId: 'default',
      agentId: 'opus',
      userId: 'user1',
    });
    chainStore.update(s1.id, { status: 'sealed', sealedAt: Date.now() });

    const fakeReader = createFakeTranscriptReader();
    const result = await buildSessionBootstrap(
      { sessionChainStore: chainStore, transcriptReader: fakeReader },
      'opus',
      'default',
    );

    assert.ok(result);
    assert.equal(result.hasThreadMemory, false);
    // Should still have session continuity info
    assert.ok(result.text.includes('Session Continuity'));
  });
});
