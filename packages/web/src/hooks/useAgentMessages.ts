/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { AgentLikeTaskMessage, TaskRunToolEvent } from '@openjiuwen/relay-shared';
import { TaskRunAccumulator, mergeTaskRunsPreserveSegmentMeta } from '@openjiuwen/relay-shared';
import { useCallback, useEffect, useRef } from 'react';
import { coercePptStudioSlidesUpdate, coercePptStudioStatus } from '@/components/ppt-studio/ppt-studio-types';
import { recordDebugEvent } from '@/debug/invocationEventDebug';
import {
  getAgentErrorToastContent,
  getDailyQuotaExhaustedChatMessage,
  getRateLimitChatMessage,
  isDailyQuotaExhaustedAgentError,
  isRateLimitError,
} from '@/hooks/agent-error-fallback';
import { getCachedAgents } from '@/hooks/useAgentData';
import type { ChatMessage } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { notifyOnTaskComplete } from '@/utils/desktop-notification';
import { readPublicEnv } from '@/utils/client-env';
import { parseSystemInfoContent } from './parse-system-info';
import { isSchedulerPlaceholderMessage } from './scheduler-placeholder';
import { requestThreadLiveRefresh, type ThreadLiveRefreshScope } from './thread-live-refresh';
import { apiFetch } from '@/utils/api-client';
import { resolveAssistantMessageTimestamp } from '@/utils/message-order';

const DRAFT_MESSAGE_ID_PREFIX = 'draft-';

function streamBubbleInvocationId(msg: ChatMessage): string | undefined {
  if (msg.extra?.stream?.invocationId) return msg.extra.stream.invocationId;
  if (msg.id.startsWith(DRAFT_MESSAGE_ID_PREFIX)) return msg.id.slice(DRAFT_MESSAGE_ID_PREFIX.length);
  return undefined;
}

function isActiveStreamBubble(msg: ChatMessage, state: ReturnType<typeof useChatStore.getState>): boolean {
  if (msg.type !== 'assistant' || msg.origin !== 'stream' || !msg.agentId) return false;
  if (msg.isStreaming) return true;
  const invId = streamBubbleInvocationId(msg);
  if (!invId) return false;
  if (state.activeInvocations?.[invId]) return true;
  return state.hasActiveInvocation && state.agentInvocations[msg.agentId]?.invocationId === invId;
}

/** Timeout for done(isFinal) - 5 minutes */
const DONE_TIMEOUT_MS = 5 * 60 * 1000;
/** Monotonic counter for collision-safe callback bubble IDs */
let cbSeq = 0;

const DEBUG_SKIP_FILE_CHANGE_UI = readPublicEnv('NEXT_PUBLIC_DEBUG_SKIP_FILE_CHANGE_UI') === '1';

function collectStreamStopInvocationIds(
  activeInvocations: Record<string, { agentId: string; mode: string; startedAt?: number }>,
  messages: ChatMessage[],
): string[] {
  const ids = new Set<string>();
  for (const id of Object.keys(activeInvocations)) {
    if (id) ids.add(id);
  }
  for (const m of messages) {
    if (m.type !== 'assistant' || !m.isStreaming) continue;
    const inv = m.extra?.stream?.invocationId;
    if (typeof inv === 'string' && inv.trim().length > 0) ids.add(inv);
  }
  return [...ids];
}

function firePersistStreamUserStopped(threadId: string, invocationIds: string[]): void {
  if (invocationIds.length === 0) return;
  void apiFetch(`/api/threads/${encodeURIComponent(threadId)}/stream-stopped`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invocationIds }),
  }).catch(() => {
    /* best-effort; optimistic UI already applied */
  });
}

