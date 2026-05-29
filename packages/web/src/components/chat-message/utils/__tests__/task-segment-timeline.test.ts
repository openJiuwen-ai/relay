/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import type { CliEvent } from '@/stores/chat-types';
import { buildTaskSegmentTimeline, splitCliEventsIntoToolRuns } from '../task-segment-timeline';

const toolUse = (id: string, ts: number): CliEvent => ({
  id,
  kind: 'tool_use',
  timestamp: ts,
  label: id,
});

const toolResult = (id: string, ts: number): CliEvent => ({
  id,
  kind: 'tool_result',
  timestamp: ts,
  label: id,
});

describe('splitCliEventsIntoToolRuns', () => {
  it('groups each tool_use with following non-tool_use events into one run', () => {
    const events: CliEvent[] = [
      toolUse('a', 10),
      toolResult('ar', 11),
      toolUse('b', 20),
      toolResult('br', 21),
    ];
    const runs = splitCliEventsIntoToolRuns(events);
    expect(runs).toHaveLength(2);
    expect(runs[0]?.map((e) => e.id)).toEqual(['a', 'ar']);
    expect(runs[1]?.map((e) => e.id)).toEqual(['b', 'br']);
  });
});

describe('buildTaskSegmentTimeline', () => {
  it('interleaves thinking chunks and tool runs by timestamp', () => {
    const seg = {
      taskId: 't1',
      thinking: 'ab',
      thinkingChunks: [
        { timestamp: 5, text: 'a' },
        { timestamp: 15, text: 'b' },
      ],
      toolEvents: [],
      text: '',
    };
    const cli: CliEvent[] = [toolUse('u1', 10), toolResult('r1', 12)];
    const tl = buildTaskSegmentTimeline(seg, cli, 1);
    expect(tl.map((e) => e.kind)).toEqual(['thinking', 'tools', 'thinking']);
    expect(tl[0]).toMatchObject({ kind: 'thinking', content: 'a' });
    expect(tl[2]).toMatchObject({ kind: 'thinking', content: 'b' });
  });

  it('falls back to single thinking blob before tools when no chunks', () => {
    const seg = {
      taskId: 't2',
      thinking: 'only',
      toolEvents: [],
      text: '',
    };
    const cli: CliEvent[] = [toolUse('u', 100)];
    const tl = buildTaskSegmentTimeline(seg, cli, 50);
    expect(tl).toHaveLength(2);
    expect(tl[0]).toMatchObject({ kind: 'thinking', ts: 99 });
    expect(tl[1]?.kind).toBe('tools');
  });

  it('merges consecutive tool runs into one block when no thinking between', () => {
    const seg = {
      taskId: 't3',
      thinking: 'x',
      toolEvents: [],
      text: '',
    };
    const cli: CliEvent[] = [toolUse('u1', 10), toolResult('r1', 11), toolUse('u2', 12), toolResult('r2', 13)];
    const tl = buildTaskSegmentTimeline(seg, cli, 1);
    expect(tl).toHaveLength(2);
    expect(tl[0]?.kind).toBe('thinking');
    expect(tl[1]?.kind === 'tools' && tl[1].events.map((e) => e.id)).toEqual(['u1', 'r1', 'u2', 'r2']);
  });

  it('merges consecutive thinking chunks into one paragraph block (streaming tokens)', () => {
    const seg = {
      taskId: 't4',
      thinking: 'The user wants',
      thinkingChunks: [
        { timestamp: 1, text: 'The ' },
        { timestamp: 2, text: 'user ' },
        { timestamp: 3, text: 'wants' },
      ],
      toolEvents: [],
      text: '',
    };
    const tl = buildTaskSegmentTimeline(seg, [], 0);
    expect(tl).toHaveLength(1);
    expect(tl[0]).toMatchObject({ kind: 'thinking', content: 'The user wants' });
  });

  it('merges consecutive thinking chunks before tools into one block', () => {
    const seg = {
      taskId: 't5',
      thinking: 'ab',
      thinkingChunks: [
        { timestamp: 1, text: 'a' },
        { timestamp: 2, text: 'b' },
      ],
      toolEvents: [],
      text: '',
    };
    const cli: CliEvent[] = [toolUse('u', 10)];
    const tl = buildTaskSegmentTimeline(seg, cli, 0);
    expect(tl.map((e) => e.kind)).toEqual(['thinking', 'tools']);
    expect(tl[0]).toMatchObject({ kind: 'thinking', content: 'ab' });
  });

  it('interleaves streamText chunks with thinking and tools by timestamp', () => {
    const seg = {
      taskId: 't6',
      thinking: '',
      thinkingChunks: [{ timestamp: 4, text: 'think' }],
      textChunks: [
        { timestamp: 8, text: 'Hello' },
        { timestamp: 9, text: ' world' },
      ],
      toolEvents: [],
      text: '',
    };
    const cli: CliEvent[] = [toolUse('u', 12), toolResult('r', 13)];
    const tl = buildTaskSegmentTimeline(seg, cli, 0);
    expect(tl.map((e) => e.kind)).toEqual(['thinking', 'streamText', 'tools']);
  });
});
