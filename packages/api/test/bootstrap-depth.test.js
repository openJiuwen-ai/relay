/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * SessionBootstrap bootstrapDepth branching tests — F065 Phase C Task 4
 *
 * Tests that buildSessionBootstrap reads handoff digest when bootstrapDepth=generative,
 * falls back to extractive, and still works for extractive-only cats.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('SessionBootstrap bootstrapDepth branching', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'bootstrap-depth-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  async function createFixtures(bootstrapDepth) {
    const { SessionChainStore } = await import('../dist/domains/agents/services/stores/ports/SessionChainStore.js');
    const { TranscriptReader } = await import('../dist/domains/agents/services/session/TranscriptReader.js');
    const { buildSessionBootstrap } = await import('../dist/domains/agents/services/session/SessionBootstrap.js');

    const store = new SessionChainStore();
    const reader = new TranscriptReader({ dataDir: tempDir });

    return { store, reader, buildSessionBootstrap, bootstrapDepth };
  }

  async function setupPreviousSession(store, tempDir, opts = {}) {
    // Create and seal a previous session
    const record = store.create({
      cliSessionId: 'cli-prev',
      threadId: 'thread-1',
      agentId: 'opus',
      userId: 'user-1',
    });
    store.update(record.id, { status: 'sealed', sealedAt: Date.now() });

    const sessionDir = join(tempDir, 'threads', 'thread-1', 'opus', 'sessions', record.id);
    await mkdir(sessionDir, { recursive: true });

    // Write extractive digest
    await writeFile(
      join(sessionDir, 'digest.extractive.json'),
      JSON.stringify({
        v: 1,
        sessionId: record.id,
        threadId: 'thread-1',
        agentId: 'opus',
        seq: 0,
        time: { createdAt: 1709700000000, sealedAt: 1709700060000 },
        invocations: [{ toolNames: ['Read', 'Edit'] }],
        filesTouched: [{ path: 'src/foo.ts', ops: ['edit'] }],
        errors: [],
      }),
    );

    if (opts.withHandoff) {
      await writeFile(
        join(sessionDir, 'digest.handoff.md'),
        [
          '---',
          'v: 1',
          'model: claude-haiku-4-5-20251001',
          'generatedAt: 1709700000000',
          '---',
          '',
          '## Session Summary',
          'Fixed a critical bug in foo.ts. The issue was a null pointer dereference.',
        ].join('\n'),
      );
    }

    // Create a new active session (session #2)
    store.create({ cliSessionId: 'cli-current', threadId: 'thread-1', agentId: 'opus', userId: 'user-1' });

    return record;
  }

  test('generative: prefers handoff digest when available', async () => {
    const { store, reader, buildSessionBootstrap } = await createFixtures('generative');
    await setupPreviousSession(store, tempDir, { withHandoff: true });

    const result = await buildSessionBootstrap(
      { sessionChainStore: store, transcriptReader: reader, bootstrapDepth: 'generative' },
      'opus',
      'thread-1',
    );

    assert.ok(result);
    assert.ok(result.hasDigest);
    // Should contain handoff content, not extractive
    assert.ok(result.text.includes('Fixed a critical bug'), 'should contain handoff digest body');
    assert.ok(result.text.includes('null pointer dereference'), 'should contain handoff detail');
  });

  test('generative: falls back to extractive when no handoff exists', async () => {
    const { store, reader, buildSessionBootstrap } = await createFixtures('generative');
    await setupPreviousSession(store, tempDir, { withHandoff: false });

    const result = await buildSessionBootstrap(
      { sessionChainStore: store, transcriptReader: reader, bootstrapDepth: 'generative' },
      'opus',
      'thread-1',
    );

    assert.ok(result);
    assert.ok(result.hasDigest);
    // Should contain extractive content
    assert.ok(result.text.includes('src/foo.ts'), 'should contain extractive digest file paths');
  });

  test('extractive: always uses extractive digest even when handoff exists', async () => {
    const { store, reader, buildSessionBootstrap } = await createFixtures('extractive');
    await setupPreviousSession(store, tempDir, { withHandoff: true });

    const result = await buildSessionBootstrap(
      { sessionChainStore: store, transcriptReader: reader, bootstrapDepth: 'extractive' },
      'opus',
      'thread-1',
    );

    assert.ok(result);
    assert.ok(result.hasDigest);
    // Should NOT contain handoff content
    assert.ok(!result.text.includes('Fixed a critical bug'), 'should NOT use handoff digest');
    assert.ok(result.text.includes('src/foo.ts'), 'should use extractive digest');
  });

  test('default (no bootstrapDepth): uses extractive digest', async () => {
    const { store, reader, buildSessionBootstrap } = await createFixtures(undefined);
    await setupPreviousSession(store, tempDir, { withHandoff: true });

    const result = await buildSessionBootstrap(
      { sessionChainStore: store, transcriptReader: reader },
      'opus',
      'thread-1',
    );

    assert.ok(result);
    assert.ok(result.hasDigest);
    assert.ok(result.text.includes('src/foo.ts'), 'should use extractive digest by default');
  });
});