interface AgentMsg {
  type: string;
  agentId: string;
  threadId?: string;
  content?: string;
  source?: import('../stores/chat-types').ConnectorSourceData;
  error?: string;
  errorCode?: string;
  isFinal?: boolean;
  metadata?: { provider: string; model: string; sessionId?: string; usage?: import('../stores/chat-types').TokenUsage };
  /** Tool name (for 'tool_use' events from backend) */
  toolName?: string;
  /** Tool input params (for 'tool_use' events from backend) */
  toolInput?: Record<string, unknown>;
  /** Message origin: stream = CLI stdout (thinking), callback = MCP post_message (speech) */
  origin?: 'stream' | 'callback';
  /** Backend stored-message ID (set for callback post-message, used for rich_block correlation) */
  messageId?: string;
  /** F67: Whether this message @mentions the co-creator */
  mentionsUser?: boolean;
  /** F52: Cross-thread origin metadata */
  extra?: {
    crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
    errorFallback?: { v: number; kind: string; rawError: string; timestamp: number };
  };
  /** F121: Reply-to message ID */
  replyTo?: string;
  /** F121: Server-hydrated reply preview */
  replyPreview?: { senderAgentId: string | null; content: string; deleted?: true };
  /** F108: Invocation ID — distinguishes messages from concurrent invocations */
  invocationId?: string;
  /** F142: Tool call ID for precise pairing (from backend AgentMessage) */
  toolCallId?: string;
  /** Epoch ms when the backend emitted this message (paired with persisted history) */
  timestamp?: number;
  /** Jiuwen / relay-claw task scope */
  taskContext?: { id: string; title?: string; index?: number; total?: number };
  taskPhase?: 'start' | 'complete';
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function safeJsonPreview(value: unknown, maxLength: number): string {
  try {
    const raw = JSON.stringify(value);
    return truncate(raw, maxLength);
  } catch {
    return '[unserializable input]';
  }
}

function toolUseDetail(toolName: string | undefined, toolInput: unknown): string | undefined {
  if (toolInput === null || toolInput === undefined) return undefined;
  if (toolName === 'send_file_to_user') {
    try {
      return JSON.stringify(toolInput);
    } catch {
      return safeJsonPreview(toolInput, 200);
    }
  }
  return safeJsonPreview(toolInput, 200);
}

function resolveAgentDisplayLabel(agentId: string): string {
  return getCachedAgents().find((row) => row.id === agentId)?.displayName ?? agentId;
}

function buildMessageExtra(
  msg: Pick<AgentMsg, 'extra'>,
  invocationId?: string,
): NonNullable<import('../stores/chat-types').ChatMessage['extra']> | undefined {
  const extra = {
    ...(msg.extra?.crossPost ? { crossPost: msg.extra.crossPost } : {}),
    ...(msg.extra?.errorFallback ? { errorFallback: msg.extra.errorFallback } : {}),
    ...(invocationId ? { stream: { invocationId } } : {}),
  };
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function agentMsgTaskShell(msg: AgentMsg): AgentLikeTaskMessage {
  return {
    type: msg.type,
    agentId: msg.agentId,
    content: msg.content,
    taskContext: msg.taskContext,
    taskPhase: msg.taskPhase,
    toolName: msg.toolName,
    toolInput: msg.toolInput,
    toolCallId: msg.toolCallId,
    timestamp: msg.timestamp,
  };
}

function findLatestActiveInvocationIdForAgent(
  activeInvocations: Record<string, { agentId: string; mode: string }> | undefined,
  agentId: string,
): string | undefined {
  if (!activeInvocations) return undefined;
  const entries = Object.entries(activeInvocations);
  for (let i = entries.length - 1; i >= 0; i--) {
    const [invocationId, info] = entries[i]!;
    if (info.agentId === agentId) return invocationId;
  }
  return undefined;
}

/**
 * Hook for handling agent message streaming (parallel-aware).
 * Tracks active streams via Map<agentId, ref> for simultaneous multi-cat output.
 *
 * Returns:
 * - handleAgentMessage: socket event handler
 * - handleStop: cancel handler for stop button
 * - resetRefs: full cleanup when starting a new send
 * - resetRefsForThreadSwitch: thread navigation — clear ephemeral maps, rehydrate stream refs
 */
export function useAgentMessages() {
  const {
    addMessage,
    appendToMessage,
    appendToolEvent,
    appendRichBlock,
    replaceMessageId,
    patchMessage,
    patchThreadMessage,
    removeMessage,
    setStreaming,
    setLoading,
    setHasActiveInvocation,
    addActiveInvocation,
    removeActiveInvocation,
    clearAllActiveInvocations,
    setIntentMode,
    setAgentStatus,
    clearAgentStatuses,
    setAgentInvocation,
    setMessageUsage,
    setMessageMetadata,
    setMessageThinking,
    setMessageStreamInvocation,
    setMessageStreamExecutionDuration,
    upsertPptStudioSlides,
    setPptStudioStatus,
    requestStreamCatchUp,
  } = useChatStore();

  /** Map<agentId, { id: messageId, agentId, threadId }> — one entry per active stream
   *  threadId is captured at creation to prevent cross-thread contamination during rapid switches.
   *  When the active thread changes, stale entries are invalidated via thread mismatch check. */
  const activeRefs = useRef<Map<string, { id: string; agentId: string; threadId: string }>>(new Map());
  /** Track callback-replaced invocations so delayed stream chunks do not recreate ghost bubbles. */
  const replacedInvocationsRef = useRef<Map<string, string>>(new Map());
  /** Suppress late stream fragments after a terminal error until a new invocation starts. */
  const terminalStreamSuppressionRef = useRef<Map<string, string | null>>(new Map());

  /** #586 follow-up: Track just-finalized stream bubble per cat. Set on done when
   *  activeRefs entry existed, consumed by callback replacement or next invocation start.
   *  Prevents the greedy scan from matching arbitrary historical messages. */
  const finalizedStreamRef = useRef<Map<string, string>>(new Map());

  /** Bug C P2: Track whether stream data was received per cat (avoids false catch-up on callback-only flows) */
  const sawStreamDataRef = useRef<Set<string>>(new Set());

  /** Bugfix: 用户点停止后，后端 cancel 是异步的，旧 invocationId 的 SSE 事件还会到来。
   *  此黑名单记录已被用户取消的 invocationId，handleAgentMessage 在入口处 drop 它们，
   *  防止旧事件被路由到新 bubble。成员在新 invocation_created 时移除（自愈）。 */
  const cancelledInvocationsRef = useRef<Set<string>>(new Set());

  const taskRunAccumulatorsRef = useRef(new Map<string, TaskRunAccumulator>());

  const getTaskRunAccum = useCallback((messageId: string) => {
    const existing = taskRunAccumulatorsRef.current.get(messageId);
    if (existing) return existing;

    const acc = new TaskRunAccumulator();
    const msg = useChatStore.getState().messages.find((m) => m.id === messageId);
    const taskRuns = msg?.extra?.taskRuns;
    if (taskRuns?.v === 1 && taskRuns.segments.length > 0) {
      acc.loadFromExtra(taskRuns);
    }
    taskRunAccumulatorsRef.current.set(messageId, acc);
    return acc;
  }, []);

  const flushTaskRunsToMessage = useCallback(
    (messageId: string) => {
      const acc = taskRunAccumulatorsRef.current.get(messageId);
      const tr = acc?.toExtra();
      if (!tr) return;
      const existing = useChatStore.getState().messages.find((m) => m.id === messageId);
      const mergedTr = mergeTaskRunsPreserveSegmentMeta(tr, existing?.extra?.taskRuns);
      patchMessage(messageId, {
        extra: {
          ...existing?.extra,
          taskRuns: mergedTr,
        },
      });
    },
    [patchMessage],
  );

  /** F118 AC-C3: Pending timeout diagnostics keyed by agentId to prevent cross-cat mismatch */
  const pendingTimeoutDiagRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  /** Timeout ref for done(isFinal) reachability */
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Which thread the current timeout guard belongs to */
  const timeoutThreadRef = useRef<string | null>(null);

  /** Start or reset the done timeout */
  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    const timeoutThreadId = useChatStore.getState().currentThreadId;
    timeoutThreadRef.current = timeoutThreadId;
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      timeoutThreadRef.current = null;
      const store = useChatStore.getState();
      const isActiveThreadTimeout = store.currentThreadId === timeoutThreadId;

      if (!isActiveThreadTimeout) {
        const threadState = store.getThreadState(timeoutThreadId);
        for (const message of threadState.messages) {
          if (message.type === 'assistant' && message.isStreaming) {
            store.setThreadMessageStreaming(timeoutThreadId, message.id, false);
          }
        }
        store.resetThreadInvocationState(timeoutThreadId);
        store.addMessageToThread(timeoutThreadId, {
          id: `sysinfo-timeout-${Date.now()}`,
          type: 'system',
          variant: 'info',
          content: '⏱ Response timed out. The operation may still be running in the background.',
          timestamp: Date.now(),
        });
        return;
      }

      // Timeout fired — stop loading and show system message
      setLoading(false);
      clearAllActiveInvocations();
      setIntentMode(null);
      clearAgentStatuses();
      for (const ref of activeRefs.current.values()) {
        setStreaming(ref.id, false);
      }
      activeRefs.current.clear();
      addMessage({
        id: `sysinfo-timeout-${Date.now()}`,
        type: 'system',
        variant: 'info',
        content: '⏱ Response timed out. The operation may still be running in the background.',
        timestamp: Date.now(),
      });
    }, DONE_TIMEOUT_MS);
  }, [setLoading, clearAllActiveInvocations, setIntentMode, clearAgentStatuses, setStreaming, addMessage]);

  /** Clear the timeout (called on done with isFinal) */
  const clearDoneTimeout = useCallback((threadId?: string) => {
    if (threadId && timeoutThreadRef.current && timeoutThreadRef.current !== threadId) {
      return;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      timeoutThreadRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      timeoutThreadRef.current = null;
    },
    [],
  );

  const getCurrentInvocationStateForAgent = useCallback(
    (agentId: string): { invocationId?: string; source: 'agentInvocations' | 'activeInvocations' | 'none' } => {
      const state = useChatStore.getState();
      const direct = state.agentInvocations?.[agentId]?.invocationId;
      if (direct) {
        return { invocationId: direct, source: 'agentInvocations' };
      }
      const active = findLatestActiveInvocationIdForAgent(state.activeInvocations, agentId);
      if (active) {
        return { invocationId: active, source: 'activeInvocations' };
      }
      return { source: 'none' };
    },
    [],
  );

  const resolveBubbleTimestamp = useCallback(
    (agentId: string, invocationId?: string, eventTimestamp?: number): number => {
      const state = useChatStore.getState();
      return resolveAssistantMessageTimestamp({
        agentId,
        invocationId,
        eventTimestamp,
        agentInvocations: state.agentInvocations,
        activeInvocations: state.activeInvocations,
        existingMessages: state.messages,
      });
    },
    [],
  );

  const recordLateBindBubbleCreate = useCallback((agentId: string, messageId: string, invocationId?: string) => {
    if (!invocationId) return;
    recordDebugEvent({
      event: 'bubble_lifecycle',
      threadId: useChatStore.getState().currentThreadId,
      timestamp: Date.now(),
      action: 'create',
      reason: 'active_late_bind',
      agentId,
      messageId,
      invocationId,
      origin: 'stream',
    });
  }, []);

  const getCurrentInvocationIdForAgent = useCallback(
    (agentId: string): string | undefined => {
      return getCurrentInvocationStateForAgent(agentId).invocationId;
    },
    [getCurrentInvocationStateForAgent],
  );

  const findRecoverableAssistantMessage = useCallback(
    (agentId: string, preferredInvocationId?: string) => {
      const currentMessages = useChatStore.getState().messages;
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        const msg = currentMessages[i];
        if (msg.type === 'assistant' && msg.agentId === agentId && msg.isStreaming) {
          return { id: msg.id, needsStreamingRestore: false };
        }
      }

      if (preferredInvocationId) {
        for (let i = currentMessages.length - 1; i >= 0; i--) {
          const msg = currentMessages[i];
          if (msg.type !== 'assistant' || msg.agentId !== agentId) continue;
          if (msg.extra?.stream?.invocationId !== preferredInvocationId) continue;
          return { id: msg.id, needsStreamingRestore: !msg.isStreaming };
        }
      }

      const invocationId = getCurrentInvocationIdForAgent(agentId);
      if (invocationId) {
        for (let i = currentMessages.length - 1; i >= 0; i--) {
          const msg = currentMessages[i];
          if (msg.type !== 'assistant' || msg.agentId !== agentId) continue;
          if (msg.extra?.stream?.invocationId !== invocationId) continue;
          return { id: msg.id, needsStreamingRestore: !msg.isStreaming };
        }
      }

      // Fallback: stream bubble with invocationId still tied to an active run (e.g. after
      // thread switch + fetchQueue cleared isStreaming, or draft row from history API).
      const store = useChatStore.getState();
      for (let i = currentMessages.length - 1; i >= 0; i--) {
        const msg = currentMessages[i];
        if (msg.type !== 'assistant' || msg.agentId !== agentId) continue;
        if (msg.origin !== 'stream') continue;
        const invId = streamBubbleInvocationId(msg);
        if (!invId) continue;
        if (preferredInvocationId && invId !== preferredInvocationId) continue;
        if (!msg.isStreaming && !isActiveStreamBubble(msg, store)) continue;
        return { id: msg.id, needsStreamingRestore: !msg.isStreaming };
      }

      return null;
    },
    [getCurrentInvocationIdForAgent],
  );

  const findCallbackReplacementTarget = useCallback((agentId: string, invocationId: string): { id: string } | null => {
    const currentMessages = useChatStore.getState().messages;
    for (let i = currentMessages.length - 1; i >= 0; i -= 1) {
      const msg = currentMessages[i];
      if (
        msg?.type === 'assistant' &&
        msg.agentId === agentId &&
        msg.origin === 'stream' &&
        msg.extra?.stream?.invocationId === invocationId
      ) {
        return { id: msg.id };
      }
    }
    return null;
  }, []);

  const findInvocationlessStreamPlaceholder = useCallback((agentId: string): { id: string } | null => {
    const currentMessages = useChatStore.getState().messages;
    const activeId = activeRefs.current.get(agentId)?.id;

    if (activeId) {
      const activeMessage = currentMessages.find(
        (msg) =>
          msg.id === activeId &&
          msg.type === 'assistant' &&
          msg.agentId === agentId &&
          msg.origin === 'stream' &&
          !msg.extra?.stream?.invocationId,
      );
      if (activeMessage) {
        return { id: activeMessage.id };
      }
    }

    // First pass: find actively-streaming invocationless bubble
    for (let i = currentMessages.length - 1; i >= 0; i -= 1) {
      const msg = currentMessages[i];
      if (
        msg?.type === 'assistant' &&
        msg.agentId === agentId &&
        msg.origin === 'stream' &&
        msg.isStreaming &&
        !msg.extra?.stream?.invocationId
      ) {
        return { id: msg.id };
      }
    }

    // #586 follow-up: Check finalizedStreamRef — the done handler records the
    // exact message ID of the just-finalized stream bubble. This avoids the
    // greedy scan that could match arbitrary historical messages (P1 from review).
    const finalizedId = finalizedStreamRef.current.get(agentId);
    if (finalizedId) {
      const finalized = currentMessages.find(
        (m) => m.id === finalizedId && m.type === 'assistant' && m.agentId === agentId && m.origin === 'stream',
      );
      if (finalized) {
        return { id: finalized.id };
      }
    }

    return null;
  }, []);

  const getOrRecoverActiveAssistantMessageId = useCallback(
    (
      agentId: string,
      metadata?: AgentMsg['metadata'],
      options?: { ensureStreaming?: boolean; preferredInvocationId?: string },
    ): string | null => {
      const state = useChatStore.getState();
      const currentThreadId = state.currentThreadId;
      const currentMessages = state.messages;
      const existing = activeRefs.current.get(agentId);
      if (existing?.id) {
        // Cross-thread guard: invalidate stale refs from previous thread
        if (currentThreadId && existing.threadId !== currentThreadId) {
          activeRefs.current.delete(agentId);
          return null;
        }
        const found = currentMessages.find((msg) => msg.id === existing.id && msg.type === 'assistant');
        if (found) {
          if (options?.ensureStreaming && !found.isStreaming) {
            setStreaming(found.id, true);
          }
          if (metadata) {
            setMessageMetadata(found.id, metadata);
          }
          return found.id;
        }
        activeRefs.current.delete(agentId);
      }

      const recovered = findRecoverableAssistantMessage(agentId, options?.preferredInvocationId);
      if (!recovered) {
        return null;
      }

      activeRefs.current.set(agentId, { id: recovered.id, agentId, threadId: currentThreadId });
      if (options?.ensureStreaming && recovered.needsStreamingRestore) {
        setStreaming(recovered.id, true);
      }
      if (metadata) {
        setMessageMetadata(recovered.id, metadata);
      }
      return recovered.id;
    },
    [findRecoverableAssistantMessage, setMessageMetadata, setStreaming],
  );

  const ensureActiveAssistantMessage = useCallback(
    (agentId: string, metadata?: AgentMsg['metadata'], preferredInvocationId?: string): string => {
      const existingId = getOrRecoverActiveAssistantMessageId(agentId, metadata, {
        ensureStreaming: true,
        ...(preferredInvocationId ? { preferredInvocationId } : {}),
      });
      if (existingId) {
        return existingId;
      }

      const state = useChatStore.getState();
      const currentThreadId = state.currentThreadId;
      const id = `msg-${Date.now()}-${agentId}`;
      const invocation = getCurrentInvocationStateForAgent(agentId);
      const invocationId = invocation.invocationId;
      activeRefs.current.set(agentId, { id, agentId, threadId: currentThreadId });
      addMessage({
        id,
        type: 'assistant',
        agentId,
        content: '',
        origin: 'stream',
        ...(metadata ? { metadata } : {}),
        ...(invocationId ? { extra: { stream: { invocationId } } } : {}),
        timestamp: resolveBubbleTimestamp(agentId, invocationId),
        isStreaming: true,
      });
      if (invocation.source === 'activeInvocations') {
        recordLateBindBubbleCreate(agentId, id, invocationId);
      }
      return id;
    },
    [
      addMessage,
      getCurrentInvocationStateForAgent,
      getOrRecoverActiveAssistantMessageId,
      recordLateBindBubbleCreate,
      resolveBubbleTimestamp,
    ],
  );

  const shouldSuppressLateStreamChunk = useCallback(
    (agentId: string, invocationId?: string): boolean => {
      const replacedInvocationId = replacedInvocationsRef.current.get(agentId);
      if (!replacedInvocationId) return false;

      const currentInvocationId = invocationId ?? getCurrentInvocationIdForAgent(agentId);
      if (currentInvocationId && currentInvocationId !== replacedInvocationId) {
        replacedInvocationsRef.current.delete(agentId);
        return false;
      }

      recordDebugEvent({
        event: 'bubble_lifecycle',
        threadId: useChatStore.getState().currentThreadId,
        timestamp: Date.now(),
        action: 'drop',
        reason: 'late_stream_after_callback_replace',
        agentId,
        invocationId: replacedInvocationId,
        origin: 'stream',
      });
      return true;
    },
    [getCurrentInvocationIdForAgent],
  );

  const clearTerminalStreamSuppression = useCallback((agentId: string, nextInvocationId?: string) => {
    const suppressedInvocationId = terminalStreamSuppressionRef.current.get(agentId);
    if (suppressedInvocationId === undefined) return;
    if (nextInvocationId && suppressedInvocationId === nextInvocationId) return;
    terminalStreamSuppressionRef.current.delete(agentId);
  }, []);

  const requestActiveThreadRefresh = useCallback((scope: ThreadLiveRefreshScope, reason: string) => {
    const threadId = useChatStore.getState().currentThreadId;
    if (!threadId) return;
    requestThreadLiveRefresh(threadId, scope, reason);
  }, []);

  const shouldSuppressLateTerminalStreamEvent = useCallback(
    (agentId: string, invocationId?: string): boolean => {
      const suppressedInvocationId = terminalStreamSuppressionRef.current.get(agentId);
      if (suppressedInvocationId === undefined) return false;

      const currentInvocationId = invocationId ?? getCurrentInvocationIdForAgent(agentId) ?? null;
      if (currentInvocationId && suppressedInvocationId !== currentInvocationId) {
        terminalStreamSuppressionRef.current.delete(agentId);
        return false;
      }

      recordDebugEvent({
        event: 'bubble_lifecycle',
        threadId: useChatStore.getState().currentThreadId,
        timestamp: Date.now(),
        action: 'drop',
        reason: 'late_stream_after_terminal_error',
        agentId,
        invocationId: suppressedInvocationId ?? undefined,
        origin: 'stream',
      });
      return true;
    },
    [getCurrentInvocationIdForAgent],
  );

  const handleAgentMessage = useCallback(
    (msg: AgentMsg) => {
      const currentThreadId = useChatStore.getState().currentThreadId;

      // Cross-thread guard: useSocket already routes via dual-pointer check,
      // but this is an extra safety net for any edge cases.
      if (msg.threadId && currentThreadId && msg.threadId !== currentThreadId) {
        recordDebugEvent({
          event: 'agent_message',
          threadId: msg.threadId,
          storeThreadId: currentThreadId,
          timestamp: Date.now(),
          agentId: msg.agentId,
          invocationId: msg.invocationId,
          action: 'ignored_cross_thread',
          origin: msg.origin,
        });
        return;
      }

      // Thread mismatch recovery: invalidate stale activeRefs entries that belong
      // to a different thread. This handles the race where resetRefs() hasn't run
      // yet (useEffect is async) but a new thread's message arrives.
      const activeRef = activeRefs.current.get(msg.agentId);
      if (activeRef && currentThreadId && activeRef.threadId !== currentThreadId) {
        activeRefs.current.delete(msg.agentId);
        recordDebugEvent({
          event: 'bubble_lifecycle',
          threadId: activeRef.threadId,
          timestamp: Date.now(),
          action: 'invalidate',
          reason: 'active_ref_thread_mismatch',
          agentId: msg.agentId,
          messageId: activeRef.id,
          origin: 'stream',
        });
      }

      // Reset timeout on any message (keeps timer alive during streaming)
      resetTimeout();

      // Bugfix: 用户点停止后，后端 cancel 是异步的，已取消的 invocationId 的 SSE 事
      // 件还会陆续到来。如果此时已发出新问题，这些旧事件会污染新 bubble。
      // 在入口处丢弃已被取消的 invocationId 的全部事件（done 事件除外——需要它来
      // 触发最终状态清理；但因为 handleStop 已经做了清理，done 的副作用是幂等的）。
      if (msg.invocationId && cancelledInvocationsRef.current.has(msg.invocationId) && msg.type !== 'done') {
        return;
      }

      if (isSchedulerPlaceholderMessage(msg)) {
        return;
      }

      if (msg.type === 'text' && msg.content) {
        const errorFallback = msg.extra?.errorFallback;
        // 后端降级：text + errorFallback 为对用户可见的友好说明（如连接不可用）。
        // 若仍走「终端错误后抑制流式片段」，会把这条文本丢弃，气泡只剩 thinking/工具无提示。
        if (
          msg.origin !== 'callback' &&
          !errorFallback &&
          (shouldSuppressLateStreamChunk(msg.agentId, msg.invocationId) ||
            shouldSuppressLateTerminalStreamEvent(msg.agentId, msg.invocationId))
        ) {
          return;
        }
        setAgentStatus(msg.agentId, errorFallback ? 'error' : 'streaming');
        // F118: Clear liveness warning when cat resumes output
        setAgentInvocation(msg.agentId, { livenessWarning: undefined });
        if (msg.origin !== 'callback') {
          sawStreamDataRef.current.add(msg.agentId);
        }

        if (msg.origin === 'callback') {
          const invocationId = msg.invocationId ?? getCurrentInvocationIdForAgent(msg.agentId);
          const replacementTarget = invocationId
            ? findCallbackReplacementTarget(msg.agentId, invocationId)
            : findInvocationlessStreamPlaceholder(msg.agentId);

          if (replacementTarget) {
            const finalId = msg.messageId ?? replacementTarget.id;
            if (finalId !== replacementTarget.id) {
              replaceMessageId(replacementTarget.id, finalId);
            }
            patchMessage(finalId, {
              content: msg.content,
              origin: 'callback',
              isStreaming: false,
              ...(msg.metadata ? { metadata: msg.metadata } : {}),
              ...(buildMessageExtra(msg, invocationId) ? { extra: buildMessageExtra(msg, invocationId) } : {}),
              ...(msg.mentionsUser ? { mentionsUser: true } : {}),
              ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
              ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
            });
            activeRefs.current.delete(msg.agentId);
            // Consume the finalized ref — callback successfully replaced the bubble
            finalizedStreamRef.current.delete(msg.agentId);
            if (invocationId) {
              replacedInvocationsRef.current.set(msg.agentId, invocationId);
            }
          } else {
            // Use backend messageId when available for rich_block correlation (#83 P2)
            const id = msg.messageId ?? `msg-${Date.now()}-${msg.agentId}-cb-${++cbSeq}`;
            addMessage({
              id,
              type: 'assistant',
              agentId: msg.agentId,
              content: msg.content,
              origin: 'callback',
              ...(msg.metadata ? { metadata: msg.metadata } : {}),
              ...(buildMessageExtra(msg, invocationId) ? { extra: buildMessageExtra(msg, invocationId) } : {}),
              ...(msg.mentionsUser ? { mentionsUser: true } : {}),
              ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
              ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
              timestamp: resolveBubbleTimestamp(msg.agentId, invocationId, msg.timestamp),
            });
            // #586 Bug 1 (TD112): Callback created a new bubble because no stream
            // placeholder existed yet. Mark the invocation as replaced so that
            // late-arriving stream chunks for the same invocation are suppressed
            // instead of spawning a second bubble.
            if (invocationId) {
              replacedInvocationsRef.current.set(msg.agentId, invocationId);
            }
          }
          requestActiveThreadRefresh('messages', 'callback_message');
        } else {
          // CLI stream message (thinking): append to active stream bubble
          const messageId = getOrRecoverActiveAssistantMessageId(msg.agentId, msg.metadata, {
            ensureStreaming: true,
            ...(msg.invocationId ? { preferredInvocationId: msg.invocationId } : {}),
          });
          if (messageId) {
            const acc = getTaskRunAccum(messageId);
            const shell = agentMsgTaskShell(msg);
            if (acc.isTaskScopedText(shell)) {
              acc.appendText(shell, msg.content);
              flushTaskRunsToMessage(messageId);
            } else {
              appendToMessage(messageId, msg.content);
            }
            if (msg.replyTo || msg.replyPreview) {
              patchMessage(messageId, {
                ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
                ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
              });
            }
          } else {
            // New stream message for this cat
            const id = `msg-${Date.now()}-${msg.agentId}`;
            const invocation = getCurrentInvocationStateForAgent(msg.agentId);
            const invocationId = invocation.invocationId;
            const threadId = useChatStore.getState().currentThreadId;
            activeRefs.current.set(msg.agentId, { id, agentId: msg.agentId, threadId: threadId ?? 'default' });
            const acc = getTaskRunAccum(id);
            const shell = agentMsgTaskShell(msg);
            const taskOnly = acc.isTaskScopedText(shell);
            addMessage({
              id,
              type: 'assistant',
              agentId: msg.agentId,
              content: taskOnly ? '' : msg.content,
              origin: 'stream',
              ...(msg.metadata ? { metadata: msg.metadata } : {}),
              ...(invocationId ? { extra: { stream: { invocationId } } } : {}),
              ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
              ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
              timestamp: resolveBubbleTimestamp(msg.agentId, invocationId, msg.timestamp),
              isStreaming: true,
            });
            if (taskOnly) {
              acc.appendText(shell, msg.content);
              flushTaskRunsToMessage(id);
            }
            if (invocation.source === 'activeInvocations') {
              recordLateBindBubbleCreate(msg.agentId, id, invocationId);
            }
          }
        }
      } else if (msg.type === 'tool_use') {
        if (msg.origin !== 'callback' && shouldSuppressLateTerminalStreamEvent(msg.agentId, msg.invocationId)) {
          return;
        }
        setAgentStatus(msg.agentId, 'streaming');
        sawStreamDataRef.current.add(msg.agentId);
        const toolName = msg.toolName ?? 'unknown';
        const detail = toolUseDetail(toolName, msg.toolInput);
        const isFileChange = toolName === 'file_change';
        if (isFileChange) {
          console.info('[agent_message] file_change tool_use received', {
            agentId: msg.agentId,
            activeRefCount: activeRefs.current.size,
            skipUi: DEBUG_SKIP_FILE_CHANGE_UI,
            detail: detail ?? null,
          });
          if (DEBUG_SKIP_FILE_CHANGE_UI) {
            console.warn('[agent_message] file_change UI append skipped', {
              agentId: msg.agentId,
              reason: 'NEXT_PUBLIC_DEBUG_SKIP_FILE_CHANGE_UI=1',
            });
            return;
          }
        }

        const messageId = ensureActiveAssistantMessage(msg.agentId, msg.metadata, msg.invocationId);

        const toolUseId = msg.toolCallId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const toolUseTs =
          typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) ? msg.timestamp : Date.now();
        appendToolEvent(messageId, {
          id: toolUseId,
          type: 'tool_use',
          label: `${msg.agentId} → ${toolName}`,
          ...(detail ? { detail } : {}),
          ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
          timestamp: toolUseTs,
        });
        const tu: TaskRunToolEvent = {
          id: toolUseId,
          type: 'tool_use',
          label: `${msg.agentId} → ${toolName}`,
          ...(detail ? { detail } : {}),
          timestamp: toolUseTs,
          ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
        };
        getTaskRunAccum(messageId).appendTool(agentMsgTaskShell(msg), tu);
        flushTaskRunsToMessage(messageId);
        if (isFileChange) {
          console.info('[agent_message] file_change tool_use appended', {
            agentId: msg.agentId,
            messageId,
            activeRefCount: activeRefs.current.size,
          });
        }
      } else if (msg.type === 'tool_result') {
        if (msg.origin !== 'callback' && shouldSuppressLateTerminalStreamEvent(msg.agentId, msg.invocationId)) {
          return;
        }
        setAgentStatus(msg.agentId, 'streaming');
        const messageId = ensureActiveAssistantMessage(msg.agentId, msg.metadata, msg.invocationId);

        const toolResId = msg.toolCallId ?? `toolr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const toolResTs = Date.now();
        appendToolEvent(messageId, {
          id: toolResId,
          type: 'tool_result',
          label: `${msg.agentId} ← ${msg.toolName ?? 'result'}`,
          detail: msg.content ?? '',
          ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
          timestamp: toolResTs,
        });
        const tr: TaskRunToolEvent = {
          id: toolResId,
          type: 'tool_result',
          label: `${msg.agentId} ← ${msg.toolName ?? 'result'}`,
          detail: msg.content ?? '',
          timestamp: toolResTs,
          ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
        };
        getTaskRunAccum(messageId).appendTool(agentMsgTaskShell(msg), tr);
        flushTaskRunsToMessage(messageId);
      } else if (msg.type === 'done') {
        const currentMessage = useChatStore
          .getState()
          .messages.filter((m) => m.type === 'assistant' && m.agentId === msg.agentId)
          .at(-1);
        const hasErrorFallback = Boolean(currentMessage?.extra?.errorFallback);
        setAgentStatus(msg.agentId, hasErrorFallback ? 'error' : 'done');
        const agentDisplayName = getCachedAgents()?.find((row) => row.id === msg.agentId)?.displayName ?? msg.agentId;
        const completionThreadId = msg.threadId ?? useChatStore.getState().currentThreadId ?? undefined;
        notifyOnTaskComplete({
          title: hasErrorFallback ? `${agentDisplayName} 出错` : `${agentDisplayName} 完成`,
          body: hasErrorFallback ? '任务执行出错' : '任务已完成',
          type: hasErrorFallback ? 'error' : 'success',
          threadId: completionThreadId,
        });
        const suppressedAfterTerminalError = terminalStreamSuppressionRef.current.has(msg.agentId);
        const currentProgress = useChatStore.getState().agentInvocations?.[msg.agentId]?.taskProgress;
        if (currentProgress?.tasks?.length) {
          setAgentInvocation(msg.agentId, {
            taskProgress: {
              ...currentProgress,
              snapshotStatus:
                currentProgress.snapshotStatus === 'interrupted' || hasErrorFallback ? 'interrupted' : 'completed',
              lastUpdate: Date.now(),
            },
          });
        }
        const messageId = getOrRecoverActiveAssistantMessageId(msg.agentId);
        if (messageId) {
          setStreaming(messageId, false);
          // #586 follow-up: Record the finalized bubble so callback can find it
          // even after isStreaming=false + activeRefs cleared. Unlike a greedy
          // scan, this is scoped to the exact just-finalized message only.
          finalizedStreamRef.current.set(msg.agentId, messageId);
          activeRefs.current.delete(msg.agentId);
          taskRunAccumulatorsRef.current.delete(messageId);
        } else {
          // 用户点停止会先清空 activeRefs / store 里 invocation，导致此处 getOrRecover 返回
          // null，若不再收尾 isStreaming，随后 stream-catch-up 的 mergeReplaceHydrationMessages
          // 可能用「本地仍带 isStreaming 的流式壳」因内容更完整而覆盖服务端已持久化的气泡。
          for (const m of useChatStore.getState().messages) {
            if (m.type === 'assistant' && m.agentId === msg.agentId && m.isStreaming) {
              setStreaming(m.id, false);
            }
          }
          if (msg.invocationId) {
            const hit = useChatStore.getState().messages.find(
              (m) =>
                m.type === 'assistant' &&
                m.agentId === msg.agentId &&
                m.extra?.stream?.invocationId === msg.invocationId,
            );
            if (hit) {
              finalizedStreamRef.current.set(msg.agentId, hit.id);
              taskRunAccumulatorsRef.current.delete(hit.id);
            }
          }
          activeRefs.current.delete(msg.agentId);
        }
        // Bugfix: clear stale invocationId so findRecoverableAssistantMessage
        // can't match this finalized message when the next invocation starts.
        // Without this, a race (new text before invocation_created) appends to
        // the old bubble, causing messages to visually merge until page refresh.
        // Cloud review P2: Do NOT clear taskProgress here — lines 552-559 already
        // transition it to 'completed'/'interrupted'. Wiping it would remove the
        // Preserve per-cat streaming snapshot when clearing statuses (avoid wiping active streams).
        setAgentInvocation(msg.agentId, { invocationId: undefined });
        // Always remove the finishing cat's invocation slot, regardless of isFinal.
        // isFinal=false means more agents may follow, but this agent is done — its slot must go.
        // Without this, non-final agents (e.g. codex before opus in a handoff) leave
        // orphan slots that keep ThreadExecutionBar showing "执行中" until F5 refresh.
        if (msg.invocationId) {
          const slotState = useChatStore.getState();
          const primarySlot = slotState.activeInvocations[msg.invocationId];
          if (primarySlot?.agentId === msg.agentId) {
            removeActiveInvocation(msg.invocationId);
          }
          removeActiveInvocation(`${msg.invocationId}-${msg.agentId}`);
          // Hydrated synthetic IDs (hydrated-${threadId}-${agentId}) won't match the real
          // invocationId from the server. Only clean up hydrated- prefixed orphans to
          // avoid accidentally deleting a NEW invocation's slot during same-cat preempt
          // (where old done arrives after new invocation starts).
          const stateAfter = useChatStore.getState();
          const orphan = findLatestActiveInvocationIdForAgent(stateAfter.activeInvocations, msg.agentId);
          if (orphan?.startsWith('hydrated-')) {
            removeActiveInvocation(orphan);
          }
        } else {
          const activeInvocationSlot = findLatestActiveInvocationIdForAgent(useChatStore.getState().activeInvocations, msg.agentId);
          if (activeInvocationSlot) {
            removeActiveInvocation(activeInvocationSlot);
          } else if (Object.keys(useChatStore.getState().activeInvocations ?? {}).length === 0) {
            // Only reset global flag when no active invocations remain.
            // Without this guard, a non-final cat with no slot would incorrectly
            // clear hasActiveInvocation while other agents are still running.
            setHasActiveInvocation(false);
          }
        }
        if (msg.isFinal) {
          // F108 P1 fix: Only clear global state when the LAST active invocation ends.
          // During concurrent multi-cat execution, cancelling one cat must not wipe
          // the execution state (loading/intentMode/agentStatuses) of remaining agents.
          const remainingInvocations = Object.keys(useChatStore.getState().activeInvocations ?? {}).length;
          if (remainingInvocations === 0) {
            clearDoneTimeout();
            setLoading(false);
            setIntentMode(null);
            clearAgentStatuses();
          }
          // Note: do NOT clear replacedInvocationsRef here. The suppression guard
          // is designed to persist until a *different* invocationId is observed
          // (F123 PR #465, symptom-fixture-matrix.md:23). Clearing on done(isFinal)
          // would allow reordered stale chunks to recreate ghost bubbles.
          // Bug C safety net: if done(isFinal) arrived but no streaming bubble
          // was ever created for this cat, text events were lost (socket transport
          // drop, dual-pointer guard mismatch, etc.). Request a history catch-up
          // so the user sees the response without needing F5.
          // P2: Only trigger if stream data was actually received (avoids false
          // catch-up on callback-only flows where addMessage handles delivery).
          if (!messageId && sawStreamDataRef.current.has(msg.agentId) && !suppressedAfterTerminalError) {
            const tid = useChatStore.getState().currentThreadId;
            if (tid) {
              requestStreamCatchUp(tid);
            }
          }
          requestActiveThreadRefresh('panels', 'done_final');
          sawStreamDataRef.current.delete(msg.agentId);
        }
      } else if (msg.type === 'system_info') {
        sawStreamDataRef.current.add(msg.agentId);
        // System notifications: budget warnings, cancel feedback, A2A follow-up hints, invocation metrics
        let sysContent = msg.content ?? '';
        let sysVariant: 'info' | 'warning' | 'a2a_followup' = 'info';
        let consumed = false;
        try {
          const parsed = parseSystemInfoContent(sysContent);
          if (!parsed) throw new Error('not parseable system_info');
          if (parsed?.type === 'invocation_created') {
            const targetCatId = parsed.agentId ?? msg.agentId;
            const invocationId = typeof parsed.invocationId === 'string' ? parsed.invocationId : undefined;
            clearTerminalStreamSuppression(targetCatId, invocationId);
          } else if (msg.origin !== 'callback' && shouldSuppressLateTerminalStreamEvent(msg.agentId, msg.invocationId)) {
            return;
          }
          const targetThreadId = msg.threadId ?? useChatStore.getState().currentThreadId;
          if (parsed?.type === 'ppt_studio_page') {
            const sessionUpdate = coercePptStudioSlidesUpdate(parsed);
            if (sessionUpdate) {
              upsertPptStudioSlides(targetThreadId, sessionUpdate);
              consumed = true;
            }
          } else if (parsed?.type === 'ppt_studio_export') {
            const status = coercePptStudioStatus(parsed.status);
            if (status) {
              setPptStudioStatus(targetThreadId, status);
              consumed = true;
            }
          } else if (parsed?.type === 'a2a_followup_available') {
            const mentions = parsed.mentions as Array<{ agentId: string; mentionedBy: string }>;
            sysContent = mentions.map((m) => `${m.mentionedBy} @了 ${m.agentId}`).join('、');
            sysVariant = 'a2a_followup';
          } else if (parsed?.type === 'recoverable_pause') {
            const targetCatId = parsed.agentId ?? msg.agentId;
            const currentProgress = targetCatId
              ? useChatStore.getState().agentInvocations?.[targetCatId]?.taskProgress
              : undefined;
            if (targetCatId) {
              setAgentInvocation(targetCatId, {
                taskProgress: {
                  tasks: currentProgress?.tasks ?? [],
                  lastUpdate: Date.now(),
                  snapshotStatus: 'interrupted',
                  interruptReason:
                    typeof parsed.interruptReason === 'string' ? parsed.interruptReason : 'recoverable_pause',
                  ...(currentProgress?.lastInvocationId ? { lastInvocationId: currentProgress.lastInvocationId } : {}),
                },
                ...(typeof parsed.sessionId === 'string' ? { sessionId: parsed.sessionId } : {}),
              });
            }
            sysContent =
              typeof parsed.message === 'string' && parsed.message.trim()
                ? parsed.message
                : '上次运行已暂停，可继续执行或放弃当前会话。';
            sysVariant = 'info';
          } else if (parsed?.type === 'invocation_created') {
            // New invocation boundary: clear stale task snapshot + finalized ref for this cat.
            // #586: Without clearing finalizedStreamRef here, a stale ref from the
            // previous invocation could cause the next callback to overwrite the old message.
            const targetCatId = parsed.agentId ?? msg.agentId;
            finalizedStreamRef.current.delete(targetCatId);
            const invocationId = typeof parsed.invocationId === 'string' ? parsed.invocationId : undefined;
            if (targetCatId && invocationId) {
              // 新 invocation 到来时，从取消黑名单中移除（自愈）
              cancelledInvocationsRef.current.delete(invocationId);
              setLoading(true);
              setAgentStatus(targetCatId, 'streaming');
              addActiveInvocation(invocationId, targetCatId, 'execute');
              setAgentInvocation(targetCatId, {
                invocationId,
                startedAt: Date.now(),
                taskProgress: {
                  tasks: [],
                  lastUpdate: Date.now(),
                  snapshotStatus: 'running',
                  lastInvocationId: invocationId,
                },
              });
              const targetId = getOrRecoverActiveAssistantMessageId(targetCatId, undefined, {
                preferredInvocationId: invocationId,
              });
              if (targetId) {
                setMessageStreamInvocation(targetId, invocationId);
              }
              consumed = true;
            }
          } else if (parsed?.type === 'invocation_metrics') {
            // Store metrics silently — don't show as system message
            if (parsed.kind === 'session_started') {
              setAgentInvocation(msg.agentId, {
                sessionId: parsed.sessionId,
                invocationId: parsed.invocationId,
                startedAt: Date.now(),
                taskProgress: { tasks: [], lastUpdate: 0 },
                ...(parsed.sessionSeq !== undefined ? { sessionSeq: parsed.sessionSeq, sessionSealed: false } : {}),
              });
            } else if (parsed.kind === 'invocation_complete') {
              const completeInvId = typeof parsed.invocationId === 'string' ? parsed.invocationId : undefined;
              const dur =
                typeof parsed.durationMs === 'number' && Number.isFinite(parsed.durationMs)
                  ? parsed.durationMs
                  : undefined;
              setAgentInvocation(msg.agentId, {
                ...(dur !== undefined ? { durationMs: dur } : {}),
                sessionId: parsed.sessionId,
              });
              if (dur !== undefined && dur >= 0 && completeInvId) {
                const storeNow = useChatStore.getState();
                const hit = storeNow.messages.find(
                  (m) =>
                    m.type === 'assistant' &&
                    m.agentId === msg.agentId &&
                    m.extra?.stream?.invocationId === completeInvId,
                );
                const candidateId = hit?.id ?? activeRefs.current.get(msg.agentId)?.id;
                if (candidateId) {
                  const cand = storeNow.messages.find((m) => m.id === candidateId);
                  if (cand?.extra?.stream?.invocationId === completeInvId) {
                    setMessageStreamExecutionDuration(candidateId, dur);
                  }
                }
              }
            }
            consumed = true;
          } else if (parsed?.type === 'invocation_usage') {
            // F8: Store token usage silently — don't show as system message
            setAgentInvocation(msg.agentId, {
              usage: parsed.usage,
            });
            // Also persist usage on the cat's last assistant message (message-scoped)
            const ref = activeRefs.current.get(msg.agentId);
            if (ref) {
              setMessageUsage(ref.id, parsed.usage);
            }
            consumed = true;
          } else if (parsed?.type === 'context_health') {
            // F24: Store context health silently
            const targetCatId = parsed.agentId ?? msg.agentId;
            if (targetCatId) {
              setAgentInvocation(targetCatId, {
                contextHealth: parsed.health,
              });
              consumed = true;
            }
          } else if (parsed?.type === 'rate_limit') {
            // F045: Telemetry only — don't show as chat bubble
            const targetCatId = parsed.agentId ?? msg.agentId;
            if (targetCatId) {
              setAgentInvocation(targetCatId, {
                rateLimit: {
                  ...(typeof parsed.utilization === 'number' ? { utilization: parsed.utilization } : {}),
                  ...(typeof parsed.resetsAt === 'string' ? { resetsAt: parsed.resetsAt } : {}),
                },
              });
            }
            consumed = true;
          } else if (parsed?.type === 'compact_boundary') {
            // F045: Telemetry only — don't show as chat bubble
            const targetCatId = parsed.agentId ?? msg.agentId;
            if (targetCatId) {
              setAgentInvocation(targetCatId, {
                compactBoundary: {
                  ...(typeof parsed.preTokens === 'number' ? { preTokens: parsed.preTokens } : {}),
                },
              });
            }
            consumed = true;
          } else if (parsed?.type === 'task_progress') {
            // F26: Store task progress silently
            const targetCatId = parsed.agentId ?? msg.agentId;
            const currentInvocationId =
              typeof parsed.invocationId === 'string'
                ? parsed.invocationId
                : useChatStore.getState().agentInvocations?.[targetCatId]?.invocationId;
            const tasks = (parsed.tasks ?? []) as import('../stores/chat-types').TaskProgressItem[];
            setAgentInvocation(targetCatId, {
              taskProgress: {
                tasks,
                lastUpdate: Date.now(),
                snapshotStatus: 'running',
                ...(currentInvocationId ? { lastInvocationId: currentInvocationId } : {}),
              },
            });
            consumed = true;
          } else if (parsed?.type === 'web_search') {
            // F045: web_search tool event (privacy: no query, count only) — render as ToolEvent, not raw JSON
            setAgentStatus(msg.agentId, 'streaming');
            const count = typeof parsed.count === 'number' ? parsed.count : 1;
            const messageId = ensureActiveAssistantMessage(msg.agentId, msg.metadata, msg.invocationId);

            appendToolEvent(messageId, {
              id: `toolws-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'tool_use',
              label: `${msg.agentId} → web_search${count > 1 ? ` x${count}` : ''}`,
              timestamp: Date.now(),
            });
            consumed = true;
          } else if (parsed?.type === 'task_boundary') {
            const messageId = ensureActiveAssistantMessage(msg.agentId, msg.metadata, msg.invocationId);
            const taskId = typeof parsed.taskId === 'string' ? parsed.taskId.trim() : '';
            if (messageId && taskId) {
              const phase = parsed.phase === 'complete' ? 'complete' : 'start';
              getTaskRunAccum(messageId).onBoundary({
                type: 'system_info',
                agentId: msg.agentId,
                taskPhase: phase,
                taskContext: {
                  id: taskId,
                  title: typeof parsed.title === 'string' ? parsed.title : undefined,
                  index: typeof parsed.taskIndex === 'number' ? parsed.taskIndex : undefined,
                  total: typeof parsed.totalTasks === 'number' ? parsed.totalTasks : undefined,
                },
              });
              flushTaskRunsToMessage(messageId);
            }
            consumed = true;
          } else if (parsed?.type === 'thinking') {
            // F045: Embed thinking into the current assistant bubble (like Claude Code)
            const thinkingText = parsed.text ?? '';
            if (thinkingText) {
              const thinkingAgentId =
                typeof parsed.agentId === 'string' && parsed.agentId.trim().length > 0
                  ? parsed.agentId.trim()
                  : msg.agentId;
              const messageId = ensureActiveAssistantMessage(thinkingAgentId, msg.metadata, msg.invocationId);
              setMessageThinking(messageId, thinkingText);
              const mergeStrategy = parsed.mergeStrategy === 'append' ? 'append' : 'paragraph';
              getTaskRunAccum(messageId).appendThinking(
                agentMsgTaskShell({ ...msg, agentId: thinkingAgentId }),
                thinkingText,
                mergeStrategy,
              );
              flushTaskRunsToMessage(messageId);
            }
            consumed = true;
          } else if (parsed?.type === 'liveness_warning') {
            // F118 Phase C: Liveness warning — update cat status + invocation snapshot
            const level = parsed.level as 'alive_but_silent' | 'suspected_stall';
            setAgentStatus(msg.agentId, level);
            setAgentInvocation(msg.agentId, {
              livenessWarning: {
                level,
                state: parsed.state as 'active' | 'busy-silent' | 'idle-silent' | 'dead',
                silenceDurationMs: parsed.silenceDurationMs as number,
                cpuTimeMs: typeof parsed.cpuTimeMs === 'number' ? parsed.cpuTimeMs : undefined,
                processAlive: parsed.processAlive as boolean,
                receivedAt: Date.now(),
              },
            });
            consumed = true;
          } else if (parsed?.type === 'timeout_diagnostics') {
            // F118 AC-C3: Store diagnostics keyed by agentId to prevent cross-cat mismatch
            if (msg.agentId) {
              pendingTimeoutDiagRef.current.set(msg.agentId, parsed as Record<string, unknown>);
            }
            consumed = true;
          } else if (parsed?.type === 'warning') {
            // F045: item-level warning — render as readable system message (avoid raw JSON blob)
            const warningText = typeof parsed.message === 'string' ? parsed.message : '';
            sysContent = warningText ? `⚠️ ${warningText}` : '⚠️ Warning';
            sysVariant = 'warning';
          } else if (parsed?.type === 'processing_status') {
            // RelayClaw processing heartbeat — update cat status silently, don't show as chat bubble
            const processingStatus = parsed.status as string;
            if (processingStatus === 'idle') {
              // idle means the model finished processing — don't override active streaming status
            } else {
              setAgentStatus(msg.agentId, 'streaming');
            }
            consumed = true;
          } else if (parsed?.type === 'strategy_allow_compress' || parsed?.type === 'resume_failure_stats') {
            // Internal telemetry — suppress to avoid raw JSON bubbles
            consumed = true;
          } else if (parsed?.type === 'silent_completion') {
            // Bugfix: silent-exit — cat ran tools but produced no text response
            const detail = typeof parsed.detail === 'string' ? parsed.detail : '';
            sysContent = detail || `${msg.agentId} completed without a text response.`;
          } else if (parsed?.type === 'invocation_preempted') {
            // Bugfix: silent-exit — invocation was superseded by a newer request
            sysContent = 'This response was superseded by a newer request.';
          } else if (parsed?.type === 'rich_block') {
            // F22: Append rich block — prefer messageId correlation (#83 P2), fallback to activeRefs
            let targetId: string | undefined;

            // P2 fix: use messageId from callback post-message path for precise correlation
            if (parsed.messageId) {
              const found = useChatStore.getState().messages.find((m) => m.id === parsed.messageId);
              if (found) targetId = found.id;
            }

            // Bugfix: standalone create_rich_block (no messageId) — prefer most recent
            // callback message from this cat over the active streaming message.
            // Without this, blocks land on the CLI streaming bubble instead of the
            // preceding post_message bubble, showing raw JSON until page refresh.
            // Guard: if the most recent assistant message from this cat is a streaming
            // message, skip callback lookup — the block likely came from the CLI stream
            // (e.g. codex-event-transform image extraction), not a MCP callback.
            if (!targetId) {
              const currentMessages = useChatStore.getState().messages;
              for (let i = currentMessages.length - 1; i >= 0; i--) {
                const m = currentMessages[i];
                if (m.type !== 'assistant' || m.agentId !== msg.agentId) continue;
                // If we hit an active streaming message first, callback is stale — stop
                if (m.origin === 'stream' && m.isStreaming) break;
                if (m.origin === 'callback') {
                  targetId = m.id;
                  break;
                }
              }
            }

            if (!targetId) {
              // Final fallback: recover the active stream bubble before creating a placeholder.
              targetId = ensureActiveAssistantMessage(msg.agentId, msg.metadata, msg.invocationId);
            }

            if (parsed.block) {
              appendRichBlock(targetId, parsed.block);
            }
            requestActiveThreadRefresh('messages', 'rich_block');
            consumed = true;
          } else if (parsed?.type === 'session_seal_requested') {
            // F24 Phase B: Session sealed — update session info + show notification
            setAgentInvocation(parsed.agentId, {
              sessionSeq: parsed.sessionSeq,
              sessionSealed: true,
            });
            const pct = parsed.healthSnapshot?.fillRatio ? Math.round(parsed.healthSnapshot.fillRatio * 100) : '?';
            sysContent = `${parsed.agentId} 的会话 #${parsed.sessionSeq} 已封存（上下文 ${pct}%），下次调用将自动创建新会话`;
          }
        } catch {
          if (msg.origin !== 'callback' && shouldSuppressLateTerminalStreamEvent(msg.agentId, msg.invocationId)) {
            return;
          }
          /* not JSON, use raw content */
        }
        if (!consumed) {
          addMessage({
            id: `sysinfo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'system',
            variant: sysVariant,
            content: sysContent,
            timestamp: Date.now(),
          });
        }
      } else if (msg.type === 'error') {
        // 理论上后端已转换为 text 消息，但保留降级处理
        console.warn('[useAgentMessages] Received raw error event (backend not upgraded or error in transformation)', {
          agentId: msg.agentId,
        });

        // 状态清理逻辑（必须保留）
        setAgentStatus(msg.agentId, 'error');
        terminalStreamSuppressionRef.current.set(
          msg.agentId,
          msg.invocationId ?? getCurrentInvocationIdForAgent(msg.agentId) ?? null,
        );

        const currentProgress = useChatStore.getState().agentInvocations?.[msg.agentId]?.taskProgress;
        if (currentProgress?.tasks?.length) {
          setAgentInvocation(msg.agentId, {
            taskProgress: {
              ...currentProgress,
              snapshotStatus: 'interrupted',
              interruptReason: msg.error ?? 'Unknown error',
              lastUpdate: Date.now(),
            },
          });
        }

        const messageId = getOrRecoverActiveAssistantMessageId(msg.agentId);
        if (messageId) {
          setStreaming(messageId, false);
          activeRefs.current.delete(msg.agentId);
        }

        if (msg.agentId) pendingTimeoutDiagRef.current.delete(msg.agentId);

        recordDebugEvent({
          event: 'agent_message',
          threadId: useChatStore.getState().currentThreadId,
          timestamp: Date.now(),
          agentId: msg.agentId,
          invocationId: msg.invocationId,
          reason: msg.error ?? 'Unknown error',
          action: 'error_fallback_frontend_degradation',
          origin: msg.origin,
        });

        // Toast 通知（降级）
        const toast = getAgentErrorToastContent({
          ...msg,
          agentDisplayName: resolveAgentDisplayLabel(msg.agentId),
        });

        // 瞬时限流：在对话框中显示固定文案（优先于 toast）
        if (isRateLimitError(msg)) {
          addMessage({
            id: `rate-limit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'system',
            variant: 'error',
            content: getRateLimitChatMessage(),
            timestamp: Date.now(),
          });
        } else if (isDailyQuotaExhaustedAgentError(msg)) {
          addMessage({
            id: `daily-quota-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'system',
            variant: 'error',
            content: getDailyQuotaExhaustedChatMessage(),
            timestamp: Date.now(),
          });
        } else {
          useToastStore.getState().addToast({
            type: 'error',
            title: toast.title,
            message: toast.message,
            threadId: useChatStore.getState().currentThreadId,
            duration: 8000,
          });
        }

        // 清理 loading 状态
        if (msg.isFinal) {
          clearDoneTimeout();
          setLoading(false);

          if (msg.invocationId) {
            removeActiveInvocation(msg.invocationId);
            const stateAfter = useChatStore.getState();
            const orphan = findLatestActiveInvocationIdForAgent(stateAfter.activeInvocations, msg.agentId);
            if (orphan?.startsWith('hydrated-')) {
              removeActiveInvocation(orphan);
            }
          } else {
            const catSlot = findLatestActiveInvocationIdForAgent(useChatStore.getState().activeInvocations, msg.agentId);
            if (catSlot) {
              removeActiveInvocation(catSlot);
            } else {
              setHasActiveInvocation(false);
            }
          }
          setIntentMode(null);

          for (const ref of activeRefs.current.values()) {
            setStreaming(ref.id, false);
          }
          activeRefs.current.clear();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      addMessage,
      appendToMessage,
      appendToolEvent,
      getTaskRunAccum,
      flushTaskRunsToMessage,
      appendRichBlock,
      setStreaming,
      setLoading,
      addActiveInvocation,
      removeActiveInvocation,
      setIntentMode,
      setAgentStatus,
      clearAgentStatuses,
      setAgentInvocation,
      setMessageThinking,
      setMessageStreamInvocation,
      setMessageStreamExecutionDuration,
      replaceMessageId,
      patchMessage,
      resetTimeout,
      clearDoneTimeout,
      findCallbackReplacementTarget,
      findInvocationlessStreamPlaceholder,
      getCurrentInvocationIdForAgent,
      getCurrentInvocationStateForAgent,
      getOrRecoverActiveAssistantMessageId,
      ensureActiveAssistantMessage,
      clearTerminalStreamSuppression,
      recordLateBindBubbleCreate,
      shouldSuppressLateStreamChunk,
      shouldSuppressLateTerminalStreamEvent,
      setHasActiveInvocation,
      setMessageUsage,
      requestStreamCatchUp,
      requestActiveThreadRefresh,
      removeMessage,
      resolveBubbleTimestamp,
    ],
  );

  const handleStop = useCallback(
    (cancelFn: (threadId: string) => void, threadId: string) => {
      cancelFn(threadId);
      const store = useChatStore.getState();
      const isActiveThreadStop = threadId === store.currentThreadId;

      if (!isActiveThreadStop) {
        clearDoneTimeout(threadId);
        const threadState = store.getThreadState(threadId);
        const persistStopIds = collectStreamStopInvocationIds(threadState.activeInvocations, threadState.messages);
        for (const message of threadState.messages) {
          if (message.type === 'assistant' && message.isStreaming) {
            patchThreadMessage(threadId, message.id, {
              extra: {
                stream: { ...message.extra?.stream, userStopped: true },
              },
            });
            store.setThreadMessageStreaming(threadId, message.id, false);
          }
        }
        store.resetThreadInvocationState(threadId);
        firePersistStreamUserStopped(threadId, persistStopIds);
        return;
      }

      clearDoneTimeout(threadId);
      const persistStopIdsActive = collectStreamStopInvocationIds(store.activeInvocations ?? {}, store.messages);
      setLoading(false);
      // F108: stop clears all invocation slots (user cancel-all)
      clearAllActiveInvocations();
      setIntentMode(null);
      clearAgentStatuses();
      // 必须清除本线程上所有 isStreaming 的助手气泡。仅对 activeRefs 清 false 会漏掉
      // 已不在 activeRefs 中但仍带 isStreaming 的旧气泡（如上次服务中断后仅部分对账）；
      // 否则后续 ensureStreaming 自底向上会再次命中旧 bubble，把工具事件挂回第一轮。
      for (const message of useChatStore.getState().messages) {
        if (message.type === 'assistant' && message.isStreaming) {
          patchMessage(message.id, {
            extra: {
              stream: { ...message.extra?.stream, userStopped: true },
            },
          });
          setStreaming(message.id, false);
        }
      }
      activeRefs.current.clear();
      taskRunAccumulatorsRef.current.clear();
      replacedInvocationsRef.current.clear();
      // Bugfix: 停止时后端 done(isFinal) 尚未到达，finalizedStreamRef / sawStreamDataRef
      // 里残留的旧 bubble ID 会导致再次发问时新消息被路由到旧 bubble（callback 替换
      // 错误目标、findRecoverableAssistantMessage 匹配到旧消息）。
      // 同时清理 agentInvocations 中残留的 invocationId，防止 findRecoverableAssistantMessage
      // 通过 invocationId 找到已停止的旧 bubble。
      finalizedStreamRef.current.clear();
      sawStreamDataRef.current.clear();
      pendingTimeoutDiagRef.current.clear();
      // 清除所有 cat 的残留 invocationId（正常流程由 done 事件清理，但停止时 done 可能未到）
      const activeInvocations = store.activeInvocations ?? {};
      const staleCatIds = new Set(Object.values(activeInvocations).map((inv) => inv.agentId));
      for (const agentId of staleCatIds) {
        setAgentInvocation(agentId, { invocationId: undefined });
      }
      // 将所有被取消的 invocationId 加入黑名单，抑制后续到来的旧 SSE 事件
      for (const [invId] of Object.entries(activeInvocations)) {
        cancelledInvocationsRef.current.add(invId);
      }
      terminalStreamSuppressionRef.current.clear();
      firePersistStreamUserStopped(threadId, persistStopIdsActive);
    },
    [
      setLoading,
      clearAllActiveInvocations,
      setStreaming,
      patchMessage,
      patchThreadMessage,
      setIntentMode,
      clearAgentStatuses,
      clearDoneTimeout,
      setAgentInvocation,
    ],
  );

  const resetRefs = useCallback(() => {
    activeRefs.current.clear();
    taskRunAccumulatorsRef.current.clear();
    replacedInvocationsRef.current.clear();
    finalizedStreamRef.current.clear();
    sawStreamDataRef.current.clear();
    terminalStreamSuppressionRef.current.clear();
    pendingTimeoutDiagRef.current.clear();
    cancelledInvocationsRef.current.clear();
    clearDoneTimeout();
  }, [clearDoneTimeout]);

  const rehydrateStreamingRefs = useCallback(
    (threadId: string) => {
      const state = useChatStore.getState();
      if (state.currentThreadId !== threadId) return;

      const pickedByAgent = new Map<string, ChatMessage>();
      for (let i = state.messages.length - 1; i >= 0; i--) {
        const msg = state.messages[i];
        if (!msg || msg.type !== 'assistant' || !msg.agentId || msg.origin !== 'stream') continue;
        if (!isActiveStreamBubble(msg, state)) continue;
        if (!pickedByAgent.has(msg.agentId)) {
          pickedByAgent.set(msg.agentId, msg);
        }
      }

      for (const [agentId, msg] of pickedByAgent) {
        activeRefs.current.set(agentId, { id: msg.id, agentId, threadId });
        const taskRuns = msg.extra?.taskRuns;
        if (taskRuns?.v === 1 && taskRuns.segments.length > 0) {
          const acc = new TaskRunAccumulator();
          acc.loadFromExtra(taskRuns);
          taskRunAccumulatorsRef.current.set(msg.id, acc);
        }
        if (!msg.isStreaming) {
          setStreaming(msg.id, true);
        }
        recordDebugEvent({
          event: 'bubble_lifecycle',
          threadId,
          timestamp: Date.now(),
          action: 'recover',
          reason: 'thread_switch_rehydrate',
          agentId,
          messageId: msg.id,
          invocationId: streamBubbleInvocationId(msg),
          origin: 'stream',
        });
      }
    },
    [setStreaming],
  );

  /** Thread switch: drop ephemeral maps but re-bind active stream bubbles from persisted messages. */
  const resetRefsForThreadSwitch = useCallback(
    (threadId: string) => {
      activeRefs.current.clear();
      taskRunAccumulatorsRef.current.clear();
      replacedInvocationsRef.current.clear();
      finalizedStreamRef.current.clear();
      sawStreamDataRef.current.clear();
      terminalStreamSuppressionRef.current.clear();
      pendingTimeoutDiagRef.current.clear();
      clearDoneTimeout();
      rehydrateStreamingRefs(threadId);
    },
    [clearDoneTimeout, rehydrateStreamingRefs],
  );

  return {
    handleAgentMessage,
    handleStop,
    resetRefs,
    resetRefsForThreadSwitch,
    rehydrateStreamingRefs,
    resetTimeout,
    clearDoneTimeout,
  };
}
