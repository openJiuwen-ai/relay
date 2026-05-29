/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('ReflectionService', () => {
  it('reflect returns result from backend', async () => {
    const { ReflectionService } = await import('../../dist/domains/memory/ReflectionService.js');

    const mockBackend = async (_query) => 'This is a reflection about prompt engineering.';
    const service = new ReflectionService(mockBackend);

    const result = await service.reflect('prompt engineering');
    assert.equal(result, 'This is a reflection about prompt engineering.');
  });

  it('reflect passes context to backend', async () => {
    const { ReflectionService } = await import('../../dist/domains/memory/ReflectionService.js');

    let capturedContext;
    const mockBackend = async (_query, context) => {
      capturedContext = context;
      return 'ok';
    };
    const service = new ReflectionService(mockBackend);

    await service.reflect('test', { threadId: 'thread_123', agentId: 'opus' });
    assert.deepEqual(capturedContext, { threadId: 'thread_123', agentId: 'opus' });
  });

  it('reflect returns empty string when backend fails', async () => {
    const { ReflectionService } = await import('../../dist/domains/memory/ReflectionService.js');

    const failingBackend = async () => {
      throw new Error('connection refused');
    };
    const service = new ReflectionService(failingBackend);

    const result = await service.reflect('anything');
    assert.equal(result, '');
  });
});
