/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';

describe('computeScrollRecomputeSignal', () => {
  it('changes when last message content grows without changing messages.length (streaming)', async () => {
    const { computeScrollRecomputeSignal } = await import('@/utils/scrollRecomputeSignal');

    const base = computeScrollRecomputeSignal('t1', [
      { id: 'm1', type: 'assistant', content: 'hi', timestamp: 1 },
    ] as never);
    const grown = computeScrollRecomputeSignal('t1', [
      { id: 'm1', type: 'assistant', content: 'hi there', timestamp: 1 },
    ] as never);

    expect(grown).not.toBe(base);
  });

  it('changes when threadId changes even if messages are identical', async () => {
    const { computeScrollRecomputeSignal } = await import('@/utils/scrollRecomputeSignal');

    const a = computeScrollRecomputeSignal('t1', [
      { id: 'm1', type: 'assistant', content: 'x', timestamp: 1 },
    ] as never);
    const b = computeScrollRecomputeSignal('t2', [
      { id: 'm1', type: 'assistant', content: 'x', timestamp: 1 },
    ] as never);

    expect(b).not.toBe(a);
  });

  it('changes when rich blocks append without content/toolEvents changes (cloud P2)', async () => {
    const { computeScrollRecomputeSignal } = await import('@/utils/scrollRecomputeSignal');

    const base = computeScrollRecomputeSignal('t1', [
      { id: 'm1', type: 'assistant', content: 'x', timestamp: 1, extra: { rich: { v: 1, blocks: [] } } },
    ] as never);
    const grown = computeScrollRecomputeSignal('t1', [
      {
        id: 'm1',
        type: 'assistant',
        content: 'x',
        timestamp: 1,
        extra: { rich: { v: 1, blocks: [{ kind: 'card', v: 1, id: 'b1' }] } },
      },
    ] as never);

    expect(grown).not.toBe(base);
  });

  it('changes when UI expansion state changes without message changes (cloud P2)', async () => {
    const { computeScrollRecomputeSignal } = await import('@/utils/scrollRecomputeSignal');

    const msgs = [{ id: 'm1', type: 'assistant', content: 'x', timestamp: 1 }] as never;
    const collapsed = computeScrollRecomputeSignal('t1', msgs, 0);
    const expanded = computeScrollRecomputeSignal('t1', msgs, 1);

    expect(expanded).not.toBe(collapsed);
  });
});
