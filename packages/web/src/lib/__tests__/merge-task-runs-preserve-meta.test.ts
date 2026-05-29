/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { mergeTaskRunsPreserveSegmentMeta } from '@openjiuwen/relay-shared';

describe('mergeTaskRunsPreserveSegmentMeta', () => {
  it('restores title from previous when incoming segment only has taskId', () => {
    const previous = {
      v: 1 as const,
      segments: [
        {
          taskId: 'skill_step:3',
          title: '生成华为风格PPT',
          taskIndex: 2,
          totalTasks: 6,
          thinking: '',
          toolEvents: [],
          text: '',
        },
      ],
    };
    const incoming = {
      v: 1 as const,
      segments: [
        {
          taskId: 'skill_step:3',
          thinking: 'more',
          toolEvents: [{ id: 't1', type: 'tool_use' as const, label: 'spawn', timestamp: 1 }],
          text: '',
        },
      ],
    };
    const out = mergeTaskRunsPreserveSegmentMeta(incoming, previous);
    expect(out.segments[0]?.title).toBe('生成华为风格PPT');
    expect(out.segments[0]?.taskIndex).toBe(2);
    expect(out.segments[0]?.totalTasks).toBe(6);
    expect(out.segments[0]?.thinking).toBe('more');
    expect(out.segments[0]?.toolEvents).toHaveLength(1);
  });

  it('keeps incoming title when present', () => {
    const previous = {
      v: 1 as const,
      segments: [{ taskId: 'a', title: 'Old', thinking: '', toolEvents: [], text: '' }],
    };
    const incoming = {
      v: 1 as const,
      segments: [{ taskId: 'a', title: 'New', thinking: '', toolEvents: [], text: '' }],
    };
    const out = mergeTaskRunsPreserveSegmentMeta(incoming, previous);
    expect(out.segments[0]?.title).toBe('New');
  });

  it('merges thinkingChunks from previous and incoming by timestamp', () => {
    const previous = {
      v: 1 as const,
      segments: [
        {
          taskId: 'x',
          thinking: '',
          thinkingChunks: [
            { timestamp: 2, text: 'b' },
            { timestamp: 4, text: 'd' },
          ],
          toolEvents: [],
          text: '',
        },
      ],
    };
    const incoming = {
      v: 1 as const,
      segments: [
        {
          taskId: 'x',
          thinking: '',
          thinkingChunks: [
            { timestamp: 1, text: 'a' },
            { timestamp: 3, text: 'c' },
          ],
          toolEvents: [],
          text: '',
        },
      ],
    };
    const out = mergeTaskRunsPreserveSegmentMeta(incoming, previous);
    expect(out.segments[0]?.thinkingChunks?.map((c) => c.text).join('')).toBe('abcd');
  });

  it('merges textChunks from previous and incoming by prefix rule', () => {
    const previous = {
      v: 1 as const,
      segments: [
        {
          taskId: 'y',
          thinking: '',
          textChunks: [{ timestamp: 1, text: 'a' }],
          toolEvents: [],
          text: 'a',
        },
      ],
    };
    const incoming = {
      v: 1 as const,
      segments: [
        {
          taskId: 'y',
          thinking: '',
          textChunks: [
            { timestamp: 1, text: 'a' },
            { timestamp: 2, text: 'b' },
          ],
          toolEvents: [],
          text: 'ab',
        },
      ],
    };
    const out = mergeTaskRunsPreserveSegmentMeta(incoming, previous);
    expect(out.segments[0]?.textChunks?.map((c) => c.text).join('')).toBe('ab');
  });

  it('preserves previous toolEvents when incoming segment has empty tools', () => {
    const previous = {
      v: 1 as const,
      segments: [
        {
          taskId: 't1',
          thinking: 'old think',
          toolEvents: [
            { id: 'u1', type: 'tool_use' as const, label: 'Read', timestamp: 1, toolCallId: 'c1' },
            {
              id: 'c1',
              type: 'tool_result' as const,
              label: 'result',
              detail: 'file body',
              timestamp: 2,
              toolCallId: 'c1',
            },
          ],
          text: '',
        },
      ],
    };
    const incoming = {
      v: 1 as const,
      segments: [
        {
          taskId: 't1',
          thinking: 'new think',
          toolEvents: [],
          text: '',
        },
      ],
    };
    const out = mergeTaskRunsPreserveSegmentMeta(incoming, previous);
    expect(out.segments[0]?.thinking).toBe('new think');
    expect(out.segments[0]?.toolEvents).toHaveLength(2);
    expect(out.segments[0]?.toolEvents[1]?.detail).toBe('file body');
  });

  it('keeps segments that exist only on previous', () => {
    const previous = {
      v: 1 as const,
      segments: [
        { taskId: 'gone', title: 'Done step', thinking: 'x', toolEvents: [], text: '' },
        { taskId: 'active', thinking: 'a', toolEvents: [], text: '' },
      ],
    };
    const incoming = {
      v: 1 as const,
      segments: [{ taskId: 'active', thinking: 'ab', toolEvents: [], text: '' }],
    };
    const out = mergeTaskRunsPreserveSegmentMeta(incoming, previous);
    expect(out.segments).toHaveLength(2);
    expect(out.segments.some((s) => s.taskId === 'gone' && s.title === 'Done step')).toBe(true);
    expect(out.segments.find((s) => s.taskId === 'active')?.thinking).toBe('ab');
  });
});
