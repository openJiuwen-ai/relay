/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F34: MlxAudioTtsProvider tests
 * Mocks global fetch to test HTTP interaction with Python TTS server.
 */

import assert from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { MlxAudioTtsProvider } from '../dist/domains/agents/services/tts/MlxAudioTtsProvider.js';

describe('MlxAudioTtsProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('has correct id and model', () => {
    const p = new MlxAudioTtsProvider({ baseUrl: 'http://localhost:9999' });
    assert.strictEqual(p.id, 'mlx-audio');
    assert.strictEqual(p.model, 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16');
  });

  it('sends correct request body to TTS server', async () => {
    let capturedUrl;
    let capturedBody;
    globalThis.fetch = async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    };

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    await p.synthesize({ text: 'hello', voice: 'vm_test', langCode: 'en', speed: 1.5, format: 'wav' });

    assert.strictEqual(capturedUrl, 'http://test:9877/v1/audio/speech');
    assert.strictEqual(capturedBody.input, 'hello');
    assert.strictEqual(capturedBody.voice, 'vm_test');
    assert.strictEqual(capturedBody.response_format, 'wav');
    assert.strictEqual(capturedBody.speed, 1.5);
    assert.strictEqual(capturedBody.lang_code, 'en');
  });

  it('returns Uint8Array audio with correct metadata', async () => {
    const audioBytes = new Uint8Array([0, 1, 2, 3, 4]);
    globalThis.fetch = async () => new Response(audioBytes, { status: 200 });

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    const result = await p.synthesize({ text: 'test', voice: 'v1' });

    assert.ok(result.audio instanceof Uint8Array);
    assert.strictEqual(result.audio.length, 5);
    assert.strictEqual(result.format, 'wav');
    assert.strictEqual(result.metadata.provider, 'mlx-audio');
    assert.strictEqual(result.metadata.voice, 'v1');
  });

  it('throws on non-200 response', async () => {
    globalThis.fetch = async () => new Response('Internal Server Error', { status: 500 });

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    await assert.rejects(
      () => p.synthesize({ text: 'test', voice: 'v1' }),
      (err) => err.message.includes('500'),
    );
  });

  it('uses default langCode and speed when not provided', async () => {
    let capturedBody;
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(new Uint8Array(0), { status: 200 });
    };

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    await p.synthesize({ text: 'test', voice: 'v1' });

    assert.strictEqual(capturedBody.speed, 1.0);
    assert.strictEqual(capturedBody.lang_code, 'z');
    assert.strictEqual(capturedBody.response_format, 'wav');
  });

  // F066: Format contract tests — edge-tts returns mp3 when wav was requested
  it('respects x-audio-format header from server (edge-tts mp3 case)', async () => {
    const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00]); // fake mp3 header
    globalThis.fetch = async () =>
      new Response(mp3Bytes, {
        status: 200,
        headers: { 'x-audio-format': 'mp3' },
      });

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    const result = await p.synthesize({ text: 'test', voice: 'v1', format: 'wav' });

    // Provider must report the actual format from server, not the requested format
    assert.strictEqual(result.format, 'mp3', 'format should match server x-audio-format header');
    assert.ok(result.audio instanceof Uint8Array);
    assert.strictEqual(result.audio.length, 4);
  });

  it('falls back to requested format when x-audio-format header is absent', async () => {
    globalThis.fetch = async () => new Response(new Uint8Array([1, 2]), { status: 200 });

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    const result = await p.synthesize({ text: 'test', voice: 'v1', format: 'wav' });

    assert.strictEqual(result.format, 'wav', 'format should fall back to requested format');
  });

  // F066-R2: Security — malicious x-audio-format header must be rejected
  it('rejects malicious x-audio-format header (path traversal prevention)', async () => {
    globalThis.fetch = async () =>
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'x-audio-format': '../../../../etc/passwd' },
      });

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    const result = await p.synthesize({ text: 'test', voice: 'v1', format: 'wav' });

    // Must fall back to requested format, NOT use the malicious value
    assert.strictEqual(result.format, 'wav', 'malicious header must be rejected');
  });

  it('rejects unknown x-audio-format values', async () => {
    globalThis.fetch = async () =>
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'x-audio-format': 'ogg' },
      });

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    const result = await p.synthesize({ text: 'test', voice: 'v1', format: 'wav' });

    assert.strictEqual(result.format, 'wav', 'unknown format must fall back to requested');
  });

  // F066: Clone param passthrough tests
  it('sends clone params (refAudio, refText, instruct, temperature) to TTS server', async () => {
    let capturedBody;
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(new Uint8Array([1]), { status: 200 });
    };

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    await p.synthesize({
      text: '你好',
      voice: 'wanderer',
      langCode: 'zh',
      refAudio: '/path/to/ref.wav',
      refText: '参考文本',
      instruct: '用调皮的语气说话',
      temperature: 0.3,
    });

    assert.strictEqual(capturedBody.ref_audio, '/path/to/ref.wav');
    assert.strictEqual(capturedBody.ref_text, '参考文本');
    assert.strictEqual(capturedBody.instruct, '用调皮的语气说话');
    assert.strictEqual(capturedBody.temperature, 0.3);
  });

  it('omits clone params from body when not provided', async () => {
    let capturedBody;
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(new Uint8Array([1]), { status: 200 });
    };

    const p = new MlxAudioTtsProvider({ baseUrl: 'http://test:9877' });
    await p.synthesize({ text: 'test', voice: 'v1' });

    assert.strictEqual(capturedBody.ref_audio, undefined, 'ref_audio should be absent');
    assert.strictEqual(capturedBody.ref_text, undefined, 'ref_text should be absent');
    assert.strictEqual(capturedBody.instruct, undefined, 'instruct should be absent');
    // temperature is not sent when not provided
    assert.strictEqual(capturedBody.temperature, undefined, 'temperature should be absent');
  });
});
