/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F34: TtsRegistry tests
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { TtsRegistry } from '../dist/domains/agents/services/tts/TtsRegistry.js';

function mockProvider(id) {
  return {
    id,
    model: 'test-model',
    synthesize: async () => ({
      audio: new Uint8Array(0),
      format: 'wav',
      metadata: { provider: id, model: 'test-model', voice: 'test' },
    }),
  };
}

describe('TtsRegistry', () => {
  it('register + get works', () => {
    const reg = new TtsRegistry();
    const p = mockProvider('test-provider');
    reg.register(p);
    assert.strictEqual(reg.get('test-provider'), p);
  });

  it('has() returns true for registered, false for unregistered', () => {
    const reg = new TtsRegistry();
    reg.register(mockProvider('a'));
    assert.strictEqual(reg.has('a'), true);
    assert.strictEqual(reg.has('b'), false);
  });

  it('duplicate register throws', () => {
    const reg = new TtsRegistry();
    reg.register(mockProvider('dup'));
    assert.throws(() => reg.register(mockProvider('dup')), /already registered/);
  });

  it('get unknown throws with provider list', () => {
    const reg = new TtsRegistry();
    reg.register(mockProvider('p1'));
    assert.throws(() => reg.get('p2'), /not found.*p1/);
  });

  it('getDefault returns first registered provider', () => {
    const reg = new TtsRegistry();
    const first = mockProvider('first');
    reg.register(first);
    reg.register(mockProvider('second'));
    assert.strictEqual(reg.getDefault(), first);
  });

  it('getDefault throws when empty', () => {
    const reg = new TtsRegistry();
    assert.throws(() => reg.getDefault(), /No TTS providers/);
  });

  it('listIds returns all registered IDs', () => {
    const reg = new TtsRegistry();
    reg.register(mockProvider('a'));
    reg.register(mockProvider('b'));
    assert.deepStrictEqual(reg.listIds(), ['a', 'b']);
  });
});
