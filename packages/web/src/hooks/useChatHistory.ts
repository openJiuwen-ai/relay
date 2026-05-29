/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getBubbleInvocationId, shouldForceReplaceHydrationForCachedMessages } from '@/debug/bubbleIdentity';
import { recordDebugEvent } from '@/debug/invocationEventDebug';
import { compareMessagesByOrder } from '@/utils/message-order';
import type { QueueEntry, TaskProgressItem, ToolEvent } from '@/stores/chat-types';
import { type AgentInvocationInfo, type ChatMessage as ChatMessageData, useChatStore } from '@/stores/chatStore';
import { useTaskStore } from '@/stores/taskStore';
import { apiFetch } from '@/utils/api-client';
import { isSchedulerPlaceholderMessage } from './scheduler-placeholder';
import {
  THREAD_LIVE_REFRESH_EVENT,
  requestThreadLiveRefresh,
  type ThreadLiveRefreshDetail,
  type ThreadLiveRefreshScope,
} from './thread-live-refresh';

type SavedScrollState = {
  top: number;
  anchor: 'bottom' | 'offset';
};

// Route navigation remounts the page, so scroll memory must live outside the component instance.
// outside React refs to survive /thread/A → /thread/B → /thread/A.
const scrollPositionsByThread = new Map<string, SavedScrollState>();
const SCROLL_BOTTOM_THRESHOLD_PX = 24;
const MAX_RESTORE_FRAMES = 90;
const USER_CHANNEL_CONNECTORS = new Set(['weixin', 'xiaoyi', 'feishu', 'dingtalk']);

function isUserChannelConnector(connectorId?: string): boolean {
  return typeof connectorId === 'string' && USER_CHANNEL_CONNECTORS.has(connectorId);
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight - el.scrollTop <= SCROLL_BOTTOM_THRESHOLD_PX;
}

function rememberScrollState(threadId: string, el: HTMLElement) {
  scrollPositionsByThread.set(threadId, {
    top: el.scrollTop,
    anchor: isNearBottom(el) ? 'bottom' : 'offset',
  });
}

const HISTORY_PAGE_SIZE = 50;
// In export mode (?export=true), load all messages in one request for screenshot capture.
// Normal browsing still uses 50-per-page pagination.
const EXPORT_LIMIT = 10000;
// Keep first-screen message priority, but don't let secondary hydration stall indefinitely.
const SECONDARY_HYDRATION_FALLBACK_MS = 300;
const LIVE_THREAD_REFRESH_DEBOUNCE_MS = 180;
const HYDRATION_REPLY_MATCH_WINDOW_MS = 20_000;
const HYDRATION_CONTENT_MATCH_WINDOW_MS = 12_000;
const HYDRATION_PREFIX_MATCH_MIN_CHARS = 24;
const HYDRATION_STOPPED_STREAM_MATCH_WINDOW_MS = 120_000;
const THREAD_SWITCH_HINT_PREV_MIN_MESSAGES = 12;
const THREAD_SWITCH_HINT_CURRENT_MAX_MESSAGES = 3;
const RECONNECT_DROP_RETRY_COOLDOWN_MS = 45_000;
const RECONNECT_DROP_PREV_MIN_MESSAGES = 12;
const RECONNECT_DROP_CURRENT_MAX_MESSAGES = 3;

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError';
}

function normalizeHistoryToolEvents(raw: unknown[] | undefined): ToolEvent[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw
    .map((ev): ToolEvent | null => {
      if (!ev || typeof ev !== 'object') return null;
      const src = ev as Record<string, unknown>;
      const id = typeof src.id === 'string' ? src.id : '';
      const type = src.type === 'tool_use' || src.type === 'tool_result' ? src.type : null;
      const label = typeof src.label === 'string' ? src.label : '';
      const timestamp = typeof src.timestamp === 'number' ? src.timestamp : Date.now();
      if (!id || !type || !label) return null;
      let detail: string | undefined;
      if (typeof src.detail === 'string') {
        detail = src.detail;
      } else if (src.detail !== undefined) {
        try {
          detail = JSON.stringify(src.detail);
        } catch {
          detail = String(src.detail);
        }
      }
      return {
        id,
        type,
        label,
        ...(detail ? { detail } : {}),
        timestamp,
        ...(typeof src.toolCallId === 'string' ? { toolCallId: src.toolCallId } : {}),
      };
    })
    .filter((ev): ev is ToolEvent => ev !== null);
}

type ReplaceHydrationMergeStats = {
  preservedLocalCount: number;
  reconciledToHistoryCount: number;
  replacedHistoryCount: number;
};

type ReplaceHydrationMergeResult = {
  messages: ChatMessageData[];
  stats: ReplaceHydrationMergeStats;
};

function getHistoryInvocationId(msg: ChatMessageData): string | undefined {
  return getBubbleInvocationId(msg);
}

/**
 * When replace-merge overwrites a server history row with a richer local copy,
 * do not reintroduce stale `isStreaming: true` (e.g. after Stop) — server / API
 * rows are authoritative for "done" unless they explicitly set `isStreaming: true`.
 * Draft rows keep local `isStreaming` by id.
 */
function mergeIsStreamingOnHistoryReplace(
  current: ChatMessageData,
  history: ChatMessageData,
): boolean {
  if (current.id.startsWith('draft-')) {
    return Boolean(current.isStreaming);
  }
  if (current.type === 'assistant' && current.origin === 'stream') {
    if (history.isStreaming === true) {
      return Boolean(current.isStreaming);
    }
    return false;
  }
  return Boolean(current.isStreaming);
}

/**
 * After Stop / done, the store has no (or a different) invocationId, but a local
 * `draft-{invocationId}` row may still be `isStreaming: true` (Redis + #80 mapping).
 * That row survives as `preservedLocalCount` in replace-merge and makes tools
 * look loading again. Clear streaming when the draft is not the active run for its cat.
 */
