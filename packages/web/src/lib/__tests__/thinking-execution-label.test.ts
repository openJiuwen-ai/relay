/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/stores/chat-types';
import { buildThinkingExecutionLabel, resolveThinkingExecutionDurationMs } from '@/lib/thinking-execution-label';

function baseAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    type: 'assistant',
    agentId: 'assistant',
    content: 'hello',
    timestamp: 1_700_000_000_000,
    origin: 'stream',
    ...overrides,
  };
}

describe('resolveThinkingExecutionDurationMs', () => {
  it('prefers extra.stream.durationMs when present (done)', () => {
    const msg = baseAssistantMessage({
      extra: { stream: { invocationId: 'inv-a', durationMs: 12_345 } },
    });
    expect(resolveThinkingExecutionDurationMs(msg, 'done', { invocationId: 'inv-other' }, undefined)).toBe(12_345);
  });

  it('falls back to tool span when invocation id no longer matches store', () => {
    const msg = baseAssistantMessage({
      extra: { stream: { invocationId: 'inv-old' } },
      toolEvents: [
        { id: 't1', type: 'tool_use', label: 'Read', timestamp: 1_700_000_001_000 },
        { id: 't2', type: 'tool_result', label: '', timestamp: 1_700_000_005_000 },
      ],
    });
    const d = resolveThinkingExecutionDurationMs(msg, 'done', { invocationId: 'inv-new' }, undefined);
    expect(d).toBe(4000);
  });
});

describe('buildThinkingExecutionLabel', () => {
  it('shows interrupted label without completion stats', () => {
    const msg = baseAssistantMessage({ extra: { stream: { invocationId: 'x', userStopped: true } } });
    const label = buildThinkingExecutionLabel(msg, 'interrupted', { invocationId: 'x' }, undefined);
    expect(label).toBe('已停止思考执行');
  });

  it('omits duration clause when resolved duration is 0', () => {
    const msg = baseAssistantMessage({ extra: { stream: { invocationId: 'x' } } });
    const label = buildThinkingExecutionLabel(msg, 'done', { invocationId: 'x' }, undefined);
    expect(label).toBe('思考执行完成（已调用0个工具）');
    expect(label).not.toContain('0ms');
  });
});
