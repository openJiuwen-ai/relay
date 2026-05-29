/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F097: toCliEvents adapter — label cleaning + primary arg extraction
 */
import { describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/stores/chat-types';
import { toCliEvents } from '../cli-output/toCliEvents';

describe('toCliEvents', () => {
  it('strips "agentId → " prefix from tool_use labels', () => {
    const toolEvents: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'opus → Read', timestamp: 1000 },
      { id: 't2', type: 'tool_use', label: 'codex → Bash', timestamp: 2000 },
    ];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe('Read');
    expect(events[1].label).toBe('Bash');
  });

  it('extracts primary arg from tool_use detail JSON', () => {
    const toolEvents: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'opus → Read', detail: '{"file_path":"src/index.ts"}', timestamp: 1000 },
      { id: 't2', type: 'tool_use', label: 'opus → Bash', detail: '{"command":"pnpm test"}', timestamp: 2000 },
      {
        id: 't3',
        type: 'tool_use',
        label: 'opus → Grep',
        detail: '{"pattern":"CliOutput","glob":"**/*.ts"}',
        timestamp: 3000,
      },
    ];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe('Read src/index.ts');
    expect(events[1].label).toBe('Bash pnpm test');
    expect(events[2].label).toBe('Grep CliOutput');
  });

  it('truncates long primary args at 60 chars', () => {
    const longPath = 'a'.repeat(80);
    const toolEvents: ToolEvent[] = [
      {
        id: 't1',
        type: 'tool_use',
        label: 'opus → Read',
        detail: JSON.stringify({ file_path: longPath }),
        timestamp: 1000,
      },
    ];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe(`Read ${'a'.repeat(57)}...`);
  });

  it('handles labels without arrow prefix (already clean)', () => {
    const toolEvents: ToolEvent[] = [{ id: 't1', type: 'tool_use', label: 'Read foo.ts', timestamp: 1000 }];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe('Read foo.ts');
  });

  it('handles tool_use without detail', () => {
    const toolEvents: ToolEvent[] = [{ id: 't1', type: 'tool_use', label: 'opus → Agent', timestamp: 1000 }];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe('Agent');
  });

  it('handles non-JSON detail gracefully', () => {
    const toolEvents: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'opus → Bash', detail: 'not json', timestamp: 1000 },
    ];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe('Bash');
    expect(events[0].detail).toBe('not json');
  });

  it('preserves tool_result events', () => {
    const toolEvents: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'opus → Read', timestamp: 1000 },
      { id: 'r1', type: 'tool_result', label: 'opus ← result', detail: 'file contents...', timestamp: 2000 },
    ];
    const events = toCliEvents(toolEvents, undefined);
    expect(events).toHaveLength(2);
    expect(events[1].kind).toBe('tool_result');
    expect(events[1].detail).toBe('file contents...');
  });

  it('appends streamContent as text event', () => {
    const events = toCliEvents([], 'All tests passing.\nRefactoring...');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('text');
    expect(events[0].content).toBe('All tests passing.\nRefactoring...');
  });

  it('skips empty streamContent', () => {
    const events = toCliEvents([], '   ');
    expect(events).toHaveLength(0);
  });

  it('extracts file_path from truncated JSON via regex fallback', () => {
    // safeJsonPreview truncates at 200 chars — Edit tool has long old_string/new_string
    const truncatedDetail =
      '{"file_path":"src/components/ChatMessage.tsx","old_string":"some long code that gets trunca';
    const toolEvents: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'opus → Edit', detail: truncatedDetail, timestamp: 1000 },
    ];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe('Edit src/components/ChatMessage.tsx');
  });

  it('extracts command from truncated JSON via regex fallback', () => {
    const truncatedDetail =
      '{"command":"pnpm --filter @openjiuwen/relay-web test","timeout":60000,"some_other_field":"this gets trunca';
    const toolEvents: ToolEvent[] = [
      { id: 't1', type: 'tool_use', label: 'opus → Bash', detail: truncatedDetail, timestamp: 1000 },
    ];
    const events = toCliEvents(toolEvents, undefined);
    expect(events[0].label).toBe('Bash pnpm --filter @openjiuwen/relay-web test');
  });

  it('does not append synthetic tool_result by default when tool_use has no result', () => {
    const toolEvents: ToolEvent[] = [{ id: 't1', type: 'tool_use', label: 'opus → Search', timestamp: 1000 }];
    const events = toCliEvents(toolEvents, undefined);
    expect(events.filter((e) => e.kind === 'tool_result')).toHaveLength(0);
  });

  it('appends synthetic tool_result when padUnmatchedToolResults is set', () => {
    const toolEvents: ToolEvent[] = [{ id: 't1', type: 'tool_use', label: 'opus → Search', timestamp: 1000 }];
    const events = toCliEvents(toolEvents, undefined, { padUnmatchedToolResults: true });
    expect(events.filter((e) => e.kind === 'tool_use')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'tool_result')).toHaveLength(1);
    const pad = events.find((e) => e.kind === 'tool_result');
    expect(pad?.id).toBe('pad-tool-result-t1');
    expect(pad?.toolCallId).toBeUndefined();
  });

  it('pads only unmatched tool_use when some results exist (index pairing)', () => {
    const toolEvents: ToolEvent[] = [
      { id: 'u1', type: 'tool_use', label: 'a → One', timestamp: 1 },
      { id: 'u2', type: 'tool_use', label: 'a → Two', timestamp: 2 },
      { id: 'r1', type: 'tool_result', label: '', detail: 'ok', timestamp: 3 },
    ];
    const events = toCliEvents(toolEvents, undefined, { padUnmatchedToolResults: true });
    expect(events.filter((e) => e.kind === 'tool_result')).toHaveLength(2);
    expect(events.some((e) => e.kind === 'tool_result' && e.id === 'pad-tool-result-u2')).toBe(true);
  });
});
