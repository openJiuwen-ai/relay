/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { mergeStreams } = await import('../dist/domains/agents/services/agents/invocation/stream-merge.js');

/** Create an async iterable that yields values with optional delays */
async function* delayed(values, delayMs = 0) {
  for (const v of values) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    yield v;
  }
}

/** Create an async iterable that yields then throws */
async function* failAfter(values, error) {
  for (const v of values) yield v;
  throw error;
}

/** Collect all values from an async iterable */
async function collect(iterable) {
  const results = [];
  for await (const v of iterable) results.push(v);
  return results;
}

describe('mergeStreams', () => {
  it('merges two streams', async () => {
    const a = delayed([1, 2, 3]);
    const b = delayed([4, 5, 6]);
    const result = await collect(mergeStreams([a, b]));
    assert.equal(result.length, 6);
    // All values present
    assert.deepEqual(result.sort(), [1, 2, 3, 4, 5, 6]);
  });

  it('handles one stream finishing before another', async () => {
    const short = delayed([1]);
    const long = delayed([2, 3, 4]);
    const result = await collect(mergeStreams([short, long]));
    assert.equal(result.length, 4);
    assert.deepEqual(result.sort(), [1, 2, 3, 4]);
  });

  it('one stream errors, other continues', async () => {
    const good = delayed([1, 2, 3]);
    const bad = failAfter([4], new Error('boom'));
    const errors = [];
    const result = await collect(mergeStreams([good, bad], (idx, err) => errors.push({ idx, err })));
    // Good stream's values present
    assert.ok(result.includes(1));
    assert.ok(result.includes(2));
    assert.ok(result.includes(3));
    // Bad stream yielded 4 before error
    assert.ok(result.includes(4));
    // Error was reported
    assert.equal(errors.length, 1);
    assert.equal(errors[0].idx, 1);
  });

  it('handles empty streams array', async () => {
    const result = await collect(mergeStreams([]));
    assert.deepEqual(result, []);
  });

  it('handles single stream', async () => {
    const result = await collect(mergeStreams([delayed([1, 2, 3])]));
    assert.deepEqual(result, [1, 2, 3]);
  });

  it('handles all streams erroring', async () => {
    const a = failAfter([], new Error('a'));
    const b = failAfter([], new Error('b'));
    const errors = [];
    const result = await collect(mergeStreams([a, b], (idx, err) => errors.push({ idx, err })));
    assert.deepEqual(result, []);
    assert.equal(errors.length, 2);
  });

  it('handles many values', async () => {
    const a = delayed(Array.from({ length: 100 }, (_, i) => `a${i}`));
    const b = delayed(Array.from({ length: 100 }, (_, i) => `b${i}`));
    const result = await collect(mergeStreams([a, b]));
    assert.equal(result.length, 200);
  });

  it('three streams merge correctly', async () => {
    const a = delayed([1, 2]);
    const b = delayed([3, 4]);
    const c = delayed([5, 6]);
    const result = await collect(mergeStreams([a, b, c]));
    assert.equal(result.length, 6);
    assert.deepEqual(result.sort(), [1, 2, 3, 4, 5, 6]);
  });
});
