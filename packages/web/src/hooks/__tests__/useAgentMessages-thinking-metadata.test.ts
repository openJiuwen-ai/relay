/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F045 P1 regression: thinking-first placeholder must receive metadata from subsequent text chunks.
 *
 * Sequence under test (foreground active thread):
 *   1. system_info(thinking) → creates placeholder assistant bubble (no metadata)
 *   2. text(with metadata) → appends content + merges metadata onto placeholder
 *   3. system_info(invocation_usage) → sets usage inside metadata
 *
 * Bug: Before the fix, step 2 only called appendToMessage (content-only),
 * so the placeholder never got metadata, and step 3's setMessageUsage no-op'd.
 *
 * Uses real useChatStore (no mocks) to verify store state transitions.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { TokenUsage } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';

const THREAD_ID = 'thread-active';
const CAT_ID = 'opus';
const MSG_ID = 'msg-thinking-test';

describe('F045: thinking-first placeholder metadata flow', () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isLoading: false,
      isLoadingHistory: false,
      hasMore: true,
      hasActiveInvocation: false,
      intentMode: null,
      targetAgents: [],
      agentStatuses: {},
      agentInvocations: {},
      currentGame: null,

      threadStates: {},
      viewMode: 'single',
      splitPaneThreadIds: [],
      splitPaneTargetId: null,
      currentThreadId: THREAD_ID,
      currentProjectPath: 'default',
      threads: [],
      isLoadingThreads: false,
    });
  });

  it('RED→GREEN: metadata and usage survive the thinking→text→usage sequence', () => {
    const store = useChatStore.getState();

    // Step 1: thinking creates placeholder (metadata may be present if msg carries it;
    // this test covers the worst case where it's absent)
    store.addMessage({
      id: MSG_ID,
      type: 'assistant',
      agentId: CAT_ID,
      content: '',
      origin: 'stream',
      timestamp: Date.now(),
      isStreaming: true,
    });
    store.setMessageThinking(MSG_ID, 'I am planning my response...');

    // Verify: placeholder has thinking but no metadata
    const afterThinking = useChatStore.getState().messages.find((m) => m.id === MSG_ID)!;
    expect(afterThinking.thinking).toBe('I am planning my response...');
    expect(afterThinking.metadata).toBeUndefined();

    // Step 2: text chunk arrives with metadata → merge onto placeholder
    const metadata = { provider: 'anthropic', model: 'claude-opus-4-5-20250514' };
    store.appendToMessage(MSG_ID, 'Hello, I am responding.');
    store.setMessageMetadata(MSG_ID, metadata);

    // Verify: metadata is now present
    const afterText = useChatStore.getState().messages.find((m) => m.id === MSG_ID)!;
    expect(afterText.content).toBe('Hello, I am responding.');
    expect(afterText.metadata).toBeDefined();
    expect(afterText.metadata?.provider).toBe('anthropic');

    // Step 3: invocation_usage arrives → setMessageUsage should succeed (not no-op)
    const usage: TokenUsage = { inputTokens: 100, outputTokens: 50 };
    store.setMessageUsage(MSG_ID, usage);

    // Verify: usage is set inside metadata
    const afterUsage = useChatStore.getState().messages.find((m) => m.id === MSG_ID)!;
    expect(afterUsage.metadata).toBeDefined();
    expect(afterUsage.metadata?.usage).toEqual(usage);
  });

  it('setMessageMetadata skips when metadata already exists (streaming perf guard)', () => {
    const store = useChatStore.getState();

    store.addMessage({
      id: MSG_ID,
      type: 'assistant',
      agentId: CAT_ID,
      content: 'hi',
      origin: 'stream',
      metadata: { provider: 'anthropic', model: 'claude-opus-4-5-20250514' },
      timestamp: Date.now(),
    });

    // Second call should be a no-op (guard prevents per-chunk re-render)
    store.setMessageMetadata(MSG_ID, { provider: 'openai', model: 'gpt-4' });

    const msg = useChatStore.getState().messages.find((m) => m.id === MSG_ID)!;
    // Original metadata preserved, not overwritten
    expect(msg.metadata?.provider).toBe('anthropic');
    expect(msg.metadata?.model).toBe('claude-opus-4-5-20250514');
  });

  it('setMessageMetadata is idempotent (same metadata applied twice produces same state)', () => {
    const store = useChatStore.getState();
    const metadata = { provider: 'anthropic', model: 'claude-opus-4-5-20250514' };

    store.addMessage({
      id: MSG_ID,
      type: 'assistant',
      agentId: CAT_ID,
      content: '',
      origin: 'stream',
      timestamp: Date.now(),
    });

    store.setMessageMetadata(MSG_ID, metadata);
    const after1 = useChatStore.getState().messages.find((m) => m.id === MSG_ID)!;

    store.setMessageMetadata(MSG_ID, metadata);
    const after2 = useChatStore.getState().messages.find((m) => m.id === MSG_ID)!;

    expect(after1.metadata).toEqual(after2.metadata);
  });
});
