/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * TranscriptReader Tests
 * F24 Phase D: Read sealed session transcripts from disk.
 *
 * Uses TranscriptWriter to create test fixtures, then reads back.
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';

describe('TranscriptReader', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'transcript-reader-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function loadModules() {
    const { TranscriptWriter } = await import('../dist/domains/agents/services/session/TranscriptWriter.js');
    const { TranscriptReader } = await import('../dist/domains/agents/services/session/TranscriptReader.js');
    return { TranscriptWriter, TranscriptReader };
  }

  const SESSION_INFO = {
    sessionId: 'sess-abc',
    threadId: 'thread-1',
    agentId: 'opus',
    cliSessionId: 'cli-123',
    seq: 0,
  };

  async function createFixtureSession(modules, overrides = {}) {
    const { TranscriptWriter, TranscriptReader } = modules;
    const writer = new TranscriptWriter({ dataDir: tmpDir });
    const reader = new TranscriptReader({ dataDir: tmpDir });
    const session = { ...SESSION_INFO, ...overrides };

    // Write some events
    writer.appendEvent(session, {
      type: 'assistant',
      content: [{ type: 'text', text: 'Hello, I am opus!' }],
    });
    writer.appendEvent(session, {
      type: 'user',
      content: [{ type: 'text', text: 'Please edit the file' }],
    });
    writer.appendEvent(session, {
      type: 'tool_use',
      name: 'Edit',
      input: { file_path: '/src/app.ts' },
    });
    writer.appendEvent(session, {
      type: 'tool_result',
      content: 'File edited successfully',
    });
    writer.appendEvent(session, {
      type: 'assistant',
      content: [{ type: 'text', text: 'Done editing the file!' }],
    });

    await writer.flush(session, { createdAt: 1000, sealedAt: 2000 });

    return { writer, reader, session };
  }

  describe('readEvents()', () => {
    test('reads all events from sealed session', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      const result = await reader.readEvents('sess-abc', 'thread-1', 'opus');
      assert.equal(result.events.length, 5);
      assert.equal(result.total, 5);
      assert.equal(result.events[0].eventNo, 0);
      assert.equal(result.events[4].eventNo, 4);
    });

    test('supports cursor-based pagination', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      // Read first 2
      const page1 = await reader.readEvents('sess-abc', 'thread-1', 'opus', undefined, 2);
      assert.equal(page1.events.length, 2);
      assert.ok(page1.nextCursor, 'Should have next cursor');

      // Read next 2 from cursor
      const page2 = await reader.readEvents('sess-abc', 'thread-1', 'opus', page1.nextCursor, 2);
      assert.equal(page2.events.length, 2);
      assert.ok(page2.nextCursor);

      // Read remaining
      const page3 = await reader.readEvents('sess-abc', 'thread-1', 'opus', page2.nextCursor, 10);
      assert.equal(page3.events.length, 1);
      assert.equal(page3.nextCursor, undefined); // No more events
    });

    test('returns empty for nonexistent session', async () => {
      const modules = await loadModules();
      const reader = new modules.TranscriptReader({ dataDir: tmpDir });

      const result = await reader.readEvents('nonexistent', 'thread-1', 'opus');
      assert.equal(result.events.length, 0);
      assert.equal(result.total, 0);
    });
  });

  describe('readDigest()', () => {
    test('reads extractive digest', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      const digest = await reader.readDigest('sess-abc', 'thread-1', 'opus');
      assert.ok(digest);
      assert.equal(digest.v, 1);
      assert.equal(digest.sessionId, 'sess-abc');
      assert.equal(digest.agentId, 'opus');
    });

    test('returns null for nonexistent digest', async () => {
      const modules = await loadModules();
      const reader = new modules.TranscriptReader({ dataDir: tmpDir });

      const digest = await reader.readDigest('nonexistent', 'thread-1', 'opus');
      assert.equal(digest, null);
    });
  });

  describe('search()', () => {
    test('finds events matching query', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      const hits = await reader.search('thread-1', 'opus');
      assert.ok(hits.length > 0, 'Should find at least one hit');
    });

    test('finds digest matching query', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      // The digest contains tool names like "Edit"
      const hits = await reader.search('thread-1', 'Edit', { scope: 'digests' });
      assert.ok(hits.length > 0);
      assert.equal(hits[0].kind, 'digest');
    });

    test('finds events matching query in transcripts scope', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      const hits = await reader.search('thread-1', 'Hello', { scope: 'transcripts' });
      assert.ok(hits.length > 0);
      assert.equal(hits[0].kind, 'event');
    });

    test('respects limit', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      const hits = await reader.search('thread-1', 'opus', { limit: 1 });
      assert.ok(hits.length <= 1);
    });

    test('returns empty for no match', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      const hits = await reader.search('thread-1', 'xyzzy_nonexistent_string');
      assert.equal(hits.length, 0);
    });

    test('filters by agentId', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      // Search for codex sessions (none exist)
      const hits = await reader.search('thread-1', 'opus', { cats: ['codex'] });
      assert.equal(hits.length, 0);
    });
  });

  describe('hasTranscript()', () => {
    test('returns true for existing transcript', async () => {
      const modules = await loadModules();
      const { reader } = await createFixtureSession(modules);

      const exists = await reader.hasTranscript('sess-abc', 'thread-1', 'opus');
      assert.equal(exists, true);
    });

    test('returns false for nonexistent transcript', async () => {
      const modules = await loadModules();
      const reader = new modules.TranscriptReader({ dataDir: tmpDir });

      const exists = await reader.hasTranscript('nonexistent', 'thread-1', 'opus');
      assert.equal(exists, false);
    });
  });
});
