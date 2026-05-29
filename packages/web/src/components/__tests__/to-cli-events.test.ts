/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F097: toCliEvents adapter — converts ToolEvent[] + stream content → CliEvent[]
 */
import { describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/stores/chat-types';
import { toCliEvents } from '../cli-output/toCliEvents';

describe('toCliEvents', () => {
  it('converts toolEvents to CliEvent[]', () => {
    const tools: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'Read index.ts', timestamp: 1000 },
      { id: 't2', type: 'tool_result', label: 'Read index.ts', detail: 'ok', timestamp: 1001 },
    ];
    const result = toCliEvents(tools, undefined);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 't1', kind: 'tool_use', label: 'Read index.ts' });
    expect(result[1]).toMatchObject({ id: 't2', kind: 'tool_result', detail: 'ok' });
  });

  it('appends stream content as text event', () => {
    const tools: ToolEvent[] = [{ id: 't1', type: 'tool_use', label: 'Bash pnpm test', timestamp: 1000 }];
    const result = toCliEvents(tools, 'All tests passed.');
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ kind: 'text', content: 'All tests passed.' });
  });

  it('returns empty array when no tools and no content', () => {
    expect(toCliEvents([], undefined)).toEqual([]);
    expect(toCliEvents(undefined, undefined)).toEqual([]);
  });

  it('returns text-only event when no tools but has content', () => {
    const result = toCliEvents([], 'stdout only');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'text', content: 'stdout only' });
  });

  it('deduplicates tool count (only tool_use events)', () => {
    const tools: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'Read foo.ts', timestamp: 1000 },
      { id: 't2', type: 'tool_result', label: 'Read foo.ts', detail: 'ok', timestamp: 1001 },
      { id: 't3', type: 'tool_use', label: 'Edit bar.ts', timestamp: 1002 },
      { id: 't4', type: 'tool_result', label: 'Edit bar.ts', detail: 'ok', timestamp: 1003 },
    ];
    const result = toCliEvents(tools, undefined);
    const toolUseCount = result.filter((e) => e.kind === 'tool_use').length;
    expect(toolUseCount).toBe(2);
    expect(result).toHaveLength(4);
  });
});
