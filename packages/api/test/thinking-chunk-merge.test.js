/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('appendThinkingChunk', () => {
  it('uses paragraph separators for non-streaming thinking blocks', async () => {
    const { appendThinkingChunk } = await import('../dist/domains/agents/services/agents/routing/thinking-chunk-merge.js');
    assert.equal(appendThinkingChunk('step one', 'step two'), 'step one\n\nstep two');
  });

  it('concatenates streaming thinking chunks when mergeStrategy=append', async () => {
    const { appendThinkingChunk } = await import('../dist/domains/agents/services/agents/routing/thinking-chunk-merge.js');
    let thinking = '';
    thinking = appendThinkingChunk(thinking, 'The', 'append');
    thinking = appendThinkingChunk(thinking, ' user', 'append');
    thinking = appendThinkingChunk(thinking, ' asked.', 'append');
    assert.equal(thinking, 'The user asked.');
  });

  it('keeps existing text when the next chunk is empty', async () => {
    const { appendThinkingChunk } = await import('../dist/domains/agents/services/agents/routing/thinking-chunk-merge.js');
    assert.equal(appendThinkingChunk('ready', ''), 'ready');
  });
});
