/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mergeThinkingChunksTimeline } from '../src/task-run-accumulator.js';

describe('mergeThinkingChunksTimeline', () => {
  test('when new is append-only extension of old, returns new only (no duplicate prefix)', () => {
    const oldChunks = [{ timestamp: 1, text: 'The ' }];
    const newChunks = [
      { timestamp: 1, text: 'The ' },
      { timestamp: 2, text: 'user ' },
    ];
    const out = mergeThinkingChunksTimeline(oldChunks, newChunks);
    assert.deepEqual(out, newChunks);
  });

  test('many flushes: old holds full prefix, new is longer snapshot — no duplication', () => {
    const oldChunks = [
      { timestamp: 1, text: 'a' },
      { timestamp: 2, text: 'b' },
    ];
    const newChunks = [
      { timestamp: 1, text: 'a' },
      { timestamp: 2, text: 'b' },
      { timestamp: 3, text: 'c' },
    ];
    const out = mergeThinkingChunksTimeline(oldChunks, newChunks);
    assert.equal(out?.length, 3);
    assert.equal(out?.map((c) => c.text).join(''), 'abc');
  });

  test('non-prefix merge (e.g. interleaved timestamps) concatenates and sorts', () => {
    const oldChunks = [
      { timestamp: 2, text: 'b' },
      { timestamp: 4, text: 'd' },
    ];
    const newChunks = [
      { timestamp: 1, text: 'a' },
      { timestamp: 3, text: 'c' },
    ];
    const out = mergeThinkingChunksTimeline(oldChunks, newChunks);
    assert.equal(out?.map((c) => c.text).join(''), 'abcd');
  });

  test('fallback: concat + sort then drops consecutive identical (timestamp, text)', () => {
    const oldChunks = [{ timestamp: 2, text: 'b' }];
    const newChunks = [
      { timestamp: 1, text: 'a' },
      { timestamp: 1, text: 'a' },
      { timestamp: 3, text: 'c' },
    ];
    const out = mergeThinkingChunksTimeline(oldChunks, newChunks);
    assert.equal(out?.length, 3);
    assert.equal(out?.map((c) => c.text).join(''), 'abc');
  });
});
