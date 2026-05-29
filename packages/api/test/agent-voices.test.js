/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F34: cat-voices.ts tests
 * Per-cat TTS voice configuration — mirrors cat-budgets.test.js pattern
 */

import assert from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { clearVoiceCache, getAllCatVoices, getCatVoice } from '../dist/config/office-claw-voices.js';

describe('getCatVoice', () => {
  beforeEach(() => {
    clearVoiceCache();
    delete process.env.CAT_OPUS_TTS_VOICE;
    delete process.env.CAT_CODEX_TTS_VOICE;
    delete process.env.CAT_GEMINI_TTS_VOICE;
  });

  afterEach(() => {
    delete process.env.CAT_OPUS_TTS_VOICE;
    delete process.env.CAT_CODEX_TTS_VOICE;
    delete process.env.CAT_GEMINI_TTS_VOICE;
    clearVoiceCache();
  });

  it('returns opus default voice', () => {
    const voice = getCatVoice('opus');
    assert.strictEqual(voice.voice, 'zm_yunjian');
    assert.strictEqual(voice.langCode, 'zh');
    assert.strictEqual(voice.speed, 1.0);
  });

  it('returns codex default voice', () => {
    const voice = getCatVoice('codex');
    assert.strictEqual(voice.voice, 'zm_yunjian');
    assert.strictEqual(voice.langCode, 'zh');
    assert.strictEqual(voice.speed, 1.0);
  });

  it('returns gemini default voice', () => {
    const voice = getCatVoice('gemini');
    assert.strictEqual(voice.voice, 'zm_yunjian');
    assert.strictEqual(voice.langCode, 'zh');
    assert.strictEqual(voice.speed, 1.0);
  });

  it('per-cat env var overrides voice ID', () => {
    process.env.CAT_OPUS_TTS_VOICE = 'custom_voice_id';
    clearVoiceCache();
    const voice = getCatVoice('opus');
    assert.strictEqual(voice.voice, 'custom_voice_id');
    // langCode and speed remain from default
    assert.strictEqual(voice.langCode, 'zh');
    assert.strictEqual(voice.speed, 1.0);
  });

  it('env var with whitespace is trimmed', () => {
    process.env.CAT_CODEX_TTS_VOICE = '  trimmed_voice  ';
    clearVoiceCache();
    const voice = getCatVoice('codex');
    assert.strictEqual(voice.voice, 'trimmed_voice');
  });

  it('empty env var is ignored', () => {
    process.env.CAT_OPUS_TTS_VOICE = '';
    clearVoiceCache();
    const voice = getCatVoice('opus');
    assert.strictEqual(voice.voice, 'zm_yunjian');
  });

  it('unknown cat falls back to global default', () => {
    const voice = getCatVoice('unknown-cat');
    assert.strictEqual(voice.voice, 'zm_yunjian');
    assert.strictEqual(voice.langCode, 'zh');
    assert.strictEqual(voice.speed, 1.0);
  });

  it('all voice configs have required fields', () => {
    const cats = ['opus', 'codex', 'gemini'];
    for (const cat of cats) {
      const voice = getCatVoice(cat);
      assert.ok(voice.voice, `${cat} has voice`);
      assert.ok(voice.langCode, `${cat} has langCode`);
      assert.ok(typeof voice.speed === 'number', `${cat} speed is number`);
    }
  });
});

describe('getAllCatVoices', () => {
  beforeEach(() => {
    clearVoiceCache();
    delete process.env.CAT_OPUS_TTS_VOICE;
    delete process.env.CAT_CODEX_TTS_VOICE;
    delete process.env.CAT_GEMINI_TTS_VOICE;
  });

  it('returns voices for all three cats', () => {
    const voices = getAllCatVoices();
    assert.ok(voices.opus, 'has opus');
    assert.ok(voices.codex, 'has codex');
    assert.ok(voices.gemini, 'has gemini');
  });
});

// F066: Clone field tests
describe('VoiceConfig clone fields', () => {
  beforeEach(() => {
    clearVoiceCache();
    delete process.env.CAT_OPUS_TTS_VOICE;
    delete process.env.CAT_CODEX_TTS_VOICE;
    delete process.env.CAT_GEMINI_TTS_VOICE;
  });

  afterEach(() => {
    clearVoiceCache();
  });

  it('opus voice has clone fields (refAudio, refText, instruct, temperature)', () => {
    const voice = getCatVoice('opus');
    assert.ok(voice.refAudio, 'opus has refAudio');
    assert.ok(voice.refAudio.includes('流浪者'), 'opus refAudio is Wanderer');
    assert.ok(voice.refText, 'opus has refText');
    assert.ok(voice.instruct, 'opus has instruct');
    assert.strictEqual(voice.temperature, 0.3);
  });

  it('codex voice has clone fields', () => {
    const voice = getCatVoice('codex');
    assert.ok(voice.refAudio, 'codex has refAudio');
    assert.ok(voice.refAudio.includes('魈'), 'codex refAudio is Xiao');
    assert.ok(voice.instruct?.includes('傲娇'), 'codex instruct matches character');
    assert.strictEqual(voice.temperature, 0.3);
  });

  it('gemini voice has clone fields', () => {
    const voice = getCatVoice('gemini');
    assert.ok(voice.refAudio, 'gemini has refAudio');
    assert.ok(voice.refAudio.includes('班尼特'), 'gemini refAudio is Bennett');
    assert.ok(voice.instruct?.includes('阳光'), 'gemini instruct matches character');
    assert.strictEqual(voice.temperature, 0.3);
  });

  it('env var override preserves clone fields', () => {
    process.env.CAT_OPUS_TTS_VOICE = 'custom_voice';
    clearVoiceCache();
    const voice = getCatVoice('opus');
    assert.strictEqual(voice.voice, 'custom_voice');
    // Clone fields still come from base config
    assert.ok(voice.refAudio, 'clone fields preserved after voice override');
    assert.strictEqual(voice.temperature, 0.3);
  });

  it('unknown cat fallback has no clone fields', () => {
    const voice = getCatVoice('unknown-cat');
    assert.strictEqual(voice.refAudio, undefined);
    assert.strictEqual(voice.instruct, undefined);
  });
});
