/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F8: Token usage integration tests
 * Verifies that setAgentInvocation correctly stores and merges TokenUsage data,
 * simulating what useAgentMessages does when receiving invocation_usage events.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '@/stores/chatStore';

describe('F8: chatStore token usage', () => {
  beforeEach(() => {
    useChatStore.getState().clearMessages();
    useChatStore.getState().clearAgentStatuses();
  });

  it('setAgentInvocation stores usage data for a cat', () => {
    const store = useChatStore.getState();
    store.setAgentInvocation('opus', {
      usage: { inputTokens: 1000, outputTokens: 500, costUsd: 0.03 },
    });

    const info = useChatStore.getState().agentInvocations.opus;
    expect(info).toBeDefined();
    expect(info?.usage).toEqual({
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.03,
    });
  });

  it('setAgentInvocation merges usage with existing invocation info', () => {
    const store = useChatStore.getState();

    // First: session_started metrics
    store.setAgentInvocation('opus', {
      sessionId: 'sess-1',
      invocationId: 'inv-1',
      startedAt: 1000,
    });

    // Second: invocation_complete metrics
    store.setAgentInvocation('opus', {
      durationMs: 4500,
    });

    // Third: invocation_usage
    store.setAgentInvocation('opus', {
      usage: { inputTokens: 2000, outputTokens: 800, cacheReadTokens: 1500 },
    });

    const info = useChatStore.getState().agentInvocations.opus;
    expect(info).toBeDefined();
    expect(info?.sessionId).toBe('sess-1');
    expect(info?.invocationId).toBe('inv-1');
    expect(info?.startedAt).toBe(1000);
    expect(info?.durationMs).toBe(4500);
    expect(info?.usage).toEqual({
      inputTokens: 2000,
      outputTokens: 800,
      cacheReadTokens: 1500,
    });
  });

  it('setMessageUsage persists usage on a specific message metadata', () => {
    const store = useChatStore.getState();
    store.addMessage({
      id: 'msg-1',
      type: 'assistant',
      agentId: 'opus',
      content: 'hello',
      timestamp: 1000,
      metadata: { provider: 'anthropic', model: 'claude-opus-4-6' },
    });
    store.addMessage({
      id: 'msg-2',
      type: 'assistant',
      agentId: 'opus',
      content: 'world',
      timestamp: 2000,
      metadata: { provider: 'anthropic', model: 'claude-opus-4-6' },
    });

    // Set usage on msg-1 only
    store.setMessageUsage('msg-1', { inputTokens: 1000, outputTokens: 500 });

    const msgs = useChatStore.getState().messages;
    expect(msgs[0].metadata?.usage).toEqual({ inputTokens: 1000, outputTokens: 500 });
    // msg-2 should NOT have usage
    expect(msgs[1].metadata?.usage).toBeUndefined();
  });

  it('stores usage for multiple cats independently', () => {
    const store = useChatStore.getState();

    store.setAgentInvocation('opus', {
      usage: { inputTokens: 1000, outputTokens: 500, costUsd: 0.03 },
    });
    store.setAgentInvocation('codex', {
      usage: { inputTokens: 200, outputTokens: 100, cacheReadTokens: 50 },
    });
    store.setAgentInvocation('gemini', {
      usage: { totalTokens: 150 },
    });

    const state = useChatStore.getState();
    expect(state.agentInvocations.opus?.usage?.costUsd).toBe(0.03);
    expect(state.agentInvocations.codex?.usage?.inputTokens).toBe(200);
    expect(state.agentInvocations.gemini?.usage?.totalTokens).toBe(150);
  });
});
