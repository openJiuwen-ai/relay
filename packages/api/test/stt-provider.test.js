/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('SttRegistry', () => {
  it('registers and retrieves a provider', async () => {
    const { SttRegistry } = await import('../dist/infrastructure/connectors/media/SttRegistry.js');
    const registry = new SttRegistry();

    const mockProvider = {
      id: 'whisper-local',
      model: 'whisper-large-v3',
      async transcribe() {
        return { text: 'hello', metadata: { provider: 'whisper-local', model: 'whisper-large-v3' } };
      },
    };

    registry.register(mockProvider);
    assert.equal(registry.has('whisper-local'), true);
    assert.equal(registry.getDefault().id, 'whisper-local');
    assert.deepEqual(registry.listIds(), ['whisper-local']);
  });

  it('getDefault throws when empty', async () => {
    const { SttRegistry } = await import('../dist/infrastructure/connectors/media/SttRegistry.js');
    const registry = new SttRegistry();
    assert.throws(() => registry.getDefault(), /No STT providers registered/);
  });

  it('get throws for unknown provider', async () => {
    const { SttRegistry } = await import('../dist/infrastructure/connectors/media/SttRegistry.js');
    const registry = new SttRegistry();
    assert.throws(() => registry.get('nonexistent'), /STT provider 'nonexistent' not found/);
  });

  it('rejects duplicate registration', async () => {
    const { SttRegistry } = await import('../dist/infrastructure/connectors/media/SttRegistry.js');
    const registry = new SttRegistry();
    const provider = {
      id: 'dup',
      model: 'v1',
      async transcribe() {
        return { text: '', metadata: { provider: 'dup', model: 'v1' } };
      },
    };
    registry.register(provider);
    assert.throws(() => registry.register(provider), /already registered/);
  });
});