function sanitizeOrphanStreamingDrafts(
  messages: ChatMessageData[],
  currentCatInvocations: Record<string, AgentInvocationInfo>,
): ChatMessageData[] {
  return messages.map((m) => {
    if (m.type !== 'assistant' || m.origin !== 'stream' || !m.isStreaming || !m.id.startsWith('draft-') || !m.agentId) {
      return m;
    }
    const storeInv = currentCatInvocations[m.agentId]?.invocationId;
    if (storeInv) {
      const draftInv = m.id.slice('draft-'.length);
      if (storeInv === draftInv) {
        return m;
      }
    }
    return { ...m, isStreaming: false };
  });
}

function getLocalPlaceholderInvocationId(
  msg: ChatMessageData,
  currentCatInvocations: Record<string, AgentInvocationInfo>,
): string | undefined {
  if (msg.extra?.stream?.invocationId) return msg.extra.stream.invocationId;
  // Fallback: draft messages have id = 'draft-{invocationId}' — extract even after
  // isStreaming is cleared by the done handler (prevents duplicate bubbles).
  if (msg.id.startsWith('draft-')) return msg.id.slice('draft-'.length);
  if (msg.type !== 'assistant' || msg.origin !== 'stream' || !msg.isStreaming || !msg.agentId) return undefined;
  return currentCatInvocations[msg.agentId]?.invocationId;
}

