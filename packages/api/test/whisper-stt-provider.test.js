/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, mock } from 'node:test';

describe('WhisperSttProvider', () => {
  it('sends audio file to Whisper API and returns transcript', async () => {
    const { WhisperSttProvider } = await import('../dist/infrastructure/connectors/media/WhisperSttProvider.js');

    const tempDir = await mkdtemp(path.join(tmpdir(), 'whisper-test-'));
    const audioPath = path.join(tempDir, 'test.wav');
    await writeFile(audioPath, Buffer.from('fake-audio'));

    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ text: '你好世界', duration: 2.5 }),
      text: async () => '',
    }));

    const provider = new WhisperSttProvider({
      baseUrl: 'http://localhost:9876',
      _fetchFn: mockFetch,
    });

    assert.equal(provider.id, 'whisper-local');

    const result = await provider.transcribe({ audioPath });

    assert.equal(result.text, '你好世界');
    assert.equal(result.durationSec, 2.5);
    assert.equal(result.metadata.provider, 'whisper-local');
    assert.equal(mockFetch.mock.calls.length, 1);

    const [url, opts] = mockFetch.mock.calls[0].arguments;
    assert.equal(url, 'http://localhost:9876/v1/audio/transcriptions');
    assert.equal(opts.method, 'POST');

    await rm(tempDir, { recursive: true });
  });

  it('throws on non-ok response', async () => {
    const { WhisperSttProvider } = await import('../dist/infrastructure/connectors/media/WhisperSttProvider.js');

    const tempDir = await mkdtemp(path.join(tmpdir(), 'whisper-test-'));
    const audioPath = path.join(tempDir, 'test.wav');
    await writeFile(audioPath, Buffer.from('fake-audio'));

    const provider = new WhisperSttProvider({
      baseUrl: 'http://localhost:9876',
      _fetchFn: async () => ({ ok: false, status: 500, text: async () => 'internal error', json: async () => ({}) }),
    });

    await assert.rejects(() => provider.transcribe({ audioPath }), /STT request failed.*500/);

    await rm(tempDir, { recursive: true });
  });

  it('passes language parameter when provided', async () => {
    const { WhisperSttProvider } = await import('../dist/infrastructure/connectors/media/WhisperSttProvider.js');

    const tempDir = await mkdtemp(path.join(tmpdir(), 'whisper-test-'));
    const audioPath = path.join(tempDir, 'test.ogg');
    await writeFile(audioPath, Buffer.from('fake-audio'));

    let capturedBody = null;
    const mockFetch = mock.fn(async (_url, opts) => {
      capturedBody = opts.body;
      return { ok: true, json: async () => ({ text: 'hello' }), text: async () => '' };
    });

    const provider = new WhisperSttProvider({
      baseUrl: 'http://test:9876',
      _fetchFn: mockFetch,
    });

    await provider.transcribe({ audioPath, language: 'zh' });

    // FormData should contain language field
    assert.ok(capturedBody instanceof FormData);
    assert.equal(capturedBody.get('language'), 'zh');

    await rm(tempDir, { recursive: true });
  });
});