function normalizeHydrationText(text: string | undefined): string {
  return text?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function hasHydrationTextOverlap(current: ChatMessageData, history: ChatMessageData): boolean {
  const currentText = normalizeHydrationText(current.content);
  const historyText = normalizeHydrationText(history.content);
  if (!currentText || !historyText) return false;
  if (currentText === historyText) return true;

  const shorter = currentText.length <= historyText.length ? currentText : historyText;
  const longer = shorter === currentText ? historyText : currentText;
  return shorter.length >= HYDRATION_PREFIX_MATCH_MIN_CHARS && longer.startsWith(shorter);
}

function hasSharedHydrationToolEvent(current: ChatMessageData, history: ChatMessageData): boolean {
  if (!current.toolEvents?.length || !history.toolEvents?.length) return false;
  const currentToolEventIds = new Set(current.toolEvents.map((event) => event.id));
  return history.toolEvents.some((event) => currentToolEventIds.has(event.id));
}

function areMessagesCloseInTime(current: ChatMessageData, history: ChatMessageData, windowMs: number): boolean {
  return Math.abs(getMessageOrderTimestamp(current) - getMessageOrderTimestamp(history)) <= windowMs;
}

function getPreviousUserAnchorId(messages: ChatMessageData[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (!candidate) continue;
    if (candidate.type === 'user' || candidate.type === 'connector') return candidate.id;
  }
  return undefined;
}

function isLikelySameHydrationReply(
  current: ChatMessageData,
  currentIndex: number,
  currentMsgs: ChatMessageData[],
  history: ChatMessageData,
  historyIndex: number,
  historyMsgs: ChatMessageData[],
  currentCatInvocations: Record<string, AgentInvocationInfo>,
): boolean {
  if (current.type !== 'assistant' || history.type !== 'assistant') return false;
  if (!current.agentId || current.agentId !== history.agentId) return false;

  if (current.replyTo && history.replyTo && current.replyTo !== history.replyTo) {
    return false;
  }

  const sameReplyTarget = !!current.replyTo && current.replyTo === history.replyTo;
  const currentInvocationId = getLocalPlaceholderInvocationId(current, currentCatInvocations);
  const historyInvocationId = getHistoryInvocationId(history);
  const hasExplicitInvocationMismatch =
    !!currentInvocationId && !!historyInvocationId && currentInvocationId !== historyInvocationId;
  const hasTextOverlap = hasHydrationTextOverlap(current, history);
  const hasSharedToolEvent = hasSharedHydrationToolEvent(current, history);
  const currentPreviousUserAnchorId = getPreviousUserAnchorId(currentMsgs, currentIndex);
  const historyPreviousUserAnchorId = getPreviousUserAnchorId(historyMsgs, historyIndex);
  const hasSamePreviousUserAnchor =
    !!currentPreviousUserAnchorId && currentPreviousUserAnchorId === historyPreviousUserAnchorId;
  const hasSharedReplyContext = sameReplyTarget || hasSamePreviousUserAnchor;
  const isStoppedLocalStreamPlaceholder = current.origin === 'stream' && !current.isStreaming;

  if (hasSharedReplyContext) {
    if (isStoppedLocalStreamPlaceholder) {
      return areMessagesCloseInTime(current, history, HYDRATION_STOPPED_STREAM_MATCH_WINDOW_MS);
    }
    return (
      areMessagesCloseInTime(current, history, HYDRATION_REPLY_MATCH_WINDOW_MS) || hasTextOverlap || hasSharedToolEvent
    );
  }

  if (hasExplicitInvocationMismatch) return false;
  if (hasSharedToolEvent && areMessagesCloseInTime(current, history, HYDRATION_CONTENT_MATCH_WINDOW_MS)) return true;
  if (hasTextOverlap && areMessagesCloseInTime(current, history, HYDRATION_CONTENT_MATCH_WINDOW_MS)) return true;
  return false;
}

function findFallbackHistoryMatchIndex(
  current: ChatMessageData,
  currentIndex: number,
  currentMsgs: ChatMessageData[],
  historyMsgs: ChatMessageData[],
  mergedMsgs: ChatMessageData[],
  currentCatInvocations: Record<string, AgentInvocationInfo>,
): number | undefined {
  for (let i = historyMsgs.length - 1; i >= 0; i--) {
    const historyMsg = mergedMsgs[i];
    if (!historyMsg) continue;
    if (!isLikelySameHydrationReply(current, currentIndex, currentMsgs, historyMsg, i, historyMsgs, currentCatInvocations)) {
      continue;
    }
    return i;
  }
  return undefined;
}

function getMessageRichness(msg: ChatMessageData): [number, number, number, number] {
  return [
    msg.content.length,
    msg.thinking?.length ?? 0,
    msg.toolEvents?.length ?? 0,
    msg.extra?.rich?.blocks.length ?? 0,
  ];
}

function getMessagePhasePriority(msg: ChatMessageData): number {
  if (msg.origin === 'callback') return 2;
  if (msg.origin === 'stream') return 1;
  return 0;
}

function getMessageOrderTimestamp(msg: ChatMessageData): number {
  return msg.deliveredAt ?? msg.timestamp;
}

function shouldPreferCurrentMessage(current: ChatMessageData, history: ChatMessageData): boolean {
  const currentPhasePriority = getMessagePhasePriority(current);
  const historyPhasePriority = getMessagePhasePriority(history);
  if (currentPhasePriority !== historyPhasePriority) {
    return currentPhasePriority > historyPhasePriority;
  }

  // Once both sides are already at callback phase, authoritative server history
  // should win unless the local callback is strictly newer. This prevents a stale
  // cached callback bubble from surviving thread-switch hydration until the next F5.
  if (currentPhasePriority === 2) {
    return getMessageOrderTimestamp(current) > getMessageOrderTimestamp(history);
  }

  const currentRichness = getMessageRichness(current);
  const historyRichness = getMessageRichness(history);
  for (let i = 0; i < currentRichness.length; i++) {
    if (currentRichness[i] === historyRichness[i]) continue;
    return currentRichness[i]! > historyRichness[i]!;
  }
  return false;
}

function mergeReplaceHydrationMessages(
  historyMsgs: ChatMessageData[],
  currentMsgs: ChatMessageData[],
  currentCatInvocations: Record<string, AgentInvocationInfo>,
): ReplaceHydrationMergeResult {
  if (currentMsgs.length === 0) {
    return {
      messages: historyMsgs,
      stats: { preservedLocalCount: 0, reconciledToHistoryCount: 0, replacedHistoryCount: 0 },
    };
  }

  const historyIds = new Set(historyMsgs.map((msg) => msg.id));
  const mergedMsgs = [...historyMsgs];
  const historyIndexByStreamKey = new Map<string, number>();

  for (let i = 0; i < historyMsgs.length; i++) {
    const msg = historyMsgs[i]!;
    const invocationId = msg.agentId ? getHistoryInvocationId(msg) : undefined;
    if (!msg.agentId || !invocationId) continue;
    historyIndexByStreamKey.set(`${msg.agentId}:${invocationId}`, i);
  }

  let preservedLocalCount = 0;
  let reconciledToHistoryCount = 0;
  let replacedHistoryCount = 0;

  for (let currentIndex = 0; currentIndex < currentMsgs.length; currentIndex++) {
    const msg = currentMsgs[currentIndex]!;
    if (historyIds.has(msg.id)) continue;

    const invocationId = msg.agentId ? getLocalPlaceholderInvocationId(msg, currentCatInvocations) : undefined;
    const streamKey = msg.agentId && invocationId ? `${msg.agentId}:${invocationId}` : undefined;

    if (streamKey) {
      const historyIndex = historyIndexByStreamKey.get(streamKey);
      if (historyIndex !== undefined) {
        const historyMsg = mergedMsgs[historyIndex]!;
        if (shouldPreferCurrentMessage(msg, historyMsg)) {
          mergedMsgs[historyIndex] = { ...msg, isStreaming: mergeIsStreamingOnHistoryReplace(msg, historyMsg) };
          replacedHistoryCount++;
        } else {
          reconciledToHistoryCount++;
        }
        continue;
      }
    }

    const fallbackHistoryIndex = findFallbackHistoryMatchIndex(
      msg,
      currentIndex,
      currentMsgs,
      historyMsgs,
      mergedMsgs,
      currentCatInvocations,
    );
    if (fallbackHistoryIndex !== undefined) {
      const historyMsg = mergedMsgs[fallbackHistoryIndex]!;
      if (shouldPreferCurrentMessage(msg, historyMsg)) {
        mergedMsgs[fallbackHistoryIndex] = { ...msg, isStreaming: mergeIsStreamingOnHistoryReplace(msg, historyMsg) };
        replacedHistoryCount++;
      } else {
        reconciledToHistoryCount++;
      }
      continue;
    }

    mergedMsgs.push(msg);
    preservedLocalCount++;
  }

  const sorted = mergedMsgs.sort(compareMessagesByOrder);
  return {
    messages: sanitizeOrphanStreamingDrafts(sorted, currentCatInvocations),
    stats: {
      preservedLocalCount,
      reconciledToHistoryCount,
      replacedHistoryCount,
    },
  };
}

/**
 * Hook for managing chat history: fetching, pagination, scroll handling.
 * Extracted from ChatContainer to reduce component size.
 *
 * @param threadId - The active thread ID (from URL route param).
 */
export function useChatHistory(threadId: string) {
  const {
    messages,
    isLoadingHistory,
    hasMore,
    prependHistory,
    replaceMessages,
    setLoadingHistory,
    clearMessages,
    addMessageToThread,
    setAgentInvocation,
    replaceThreadTargetAgents,
    updateThreadAgentStatus,
    setQueue,
    setQueuePaused,
    addActiveInvocation,
    setHasActiveInvocation,
  } = useChatStore();
  const { setTasks } = useTaskStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll state for prepend handling
  const prevFirstIdRef = useRef<string | null>(null);
  const prevCountRef = useRef(0);
  const scrollSnapshotRef = useRef<number | null>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const autoFollowRafRef = useRef<number | null>(null);
  /** After switching threads, snap to the latest messages once hydration settles. */
  const pendingScrollToBottomRef = useRef(false);
  const liveRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedLiveRefreshRef = useRef<{ messages: boolean; panels: boolean }>({ messages: false, panels: false });
  const lastLoadedThreadRef = useRef<{ threadId: string; count: number } | null>(null);
  const lastThreadSwitchHintSignatureRef = useRef<string | null>(null);
  const reconnectDropRetryAtRef = useRef<Map<string, number>>(new Map());

  // Track loading guard per-thread to prevent double-fetch
  const loadingRef = useRef(false);

  // P1 fix: AbortController to cancel in-flight requests on thread switch
  const abortRef = useRef<AbortController | null>(null);
  // Always-current threadId for stale response checks
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;

  const cancelPendingRestore = useCallback(() => {
    if (restoreFrameRef.current !== null) {
      cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    }
  }, []);

  const cancelLiveRefresh = useCallback(() => {
    if (liveRefreshTimerRef.current !== null) {
      clearTimeout(liveRefreshTimerRef.current);
      liveRefreshTimerRef.current = null;
    }
  }, []);

  const scheduleRestore = useCallback(
    (saved: SavedScrollState) => {
      cancelPendingRestore();
      let framesRemaining = MAX_RESTORE_FRAMES;
      // Capture threadId at schedule time so a stale callback can't mutate
      // the next thread's scroll state if it fires before effect cleanup.
      const scheduledForThread = threadIdRef.current;

      const apply = () => {
        // Stale guard: if thread switched before cleanup cancelled us, no-op.
        if (threadIdRef.current !== scheduledForThread) {
          restoreFrameRef.current = null;
          return;
        }

        const el = scrollContainerRef.current;
        if (!el) {
          restoreFrameRef.current = null;
          return;
        }

        const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
        const targetTop = saved.anchor === 'bottom' ? maxTop : Math.min(saved.top, maxTop);
        el.scrollTop = targetTop;

        const canSettle = saved.anchor === 'bottom' ? maxTop > 0 : maxTop >= saved.top;
        const reachedTarget = Math.abs(el.scrollTop - targetTop) <= 1;

        if ((canSettle && reachedTarget) || framesRemaining <= 0) {
          rememberScrollState(scheduledForThread, el);
          restoreFrameRef.current = null;
          return;
        }

        framesRemaining -= 1;
        restoreFrameRef.current = requestAnimationFrame(apply);
      };

      restoreFrameRef.current = requestAnimationFrame(apply);
    },
    [cancelPendingRestore],
  );

  // Fetch history page from API
  // When replace=true, clears existing messages before setting (used for force-refresh).
  const fetchHistory = useCallback(
    async (cursor?: string, options?: { replace?: boolean; replaceSource?: string }) => {
      if (loadingRef.current) return;
      const controller = abortRef.current;
      if (!controller) return;

      loadingRef.current = true;
      // live_refresh 是 WebSocket 重连时的静默后台刷新，不触发 loading 状态
      // 因为 bootstrap 已经处理了切换会话时的 loading
      if (options?.replaceSource !== 'live_refresh') {
        setLoadingHistory(true);
      }
      const fetchForThread = threadId; // capture at call time
      try {
        const isExport =
          typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('export') === 'true';
        const limit = isExport ? EXPORT_LIMIT : HISTORY_PAGE_SIZE;
        const params = new URLSearchParams({ limit: String(limit) });
        if (cursor) params.set('before', cursor);
        params.set('threadId', fetchForThread);
        const res = await apiFetch(`/api/messages?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        // Stale check: discard if thread changed during fetch
        if (threadIdRef.current !== fetchForThread) return;
        const data = await res.json();
        const historyMsgs = (data.messages ?? []).filter((m) => !isSchedulerPlaceholderMessage(m)).map(
            (m: {
              id: string;
              type: string;
              agentId?: string;
              content: string;
              contentBlocks?: unknown[];
              toolEvents?: unknown[];
              metadata?: { provider: string; model: string; sessionId?: string };
              origin?: 'stream' | 'callback';
              thinking?: string;
              extra?: {
                rich?: { v: number; blocks: unknown[] };
                crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
                stream?: { invocationId?: string };
                taskRuns?: import('@openjiuwen/relay-shared').TaskRunPersistExtra;
              };
              timestamp: number;
              visibility?: 'public' | 'whisper';
              whisperTo?: string[];
              revealedAt?: number;
              isDraft?: boolean;
              source?: { connector: string; label: string; icon: string; url?: string };
              mentionsUser?: boolean;
              deliveredAt?: number;
              replyTo?: string;
              replyPreview?: { senderAgentId: string | null; content: string; deleted?: true };
            }) =>
              ({
                id: m.id,
                type: (m.type === 'system'
                  ? 'system'
                  : m.source
                    ? isUserChannelConnector(m.source.connector)
                      ? 'user'
                      : 'connector'
                    : m.agentId
                      ? 'assistant'
                      : 'user') as 'user' | 'assistant' | 'system' | 'connector',
                agentId: m.agentId,
                content: m.content,
                ...(m.contentBlocks ? { contentBlocks: m.contentBlocks } : {}),
                ...(m.toolEvents ? { toolEvents: normalizeHistoryToolEvents(m.toolEvents) } : {}),
                ...(m.metadata ? { metadata: m.metadata } : {}),
                ...(m.origin ? { origin: m.origin } : {}),
                ...(m.thinking ? { thinking: m.thinking } : {}),
                ...(m.extra?.rich || m.extra?.crossPost || m.extra?.stream || m.extra?.taskRuns
                  ? {
                    extra: {
                      ...(m.extra.rich ? { rich: m.extra.rich } : {}),
                      ...(m.extra.crossPost ? { crossPost: m.extra.crossPost } : {}),
                      ...(m.extra.stream ? { stream: m.extra.stream } : {}),
                      ...(m.extra.taskRuns ? { taskRuns: m.extra.taskRuns } : {}),
                    },
                  }
                  : {}),
                ...(m.visibility ? { visibility: m.visibility } : {}),
                ...(m.whisperTo ? { whisperTo: m.whisperTo } : {}),
                ...(m.revealedAt ? { revealedAt: m.revealedAt } : {}),
                ...(m.deliveredAt ? { deliveredAt: m.deliveredAt } : {}),
                ...(m.source ? { source: m.source } : {}),
                ...(m.mentionsUser ? { mentionsUser: true } : {}),
                ...(m.replyTo ? { replyTo: m.replyTo } : {}),
                ...(m.replyPreview ? { replyPreview: m.replyPreview } : {}),
                // #80: Restore streaming indicator for draft messages recovered from Redis
                ...(m.isDraft ? { isStreaming: true } : {}),
                timestamp: m.timestamp,
              }) as ChatMessageData,
          );
        const isFirstPage = !cursor;
        const previousLoaded = lastLoadedThreadRef.current;
        const shouldShowThreadSwitchHint = Boolean(
          isFirstPage &&
            previousLoaded &&
            previousLoaded.threadId !== fetchForThread &&
            previousLoaded.count >= THREAD_SWITCH_HINT_PREV_MIN_MESSAGES &&
            historyMsgs.length <= THREAD_SWITCH_HINT_CURRENT_MAX_MESSAGES,
        );
        const threadSwitchHintSignature =
          shouldShowThreadSwitchHint && previousLoaded
            ? `${previousLoaded.threadId}->${fetchForThread}:${historyMsgs.length}`
            : null;
        const threadSwitchHintContent =
          shouldShowThreadSwitchHint && previousLoaded
            ? `当前会话 threadId=${fetchForThread}，上一会话 threadId=${previousLoaded.threadId}。当前仅加载到 ${historyMsgs.length} 条消息；如果感觉内容消失，请检查是否切到了新线程。`
            : null;

        if (isFirstPage) {
          lastLoadedThreadRef.current = { threadId: fetchForThread, count: historyMsgs.length };
        }

        if (options?.replace) {
          // Replace mode now does a non-destructive merge first, then resets the thread
          // snapshot to the merged result in one step. The clear is no longer "drop
          // everything and trust history", it is "replace the stale cache with the
          // merged timeline we just computed". By the time this async callback runs,
          // setCurrentThread has already executed, so clearMessages targets the
          // correct thread.
          const currentState = useChatStore.getState();
          const mergeResult = mergeReplaceHydrationMessages(
            historyMsgs,
            currentState.messages,
            currentState.agentInvocations,
          );
          const mergedMsgs = mergeResult.messages;
          recordDebugEvent({
            event: 'history_replace',
            threadId: fetchForThread,
            action:
              mergeResult.stats.preservedLocalCount > 0 || mergeResult.stats.replacedHistoryCount > 0
                ? 'merge_local'
                : mergeResult.stats.reconciledToHistoryCount > 0
                  ? 'reconcile_history'
                  : 'replace_exact',
            queueLength: mergedMsgs.length,
            reason: [
              `history=${historyMsgs.length}`,
              `current=${currentState.messages.length}`,
              `preservedLocal=${mergeResult.stats.preservedLocalCount}`,
              `reconciledToHistory=${mergeResult.stats.reconciledToHistoryCount}`,
              `replacedHistory=${mergeResult.stats.replacedHistoryCount}`,
            ].join(','),
          });
          const shouldRetryReconnectDrop = Boolean(
            isFirstPage &&
              options?.replaceSource === 'live_refresh' &&
              currentState.messages.length >= RECONNECT_DROP_PREV_MIN_MESSAGES &&
              mergedMsgs.length <= RECONNECT_DROP_CURRENT_MAX_MESSAGES,
          );
          if (shouldRetryReconnectDrop) {
            const now = Date.now();
            const lastRetryAt = reconnectDropRetryAtRef.current.get(fetchForThread) ?? 0;
            if (now - lastRetryAt >= RECONNECT_DROP_RETRY_COOLDOWN_MS) {
              reconnectDropRetryAtRef.current.set(fetchForThread, now);
              addMessageToThread(fetchForThread, {
                id: `sysinfo-reconnect-drop-${now}`,
                type: 'system',
                variant: 'info',
                content: `当前会话 threadId=${fetchForThread} 在重连补拉后消息从 ${currentState.messages.length} 条降到 ${mergedMsgs.length} 条。已自动发起一次重试补拉；如仍异常，请确认是否切到了其他线程。`,
                timestamp: now,
              });
              requestThreadLiveRefresh(fetchForThread, 'messages', 'reconnect-drop-retry');
            }
            // Keep current UI stable and avoid destructive shrink on reconnect races.
            return;
          }
          replaceMessages(mergedMsgs, data.hasMore ?? false, fetchForThread);
          if (fetchForThread === threadIdRef.current) {
            pendingScrollToBottomRef.current = true;
            scrollPositionsByThread.set(fetchForThread, { top: 0, anchor: 'bottom' });
          }

          // 从正在流式传输的历史消息中恢复 invocation 状态
          // 确保后续 socket.io 消息能正确匹配到历史气泡
          const streamingAssistantMsgs = mergedMsgs.filter(
            (m) => m.type === 'assistant' && (m.isStreaming || m.id.startsWith('draft-')) && m.extra?.stream?.invocationId
          );
          for (const streamingMsg of streamingAssistantMsgs) {
            const invocationId = streamingMsg.extra!.stream!.invocationId;
            const agentId = streamingMsg.agentId;
            if (agentId && invocationId) {
              // 恢复 catInvocation 状态，让 socket.io 消息能匹配到这个气泡
              setAgentInvocation(agentId, { invocationId });
              // 如果 store 中没有活跃 invocation 记录，添加一个
              if (!currentState.activeInvocations?.[invocationId]) {
                addActiveInvocation(invocationId, agentId, 'execute');
              }
            }
          }
          if (streamingAssistantMsgs.length > 0) {
            setHasActiveInvocation(true);
          }

          if (
            threadSwitchHintContent &&
            threadSwitchHintSignature &&
            lastThreadSwitchHintSignatureRef.current !== threadSwitchHintSignature
          ) {
            addMessageToThread(fetchForThread, {
              id: `sysinfo-thread-switch-${Date.now()}`,
              type: 'system',
              variant: 'info',
              content: threadSwitchHintContent,
              timestamp: Date.now(),
            });
            lastThreadSwitchHintSignatureRef.current = threadSwitchHintSignature;
          }
          return;
        }
        prependHistory(historyMsgs, data.hasMore ?? false, fetchForThread);
        if (!cursor && fetchForThread === threadIdRef.current) {
          pendingScrollToBottomRef.current = true;
        }
        if (
          threadSwitchHintContent &&
          threadSwitchHintSignature &&
          lastThreadSwitchHintSignatureRef.current !== threadSwitchHintSignature
        ) {
          addMessageToThread(fetchForThread, {
            id: `sysinfo-thread-switch-${Date.now()}`,
            type: 'system',
            variant: 'info',
            content: threadSwitchHintContent,
            timestamp: Date.now(),
          });
          lastThreadSwitchHintSignatureRef.current = threadSwitchHintSignature;
        }
      } catch (err) {
        // AbortError is expected during thread switch — ignore silently
        if (isAbortError(err)) return;
      } finally {
        // Do not let stale/aborted request clear loading state for a newer thread request.
        if (abortRef.current === controller && threadIdRef.current === fetchForThread) {
          loadingRef.current = false;
          setLoadingHistory(false);
        }
      }
    },
    [setLoadingHistory, prependHistory, replaceMessages, addMessageToThread, setAgentInvocation, addActiveInvocation, setHasActiveInvocation, threadId],
  );

  const fetchTasks = useCallback(async () => {
    const fetchForThread = threadId;
    const controller = abortRef.current;
    if (!controller) return;

    try {
      const res = await apiFetch(`/api/tasks?threadId=${encodeURIComponent(fetchForThread)}`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      if (abortRef.current !== controller) return;
      if (threadIdRef.current !== fetchForThread) return;
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }, [threadId, setTasks]);

  // F045: Fetch cached task progress on mount to restore Plan Checklist after page refresh
  const fetchTaskProgress = useCallback(async () => {
    const fetchForThread = threadId;
    const controller = abortRef.current;
    if (!controller) return;

    try {
      const res = await apiFetch(`/api/threads/${encodeURIComponent(fetchForThread)}/task-progress`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      if (abortRef.current !== controller) return;
      if (threadIdRef.current !== fetchForThread) return;
      const data = (await res.json()) as {
        taskProgress?: Record<
          string,
          {
            tasks: Array<{ id: string; subject: string; status: string; activeForm?: string }>;
            status?: 'running' | 'completed' | 'interrupted';
            updatedAt?: number;
            lastInvocationId?: string;
            interruptReason?: string;
          }
        >;
      };
      if (data.taskProgress) {
        const restoredCats: string[] = [];
        for (const [agentId, progress] of Object.entries(data.taskProgress)) {
          setAgentInvocation(agentId, {
            taskProgress: {
              tasks: progress.tasks.map(
                (t): TaskProgressItem => ({
                  id: t.id,
                  subject: t.subject,
                  status:
                    t.status === 'in_progress' ? 'in_progress' : t.status === 'completed' ? 'completed' : 'pending',
                  ...(t.activeForm ? { activeForm: t.activeForm } : {}),
                }),
              ),
              lastUpdate: progress.updatedAt ?? Date.now(),
              ...(progress.status ? { snapshotStatus: progress.status } : {}),
              ...(progress.lastInvocationId ? { lastInvocationId: progress.lastInvocationId } : {}),
              ...(progress.interruptReason ? { interruptReason: progress.interruptReason } : {}),
            },
          });
          // Only restore cats that still look active.
          // Completed snapshots should remain in history, not current targetAgents.
          const hasTasks = progress.tasks.length > 0;
          const isCompletedSnapshot = progress.status === 'completed';
          if (hasTasks && !isCompletedSnapshot) {
            restoredCats.push(agentId);
          }
        }
        // Restore targetAgents so RightStatusPanel shows the Plan Checklist.
        // Only restore if no live targetAgents exist — avoids overwriting fresh
        // intent_mode socket events when the HTTP response arrives late.
        const currentTargets = useChatStore.getState().targetAgents;
        if (restoredCats.length > 0 && currentTargets.length === 0) {
          replaceThreadTargetAgents(fetchForThread, restoredCats);
        }
      }
    } catch (err) {
      if (isAbortError(err)) return;
    }
  }, [threadId, setAgentInvocation, replaceThreadTargetAgents]);

  // F39 Bug 1: Fetch queue state on mount/thread-switch to survive F5 refresh
  const fetchQueue = useCallback(async () => {
    const fetchForThread = threadId;
    const controller = abortRef.current;
    if (!controller) return;

    try {
      const res = await apiFetch(`/api/threads/${encodeURIComponent(fetchForThread)}/queue`, {
        signal: controller.signal,
      });
      if (!res.ok) return;
      if (abortRef.current !== controller) return;
      if (threadIdRef.current !== fetchForThread) return;
      const data = (await res.json()) as {
        queue: QueueEntry[];
        paused: boolean;
        pauseReason?: 'canceled' | 'failed';
        activeInvocations?: string[];
      };
      // Always sync server state — clears stale local data when server queue is empty
      setQueue(fetchForThread, data.queue);
      setQueuePaused(fetchForThread, data.paused, data.pauseReason);
      // Issue #83: Reconcile processing state from server-side InvocationTracker.
      // Uses thread-scoped APIs so it works correctly for both active and background threads,
      // and always overwrites stale snapshots restored by setCurrentThread().
      const store = useChatStore.getState();
      if (data.activeInvocations && data.activeInvocations.length > 0) {
        replaceThreadTargetAgents(fetchForThread, data.activeInvocations);
        for (const agentId of data.activeInvocations) {
          updateThreadAgentStatus(fetchForThread, agentId, 'streaming');
        }
        store.setThreadHasActiveInvocation(fetchForThread, true);
      } else {
        // Server says no active invocations — clear any stale processing state
        // that may have been restored from a threadStates snapshot.
        // clearThreadActiveInvocation clears BOTH hasActiveInvocation boolean
        // AND the activeInvocations slot map, preventing re-derivation bugs.
        store.clearThreadActiveInvocation(fetchForThread);
        replaceThreadTargetAgents(fetchForThread, []);
        // Align message-level isStreaming with server idle (faster than waiting for
        // useSocket's reconnect reconcile + delay), avoiding ~1s tool loading flash on F5.
        if (store.currentThreadId === fetchForThread) {
          for (const m of store.messages) {
            if (m.type === 'assistant' && m.isStreaming) {
              store.setStreaming(m.id, false);
            }
          }
        } else {
          const ts = store.threadStates[fetchForThread];
          if (ts?.messages) {
            for (const m of ts.messages) {
              if (m.type === 'assistant' && m.isStreaming) {
                store.setThreadMessageStreaming(fetchForThread, m.id, false);
              }
            }
          }
        }
      }
    } catch (err) {
      if (isAbortError(err)) return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, setQueue, setQueuePaused, updateThreadAgentStatus]);

  const flushLiveRefresh = useCallback(() => {
    cancelLiveRefresh();
    const queued = queuedLiveRefreshRef.current;
    if (!queued.messages && !queued.panels) return;

    const controller = abortRef.current;
    if (!controller || controller.signal.aborted || threadIdRef.current !== threadId || loadingRef.current) {
      liveRefreshTimerRef.current = setTimeout(() => {
        flushLiveRefresh();
      }, LIVE_THREAD_REFRESH_DEBOUNCE_MS);
      return;
    }

    queuedLiveRefreshRef.current = { messages: false, panels: false };
    if (queued.messages) {
      void fetchHistory(undefined, { replace: true, replaceSource: 'live_refresh' });
    }
    if (queued.panels) {
      void fetchTasks();
      void fetchTaskProgress();
      void fetchQueue();
    }
  }, [cancelLiveRefresh, fetchHistory, fetchQueue, fetchTaskProgress, fetchTasks, threadId]);

  const scheduleLiveRefresh = useCallback(
    (scope: ThreadLiveRefreshScope = 'all') => {
      if (scope === 'all' || scope === 'messages') {
        queuedLiveRefreshRef.current.messages = true;
      }
      if (scope === 'all' || scope === 'panels') {
        queuedLiveRefreshRef.current.panels = true;
      }
      if (liveRefreshTimerRef.current !== null) return;
      liveRefreshTimerRef.current = setTimeout(() => {
        flushLiveRefresh();
      }, LIVE_THREAD_REFRESH_DEBOUNCE_MS);
    },
    [flushLiveRefresh],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ThreadLiveRefreshDetail>).detail;
      if (!detail || detail.threadId !== threadId) return;
      scheduleLiveRefresh(detail.scope ?? 'all');
    };
    window.addEventListener(THREAD_LIVE_REFRESH_EVENT, handler as EventListener);
    return () => window.removeEventListener(THREAD_LIVE_REFRESH_EVENT, handler as EventListener);
  }, [scheduleLiveRefresh, threadId]);

  // Load history + tasks when threadId changes (handles initial mount and navigation)
  useEffect(() => {
    // Abort any in-flight requests from previous thread
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    loadingRef.current = false;
    cancelLiveRefresh();
    cancelPendingRestore();
    queuedLiveRefreshRef.current = { messages: false, panels: false };
    pendingScrollToBottomRef.current = true;
    prevCountRef.current = 0;
    prevFirstIdRef.current = null;
    scrollSnapshotRef.current = null;
    scrollPositionsByThread.set(threadId, { top: 0, anchor: 'bottom' });
    const controller = abortRef.current;

    // Check if this thread has cached messages in the threadStates map.
    // If so, the store's setCurrentThread already restored them — skip API fetch.
    const state = useChatStore.getState();
    const cached = state.threadStates[threadId];
    const hasCachedMessages = cached && cached.messages.length > 0;
    const isThreadSynced = state.currentThreadId === threadId;

    // #80 fix-A: If the thread has an active invocation, force-refresh from API
    // so that DraftStore drafts are merged into the response. Without this,
    // switching away and back shows stale cached messages (no streaming draft).
    const hasActiveInvocation = cached?.hasActiveInvocation === true;
    const hasUnstableBubbleIdentity = cached ? shouldForceReplaceHydrationForCachedMessages(cached.messages) : false;
    let secondaryHydrationStarted = false;
    const hydrateSecondaryPanels = () => {
      if (secondaryHydrationStarted) return;
      secondaryHydrationStarted = true;
      if (abortRef.current !== controller || threadIdRef.current !== threadId) return;
      if (controller.signal.aborted) return;
      void fetchTasks();
      void fetchTaskProgress();
      // fetchQueue: fired at bootstrap start (parallel to fetchHistory) so idle server →
      // clear stale isStreaming without waiting for secondary delay; don't duplicate.
    };

    const secondaryFallbackTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
      hydrateSecondaryPanels();
    }, SECONDARY_HYDRATION_FALLBACK_MS);

    const bootstrap = async () => {
      try {
        if (!hasCachedMessages) {
          // During route thread switches, this effect can run before setCurrentThread.
          // Clearing too early would wipe the previous thread snapshot in the store.
          if (isThreadSynced) {
            clearMessages();
          }
          await fetchHistory();
        } else if (hasActiveInvocation || (cached && cached.unreadCount > 0) || hasUnstableBubbleIdentity) {
          // #80 fix-A P1: Force-refresh with replace mode — the async response handler
          // will clear stale cache after setCurrentThread has run, then set fresh data
          // including DraftStore drafts in correct timestamp order.
          // F069-R4: Also force-refresh when the thread has unread messages. Without this,
          // the cached message list may lack the server's latest real messages, causing
          // the read-ack in ChatContainer to send an old sortable ID — the server still
          // counts messages after that ID as unread, and the badge reappears.
          // F123: If the cached snapshot already contains unstable bubble identity
          // (duplicate same-invocation bubbles or local-only draft/stream state),
          // thread switch must reconcile against authoritative history instead of
          // trusting the cached timeline until a later F5.
          await fetchHistory(undefined, { replace: true, replaceSource: 'bootstrap_or_cache' });
        }
      } finally {
        // After messages are loaded (or cache preserved), align idle server vs local isStreaming
        // before tasks/progress. Avoids F5 时工具先转圈再等 socket reconcile 的闪动.
        void fetchQueue();
        // Prioritize first-screen messages, then hydrate secondary panels.
        hydrateSecondaryPanels();
      }
    };

    void bootstrap();

    return () => {
      // Scroll save is now done during render (before DOM commit), not here.
      clearTimeout(secondaryFallbackTimer);
      cancelPendingRestore();
      cancelLiveRefresh();
      queuedLiveRefreshRef.current = { messages: false, panels: false };
      abortRef.current?.abort();
    };
  }, [
    threadId,
    cancelLiveRefresh,
    cancelPendingRestore,
    clearMessages,
    fetchHistory,
    fetchQueue,
    fetchTaskProgress,
    fetchTasks,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Thread switch: scroll to bottom after messages are visible (not the previous thread's offset).
  useEffect(() => {
    if (!pendingScrollToBottomRef.current) return;
    const storeThreadId = useChatStore.getState().currentThreadId;
    if (storeThreadId !== threadId) return;
    if (isLoadingHistory) return;
    if (messages.length === 0 && hasMore) return;

    pendingScrollToBottomRef.current = false;
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        scheduleRestore({ top: 0, anchor: 'bottom' });
      });
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      if (innerRaf) cancelAnimationFrame(innerRaf);
    };
  }, [threadId, isLoadingHistory, messages.length, hasMore, scheduleRestore, messages]);

  // Bug C safety net: when useAgentMessages detects done(isFinal) with no
  // streaming bubble, it bumps streamCatchUpVersion with a target threadId.
  // Only fetch if this hook's threadId matches the request (P1: thread-scoped).
  const catchUpVersion = useChatStore((s) => s.streamCatchUpVersion);
  const catchUpThreadId = useChatStore((s) => s.streamCatchUpThreadId);
  useEffect(() => {
    if (catchUpVersion === 0) return; // Skip initial render
    if (catchUpThreadId !== threadId) return; // P1: only act for matching thread
    // Small delay: backend may still be persisting the final message
    const timer = setTimeout(() => {
      void fetchHistory(undefined, { replace: true, replaceSource: 'stream_catchup' });
    }, 600);
    return () => clearTimeout(timer);
  }, [catchUpVersion, catchUpThreadId, threadId, fetchHistory]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      messagesEndRef.current?.scrollIntoView({ behavior });
      const el = scrollContainerRef.current;
      if (el) {
        scrollPositionsByThread.set(threadId, { top: el.scrollTop, anchor: 'bottom' });
      }
    },
    [threadId],
  );

  const followLayoutChangeIfPinned = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      if (scrollPositionsByThread.get(threadId)?.anchor !== 'bottom') return;
      if (autoFollowRafRef.current !== null) {
        cancelAnimationFrame(autoFollowRafRef.current);
      }
      autoFollowRafRef.current = requestAnimationFrame(() => {
        autoFollowRafRef.current = null;
        messagesEndRef.current?.scrollIntoView({ behavior });
        const scroller = scrollContainerRef.current;
        if (scroller) {
          scrollPositionsByThread.set(threadId, { top: scroller.scrollTop, anchor: 'bottom' });
        }
      });
    },
    [threadId],
  );

  // Snapshot scroll height before history load
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el && isLoadingHistory) {
      scrollSnapshotRef.current = el.scrollHeight;
    }
  }, [isLoadingHistory]);

  // Scroll adjustment after messages change
  useEffect(() => {
    const el = scrollContainerRef.current;

    if (messages.length === 0) return;

    // Wait for store to sync before acting on scroll.
    // On remount, threadId (prop) updates immediately but store.currentThreadId
    // is still the OLD thread until ChatContainer's useEffect calls setCurrentThread().
    // If we act now, we'd restore scroll on the wrong DOM content, then the store
    // swap re-render would trigger append-case scrollIntoView → position lost.
    // By returning early (without updating tracking refs), we ensure the NEXT
    // effect run (after store sync) still sees prevCount=0 and does the restore.
    const storeThreadId = useChatStore.getState().currentThreadId;
    if (storeThreadId !== threadId) return;

    const prevCount = prevCountRef.current;
    const prevFirstId = prevFirstIdRef.current;
    const currentFirstId = messages[0].id;

    prevCountRef.current = messages.length;
    prevFirstIdRef.current = currentFirstId;

    // Initial load (includes remount after thread switch — prevCountRef resets to 0).
    // Check module-level Map for a saved position before scrolling to bottom.
    if (prevCount === 0) {
      scheduleRestore(scrollPositionsByThread.get(threadId) ?? { top: 0, anchor: 'bottom' });
      return;
    }

    // Prepend case - maintain scroll position
    if (prevFirstId && currentFirstId !== prevFirstId && el && scrollSnapshotRef.current !== null) {
      const heightDelta = el.scrollHeight - scrollSnapshotRef.current;
      el.scrollTop += heightDelta;
      scrollSnapshotRef.current = null;
      rememberScrollState(threadId, el);
      return;
    }

    // Append case: only auto-follow when the user intentionally stayed at bottom.
    if (messages.length > prevCount) {
      const saved = scrollPositionsByThread.get(threadId);
      if (saved?.anchor === 'bottom') {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        if (el) {
          scrollPositionsByThread.set(threadId, {
            top: el.scrollTop,
            anchor: 'bottom',
          });
        }
      }
      return;
    }

    const saved = scrollPositionsByThread.get(threadId);
    if (saved?.anchor === 'bottom') {
      if (autoFollowRafRef.current !== null) return;
      autoFollowRafRef.current = requestAnimationFrame(() => {
        autoFollowRafRef.current = null;
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        const scroller = scrollContainerRef.current;
        if (scroller) {
          scrollPositionsByThread.set(threadId, { top: scroller.scrollTop, anchor: 'bottom' });
        }
      });
    }
  }, [messages, scheduleRestore, threadId]);

  useEffect(() => {
    return () => {
      if (autoFollowRafRef.current !== null) {
        cancelAnimationFrame(autoFollowRafRef.current);
        autoFollowRafRef.current = null;
      }
      cancelLiveRefresh();
    };
  }, [cancelLiveRefresh]);

  // Load more when scrolled to top; continuous scroll position save
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // Continuously save scroll position for this thread.
    // Guard: don't save during store swap (DOM content may not match threadId,
    // and browser may fire scroll events with scrollTop=0 during content swap).
    if (useChatStore.getState().currentThreadId === threadIdRef.current) {
      rememberScrollState(threadIdRef.current, el);
    }

    if (!hasMore || isLoadingHistory) return;
    if (el.scrollTop < 80 && messages.length > 0) {
      // #80 cloud R8 P2: skip draft rows — their synthetic IDs break cursor semantics
      const oldest = messages.find((m) => !m.id.startsWith('draft-'));
      if (oldest) {
        void fetchHistory(`${oldest.deliveredAt ?? oldest.timestamp}:${oldest.id}`);
      }
    }
  }, [hasMore, isLoadingHistory, messages, fetchHistory]);

  return {
    handleScroll,
    scrollContainerRef,
    messagesEndRef,
    scrollToBottom,
    followLayoutChangeIfPinned,
    isLoadingHistory,
    hasMore,
  };
}
