/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  bootstrapDebugFromStorage,
  ensureWindowDebugApi,
  isDebugEnabled,
  recordDebugEvent,
} from '@/debug/invocationEventDebug';
import { useAuthorizationPendingStore } from '@/stores/authorizationPendingStore';
import type { PendingAskUserQuestion } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { API_URL, apiFetch } from '@/utils/api-client';
import { notifyOnTaskComplete, notifyToolApprovalRequest } from '@/utils/desktop-notification';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';
import { getUserId } from '@/utils/userId';
import { requestThreadLiveRefresh } from './thread-live-refresh';
import {
  type BackgroundAgentMessage,
  clearBackgroundStreamRefForActiveEvent,
  handleBackgroundAgentMessage,
} from './useSocket-background';
import { loadJoinedRoomsFromSession, saveJoinedRoomsToSession } from './useSocket-persistence';
import { handleVoiceChunk, handleVoiceStreamEnd, handleVoiceStreamStart } from './useVoiceStream';

interface AgentMessage {
  type: string;
  agentId: string;
  threadId?: string;
  content?: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  isFinal?: boolean;
  metadata?: { provider: string; model: string; sessionId?: string; usage?: import('../stores/chat-types').TokenUsage };
  /** Message origin: stream = CLI stdout (thinking), callback = MCP post_message (speech) */
  origin?: 'stream' | 'callback';
  /** F121: ID of the message this message is replying to */
  replyTo?: string;
  /** F121: Hydrated preview of the replied-to message */
  replyPreview?: { senderAgentId: string | null; content: string; deleted?: true };
  /** F108: Invocation ID — distinguishes messages from concurrent invocations */
  invocationId?: string;
  timestamp: number;
  taskContext?: { id: string; title?: string; index?: number; total?: number };
  taskPhase?: 'start' | 'complete';
}

interface ConnectorMessageEvent {
  threadId: string;
  message: {
    id: string;
    type: 'connector';
    content: string;
    source?: import('../stores/chat-types').ConnectorSourceData;
    extra?: Record<string, unknown>;
    timestamp: number;
  };
}

const USER_CHANNEL_CONNECTORS = new Set(['weixin', 'xiaoyi', 'feishu', 'dingtalk']);

function isUserChannelConnector(connectorId?: string): boolean {
  return typeof connectorId === 'string' && USER_CHANNEL_CONNECTORS.has(connectorId);
}

function readStringField(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function registerAndNotifyAuthorizationRequest(data: Record<string, unknown>): void {
  const requestId = readStringField(data.requestId);
  const threadId = readStringField(data.threadId);
  if (!requestId || !threadId) return;

  useAuthorizationPendingStore.getState().registerPending(threadId, requestId);
  notifyToolApprovalRequest({
    requestId,
    threadId,
    catId: readStringField(data.agentId) ?? readStringField(data.catId) ?? '智能体',
    action: readStringField(data.action) ?? '工具调用',
    reason: readStringField(data.reason) ?? '需要你的审批',
  });
}

interface SocketIoTransportLike {
  name?: string;
  ws?: WebSocket;
}

interface SocketIoEngineLike {
  transport?: SocketIoTransportLike;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
}

type DebugWebSocket = WebSocket & { __catCafeCloseLoggerAttached?: boolean };
type JoinRoomAwaitStatus = 'joined' | 'timed_out' | 'socket_unavailable';

const ROOM_JOIN_ACK_TIMEOUT_MS = 500;
const ROOM_JOIN_POLL_INTERVAL_MS = 25;
const ROOM_JOIN_SETTLE_MS = 80;
const MISSING_THREAD_ID_RECOVERY_THROTTLE_MS = 1200;
const MISSING_THREAD_ID_BUFFER_TIMEOUT_MS = 700;

export interface SocketCallbacks {
  onMessage: (msg: AgentMessage) => void;
  onThreadCreated?: (data: { threadId: string; source?: string }) => void;
  onThreadUpdated?: (data: { threadId: string; title: string }) => void;
  onIntentMode?: (data: { threadId: string; mode: string; targetAgents: string[] }) => void;
  onTaskCreated?: (task: Record<string, unknown>) => void;
  onTaskUpdated?: (task: Record<string, unknown>) => void;
  onHeartbeat?: (data: { threadId: string; timestamp: number }) => void;
  onMessageDeleted?: (data: { messageId: string; threadId: string; deletedBy: string }) => void;
  onMessageRestored?: (data: { messageId: string; threadId: string }) => void;
  onThreadBranched?: (data: { sourceThreadId: string; newThreadId: string; fromMessageId: string }) => void;
  onAuthorizationRequest?: (data: {
    requestId: string;
    agentId: string;
    threadId: string;
    action: string;
    reason: string;
    context?: string;
    createdAt: number;
  }) => void;
  onAuthorizationResponse?: (data: { requestId: string; status: string; scope?: string; reason?: string }) => void;
  onAskUserQuestionRequest?: (data: PendingAskUserQuestion) => void;
  onAskUserQuestionResponse?: (data: { requestId: string; status: string }) => void;
  /** F101: Game state update */
  onGameStateUpdate?: (data: { gameId: string; view: unknown; timestamp: number }) => void;
  /** F101 Phase D: Independent game thread created */
  onGameThreadCreated?: (data: {
    gameThreadId: string;
    gameTitle: string;
    initiatorUserId: string;
    timestamp: number;
  }) => void;
  /** #80 fix-C: Clear the done-timeout guard (called when background thread completes) */
  clearDoneTimeout?: (threadId?: string) => void;
  /** F39: Queue updated */
  onQueueUpdated?: (data: {
    threadId: string;
    queue: import('../stores/chat-types').QueueEntry[];
    action: string;
  }) => void;
  /** F39: Queue paused */
  onQueuePaused?: (data: {
    threadId: string;
    reason: 'canceled' | 'failed';
    queue: import('../stores/chat-types').QueueEntry[];
  }) => void;
}

const RECONNECT_RECONCILE_DELAY_MS = 2000;

/** Generation counter: each reconnect increments, stale callbacks discard themselves. */
let reconcileGeneration = 0;

/**
 * After socket reconnect, bidirectionally reconcile invocation state with server.
 * Socket disconnect can lose done(isFinal) events (UI stuck in "replying") or
 * cause local state to drift from server truth. Fetches the queue endpoint and:
 * - Server has active cats → re-hydrate local slots to match (fixes ID mismatches)
 * - Server has no active cats → clear stale local invocation state
 */
function reconcileInvocationStateOnReconnect(activeThreadId: string | null): void {
  const generation = ++reconcileGeneration;
  const state = useChatStore.getState();

  // Collect threads to reconcile: always check the active thread (server might
  // still be processing even if local cleared state during disconnect), plus
  // any background threads that look busy (active invocation) or still have a
  // stuck streaming assistant bubble (isStreaming) — the latter can happen when
  // e.g. the client missed a terminal error on reconnect and hasActiveInvocation
  // is already false.
  const threadsToCheckSet = new Set<string>();
  if (activeThreadId) {
    threadsToCheckSet.add(activeThreadId);
  }
  for (const [threadId, ts] of Object.entries(state.threadStates ?? {})) {
    if (threadId === activeThreadId) continue;
    if (ts.hasActiveInvocation) {
      threadsToCheckSet.add(threadId);
    } else if (ts.messages?.some((m) => m.type === 'assistant' && m.isStreaming)) {
      threadsToCheckSet.add(threadId);
    }
  }
  const threadsToCheck = [...threadsToCheckSet];
  if (threadsToCheck.length === 0) return;

  // Small delay: let any buffered socket events arrive first
  setTimeout(async () => {
    // Discard if a newer reconnect has started its own reconciliation
    if (generation !== reconcileGeneration) return;
    for (const threadId of threadsToCheck) {
      if (generation !== reconcileGeneration) return;
      try {
        const res = await apiFetch(`/api/threads/${threadId}/queue`);
        if (generation !== reconcileGeneration) return; // stale after await
        if (!res.ok) continue;
        const data = (await res.json()) as {
          activeInvocations?: string[];
          queue?: import('../stores/chat-types').QueueEntry[];
          paused?: boolean;
          pauseReason?: 'canceled' | 'failed';
        };
        if (generation !== reconcileGeneration) return; // stale after await
        const store = useChatStore.getState();
        const serverActiveAgentIds =
          data.activeInvocations && data.activeInvocations.length > 0 ? data.activeInvocations : null;
        const isActiveThread = store.currentThreadId === threadId;

        if (serverActiveAgentIds) {
          // Server still processing — re-hydrate local slots to match server truth.
          // Stale hydrated/mismatched invocationIds get replaced so done(isFinal)
          // cleanup works correctly when the response finishes.
          store.clearThreadActiveInvocation(threadId);
          store.replaceThreadTargetAgents(threadId, serverActiveAgentIds);
          for (const agentId of serverActiveAgentIds) {
            store.updateThreadAgentStatus(threadId, agentId, 'streaming');
            const syntheticId = `hydrated-${threadId}-${agentId}`;
            if (isActiveThread) {
              store.addActiveInvocation(syntheticId, agentId, 'execute');
            } else {
              store.addThreadActiveInvocation(threadId, syntheticId, agentId, 'execute');
            }
          }
          console.log('[ws] Reconnect reconciliation: re-hydrated active slots from server', {
            threadId,
            agentIds: serverActiveAgentIds,
          });
          // Also sync queue state from server
          if (data.queue !== undefined) {
            store.setQueue(threadId, data.queue);
            if (data.paused !== undefined) {
              store.setQueuePaused(threadId, data.paused, data.pauseReason);
            }
          }
          continue;
        }

        if (isActiveThread) {
          const hadStuckStreamBubble = store.messages.some((m) => m.type === 'assistant' && m.isStreaming);
          if (store.hasActiveInvocation) {
            store.clearAllActiveInvocations();
            store.setLoading(false);
            store.setIntentMode(null);
            store.clearAgentStatuses();
            console.log('[ws] Reconnect reconciliation: cleared stale active-thread invocation state', { threadId });
          } else if (hadStuckStreamBubble) {
            store.clearAgentStatuses();
            console.log('[ws] Reconnect reconciliation: finalized stuck stream bubbles (server idle)', { threadId });
          }
          for (const msg of store.messages) {
            if (msg.type === 'assistant' && msg.isStreaming) {
              store.setStreaming(msg.id, false);
            }
          }
          // Sync queue state from server even when idle
          if (data.queue !== undefined) {
            store.setQueue(threadId, data.queue);
            if (data.paused !== undefined) {
              store.setQueuePaused(threadId, data.paused, data.pauseReason);
            }
          }
        } else {
          const ts = store.getThreadState(threadId);
          const hadStuckStreamBubble = ts.messages.some((m) => m.type === 'assistant' && m.isStreaming);
          if (ts.hasActiveInvocation) {
            store.clearThreadActiveInvocation(threadId);
            store.setThreadLoading(threadId, false);
            console.log('[ws] Reconnect reconciliation: cleared stale background-thread invocation state', {
              threadId,
            });
          } else if (hadStuckStreamBubble) {
            console.log('[ws] Reconnect reconciliation: finalized stuck background stream bubbles (server idle)', {
              threadId,
            });
          }
          for (const msg of ts.messages) {
            if (msg.type === 'assistant' && msg.isStreaming) {
              store.setThreadMessageStreaming(threadId, msg.id, false);
            }
          }
        }
      } catch {
        // Non-critical — don't break reconnect flow
      }
    }
  }, RECONNECT_RECONCILE_DELAY_MS);
}

export function useSocket(callbacks: SocketCallbacks, threadId?: string, watchedThreadIds: string[] = []) {
  const socketRef = useRef<Socket | null>(null);
  const joinedRoomsRef = useRef<Set<string>>(new Set());
  const bgStreamRefsRef = useRef<Map<string, { id: string; threadId: string; agentId: string }>>(new Map());
  const bgReplacedInvocationsRef = useRef<Map<string, string>>(new Map());
  const bgErrorToastsShownRef = useRef<Set<string>>(new Set());
  const bgFinalizedRefsRef = useRef<Map<string, string>>(new Map());
  const bgSeqRef = useRef(0);
  const userIdRef = useRef(getUserId());
  const threadIdRef = useRef(threadId);
  const missingThreadRecoveryAtRef = useRef<Map<string, number>>(new Map());
  const invocationThreadMapRef = useRef<Map<string, string>>(new Map());
  const missingThreadBufferRef = useRef<Map<string, AgentMessage[]>>(new Map());
  const missingThreadBufferTimerRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const queueAutoContinueInFlightRef = useRef<Set<string>>(new Set());
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const persistJoinedRooms = useCallback(() => {
    saveJoinedRoomsToSession(userIdRef.current, joinedRoomsRef.current);
  }, []);

  const normalizedWatchedThreadIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const rawId of watchedThreadIds) {
      if (typeof rawId !== 'string') continue;
      const id = rawId.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }, [watchedThreadIds]);

  threadIdRef.current = threadId;

  useEffect(() => {
    userIdRef.current = getUserId();
    joinedRoomsRef.current = loadJoinedRoomsFromSession(userIdRef.current);
    if (threadIdRef.current) {
      joinedRoomsRef.current.add(`thread:${threadIdRef.current}`);
    }
    persistJoinedRooms();
    bootstrapDebugFromStorage();
    ensureWindowDebugApi();

    const recordInvocationEvent = (event: Parameters<typeof recordDebugEvent>[0]) => {
      if (!isDebugEnabled()) return;
      const store = useChatStore.getState();
      const traceThreadId = event.threadId;
      const threadState = traceThreadId ? store.getThreadState(traceThreadId) : null;
      recordDebugEvent({
        ...event,
        timestamp: event.timestamp ?? Date.now(),
        routeThreadId: event.routeThreadId ?? threadIdRef.current,
        storeThreadId: event.storeThreadId ?? store.currentThreadId,
        queuePaused: event.queuePaused ?? threadState?.queuePaused,
        hasActiveInvocation: event.hasActiveInvocation ?? threadState?.hasActiveInvocation,
      });
    };

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        userId: userIdRef.current,
      },
    });

    const getTransportName = () => {
      const engine = socket.io.engine as unknown as SocketIoEngineLike | undefined;
      return engine?.transport?.name ?? 'unknown';
    };

    const attachNativeCloseLogger = () => {
      const engine = socket.io.engine as unknown as SocketIoEngineLike | undefined;
      const transport = engine?.transport;
      if (!transport || transport.name !== 'websocket' || !transport.ws) return;
      const ws = transport.ws as DebugWebSocket;
      if (ws.__catCafeCloseLoggerAttached) return;
      ws.__catCafeCloseLoggerAttached = true;
      ws.addEventListener('close', (event) => {
        console.warn('[ws] Native close', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
      });
    };

    socket.on('connect', () => {
      console.log('[ws] Connected', {
        socketId: socket.id,
        transport: getTransportName(),
        threadId: threadIdRef.current ?? null,
        rooms: [...joinedRoomsRef.current],
      });
      attachNativeCloseLogger();

      // Rejoin all tracked rooms on reconnect
      const rejoinedRooms: string[] = [];
      for (const room of joinedRoomsRef.current) {
        socket.emit('join_room', room);
        rejoinedRooms.push(room);
      }
      // Ensure active thread room is joined
      const tid = threadIdRef.current;
      if (tid) {
        const room = `thread:${tid}`;
        if (!joinedRoomsRef.current.has(room)) {
          socket.emit('join_room', room);
          joinedRoomsRef.current.add(room);
          rejoinedRooms.push(room);
        }
      }
      persistJoinedRooms();
      console.log('[ws] Rejoined rooms', {
        count: rejoinedRooms.length,
        rooms: rejoinedRooms,
      });
      recordInvocationEvent({
        event: 'connect',
        threadId: tid ?? undefined,
        action: getTransportName(),
      });
      recordInvocationEvent({
        event: 'rejoin_rooms',
        threadId: tid ?? undefined,
        queueLength: rejoinedRooms.length,
      });

      // Reconnect can miss in-flight stream chunks while the socket is down.
      // Trigger a lightweight message refresh so server-side draft rows rehydrate.
      if (tid) {
        requestThreadLiveRefresh(tid, 'messages', 'socket-reconnect');
      }

      // Reconnect reconciliation: verify invocation state against server truth.
      // Socket disconnect can lose done(isFinal) events, leaving stale "replying" UI.
      // Delay slightly so any buffered events arrive first.
      reconcileInvocationStateOnReconnect(tid ?? null);
    });

    const requestMissingThreadCatchUp = (reason: string, sourceMsg: AgentMessage) => {
      const refreshThreadId = threadIdRef.current ?? useChatStore.getState().currentThreadId;
      const now = Date.now();
      recordInvocationEvent({
        event: sourceMsg.type === 'done' ? 'done' : 'agent_message',
        action: reason,
        threadId: undefined,
        isFinal: sourceMsg.isFinal === true,
      });
      if (refreshThreadId) {
        const lastRecoveryAt = missingThreadRecoveryAtRef.current.get(refreshThreadId) ?? 0;
        if (now - lastRecoveryAt >= MISSING_THREAD_ID_RECOVERY_THROTTLE_MS) {
          missingThreadRecoveryAtRef.current.set(refreshThreadId, now);
          requestThreadLiveRefresh(refreshThreadId, 'messages', reason);
          useChatStore.getState().requestStreamCatchUp?.(refreshThreadId);
        }
      }
      console.warn('[ws] Dropping agent_message without threadId to prevent cross-thread contamination', {
        type: sourceMsg.type,
        agentId: sourceMsg.agentId,
        invocationId: sourceMsg.invocationId,
        refreshThreadId: refreshThreadId ?? null,
        reason,
      });
    };

    const flushBufferedInvocationMessages = (invocationId: string, resolvedThreadId: string) => {
      const buffered = missingThreadBufferRef.current.get(invocationId);
      if (!buffered || buffered.length === 0) return;
      const timer = missingThreadBufferTimerRef.current.get(invocationId);
      if (timer) {
        clearTimeout(timer);
        missingThreadBufferTimerRef.current.delete(invocationId);
      }
      missingThreadBufferRef.current.delete(invocationId);
      for (const bufferedMsg of buffered) {
        routeAgentMessage({ ...bufferedMsg, threadId: resolvedThreadId }, bufferedMsg, true);
      }
    };

    const routeAgentMessage = (routedMsg: AgentMessage, originalMsg: AgentMessage, recoveredFromBuffer = false) => {
      if (routedMsg.threadId && routedMsg.invocationId) {
        invocationThreadMapRef.current.set(routedMsg.invocationId, routedMsg.threadId);
        flushBufferedInvocationMessages(routedMsg.invocationId, routedMsg.threadId);
      }
      const routeThread = threadIdRef.current;
      const storeThread = useChatStore.getState().currentThreadId;

      // Active thread requires BOTH route-level and store-level agreement.
      // This blocks a switch-window race where route already points to thread-B
      // but flat store still belongs to thread-A.
      const isActiveThreadMessage = Boolean(
        routedMsg.threadId &&
          routeThread &&
          storeThread &&
          routedMsg.threadId === routeThread &&
          routedMsg.threadId === storeThread,
      );
      // If either pointer is temporarily unavailable during thread switch,
      // route thread-tagged events to background to avoid mutating stale flat state.
      recordInvocationEvent({
        event: routedMsg.type === 'done' ? 'done' : 'agent_message',
        threadId: routedMsg.threadId,
        action:
          recoveredFromBuffer || routedMsg.threadId !== originalMsg.threadId
            ? 'recover_missing_thread_id'
            : routedMsg.type,
        isFinal: routedMsg.isFinal === true,
      });

      // Safety-first: never route threadless payloads to active chat state.
      // Doing so can leak content into the wrong thread during rapid switches.
      // We drop and rely on thread-scoped history refresh for eventual consistency.
      if (!routedMsg.threadId) {
        if (routedMsg.invocationId) {
          const invocationId = routedMsg.invocationId;
          const existing = missingThreadBufferRef.current.get(invocationId);
          if (existing) {
            existing.push(routedMsg);
          } else {
            missingThreadBufferRef.current.set(invocationId, [routedMsg]);
            const timeoutId = setTimeout(() => {
              const pending = missingThreadBufferRef.current.get(invocationId);
              missingThreadBufferRef.current.delete(invocationId);
              missingThreadBufferTimerRef.current.delete(invocationId);
              if (!pending || pending.length === 0) return;
              for (const pendingMsg of pending) {
                requestMissingThreadCatchUp('drop_missing_thread_id_timeout', pendingMsg);
              }
            }, MISSING_THREAD_ID_BUFFER_TIMEOUT_MS);
            missingThreadBufferTimerRef.current.set(invocationId, timeoutId);
          }
          recordInvocationEvent({
            event: routedMsg.type === 'done' ? 'done' : 'agent_message',
            action: 'buffer_missing_thread_id',
            threadId: undefined,
            isFinal: routedMsg.isFinal === true,
          });
          return;
        }
        requestMissingThreadCatchUp('drop_missing_thread_id', routedMsg);
        return;
      }

      // Active thread → full processing via onMessage (streaming, tool events, etc.)
      if (isActiveThreadMessage) {
        callbacksRef.current.onMessage(routedMsg);
        clearBackgroundStreamRefForActiveEvent(routedMsg, bgStreamRefsRef.current);
        if (routedMsg.isFinal && routedMsg.invocationId) {
          invocationThreadMapRef.current.delete(routedMsg.invocationId);
          const timer = missingThreadBufferTimerRef.current.get(routedMsg.invocationId);
          if (timer) {
            clearTimeout(timer);
            missingThreadBufferTimerRef.current.delete(routedMsg.invocationId);
          }
          missingThreadBufferRef.current.delete(routedMsg.invocationId);
        }
        return;
      }

      // Background thread → delegated handler
      handleBackgroundAgentMessage(routedMsg as BackgroundAgentMessage, {
        store: useChatStore.getState(),
        bgStreamRefs: bgStreamRefsRef.current,
        finalizedBgRefs: bgFinalizedRefsRef.current,
        replacedInvocations: bgReplacedInvocationsRef.current,
        backgroundErrorToastsShown: bgErrorToastsShownRef.current,
        nextBgSeq: () => bgSeqRef.current++,
        addToast: (toast) => useToastStore.getState().addToast(toast),
        getThreadTitle: (threadId) => useChatStore.getState().threads.find((t) => t.id === threadId)?.title,
        clearDoneTimeout: callbacksRef.current.clearDoneTimeout,
        notifyTaskComplete: (title, body, type, threadId) => notifyOnTaskComplete({ title, body, type, threadId }),
      });
      if (routedMsg.isFinal && routedMsg.invocationId) {
        invocationThreadMapRef.current.delete(routedMsg.invocationId);
        const timer = missingThreadBufferTimerRef.current.get(routedMsg.invocationId);
        if (timer) {
          clearTimeout(timer);
          missingThreadBufferTimerRef.current.delete(routedMsg.invocationId);
        }
        missingThreadBufferRef.current.delete(routedMsg.invocationId);
      }
    };

    socket.on('agent_message', (msg: AgentMessage) => {
      let resolvedThreadId = msg.threadId;
      if (!resolvedThreadId && msg.invocationId) {
        resolvedThreadId = invocationThreadMapRef.current.get(msg.invocationId);
      }
      const routedMsg: AgentMessage =
        resolvedThreadId && resolvedThreadId !== msg.threadId ? { ...msg, threadId: resolvedThreadId } : msg;
      routeAgentMessage(routedMsg, msg);
    });

    socket.on('thread_updated', (data: { threadId: string; title: string }) => {
      callbacksRef.current.onThreadUpdated?.(data);
    });
    socket.on('thread_created', (data: { threadId: string; source?: string }) => {
      callbacksRef.current.onThreadCreated?.(data);
    });
    socket.on('skill_options_changed', () => {
      notifySkillOptionsChanged();
    });

    socket.on(
      'intent_mode',
      (data: { threadId: string; mode: string; targetAgents: string[]; invocationId?: string }) => {
        const routeThread = threadIdRef.current;
        const storeThread = useChatStore.getState().currentThreadId;
        recordInvocationEvent({
          event: 'intent_mode',
          threadId: data.threadId,
          mode: data.mode,
        });
        if (data.threadId && data.invocationId) {
          invocationThreadMapRef.current.set(data.invocationId, data.threadId);
          flushBufferedInvocationMessages(data.invocationId, data.threadId);
        }

        // Dual-pointer guard: both route and store must agree for active-thread processing.
        // Mirrors agent_message pattern — blocks switch-window race where route already
        // points to thread-B but flat store still belongs to thread-A.
        const isActiveThread = Boolean(
          data.threadId && routeThread && storeThread && data.threadId === routeThread && data.threadId === storeThread,
        );

        if (isActiveThread) {
          callbacksRef.current.onIntentMode?.(data);
          // F108: Register invocation slot in active thread store
          if (data.invocationId) {
            const primaryCat = data.targetAgents?.[0] ?? 'unknown';
            useChatStore.getState().addActiveInvocation(data.invocationId, primaryCat, data.mode);
          }
          return;
        }

        // Background thread (split-pane) or switch-window: write directly to thread-scoped state
        if (data.threadId) {
          const store = useChatStore.getState();
          store.setThreadLoading(data.threadId, true);
          // F108: slot-aware — register specific invocation if ID available
          if (data.invocationId) {
            const primaryCat = data.targetAgents?.[0] ?? 'unknown';
            store.addThreadActiveInvocation(data.threadId, data.invocationId, primaryCat, data.mode);
          } else {
            store.setThreadHasActiveInvocation(data.threadId, true);
          }
          store.setThreadIntentMode(data.threadId, data.mode as 'execute' | 'ideate');
          store.setThreadTargetAgents(data.threadId, data.targetAgents ?? []);
        }
      },
    );

    socket.on('task_created', (task: Record<string, unknown>) => {
      callbacksRef.current.onTaskCreated?.(task);
    });

    socket.on('task_updated', (task: Record<string, unknown>) => {
      callbacksRef.current.onTaskUpdated?.(task);
    });


    socket.on('heartbeat', (data: { threadId: string; timestamp: number }) => {
      callbacksRef.current.onHeartbeat?.(data);
    });

    socket.on('message_deleted', (data: { messageId: string; threadId: string; deletedBy: string }) => {
      callbacksRef.current.onMessageDeleted?.(data);
    });
    socket.on('message_hard_deleted', (data: { messageId: string; threadId: string; deletedBy: string }) => {
      callbacksRef.current.onMessageDeleted?.(data);
    });
    socket.on('message_restored', (data: { messageId: string; threadId: string }) => {
      callbacksRef.current.onMessageRestored?.(data);
    });
    socket.on('thread_branched', (data: { sourceThreadId: string; newThreadId: string; fromMessageId: string }) => {
      callbacksRef.current.onThreadBranched?.(data);
    });

    socket.on('authorization:request', (data: Record<string, unknown>) => {
      registerAndNotifyAuthorizationRequest(data);
      const currentThread = threadIdRef.current;
      if (data.threadId && currentThread && data.threadId !== currentThread) return;
      callbacksRef.current.onAuthorizationRequest?.(
        data as Parameters<NonNullable<SocketCallbacks['onAuthorizationRequest']>>[0],
      );
    });
    socket.on('authorization:response', (data: Record<string, unknown>) => {
      const requestId = typeof data.requestId === 'string' ? data.requestId : null;
      if (requestId) {
        useAuthorizationPendingStore.getState().resolvePending(requestId);
      }
      callbacksRef.current.onAuthorizationResponse?.(
        data as Parameters<NonNullable<SocketCallbacks['onAuthorizationResponse']>>[0],
      );
    });
    socket.on('ask_user_question:request', (data: Record<string, unknown>) => {
      const currentThread = threadIdRef.current;
      if (data.threadId && currentThread && data.threadId !== currentThread) return;
      callbacksRef.current.onAskUserQuestionRequest?.(
        data as unknown as Parameters<NonNullable<SocketCallbacks['onAskUserQuestionRequest']>>[0],
      );
    });
    socket.on('ask_user_question:response', (data: Record<string, unknown>) => {
      callbacksRef.current.onAskUserQuestionResponse?.(
        data as Parameters<NonNullable<SocketCallbacks['onAskUserQuestionResponse']>>[0],
      );
    });

    const normalizeQueueForDebug = (queue: unknown): unknown[] => (Array.isArray(queue) ? queue : []);
    const getQueueStatusesForDebug = (queue: unknown) =>
      normalizeQueueForDebug(queue).map((entry) => {
        if (!entry || typeof entry !== 'object') return 'unknown';
        const status = (entry as { status?: unknown }).status;
        return typeof status === 'string' ? status : 'unknown';
      });

    // F39: Queue events — always write via store (no dual-pointer guard needed, queue is thread-scoped)
    socket.on('queue_updated', (data: { threadId: string; queue: unknown[]; action: string }) => {
      const store = useChatStore.getState();
      store.setQueue(data.threadId, data.queue as import('../stores/chat-types').QueueEntry[]);
      const normalizedQueue = normalizeQueueForDebug(data.queue);
      // Queue processor started executing an entry: restore active invocation marker
      // so ChatInput can show "正在回复中" and Stop/queue controls after thread switches/F5.
      if (data.action === 'processing') {
        store.setThreadHasActiveInvocation(data.threadId, true);
      }
      // P1 fix: 'processing' means continue/auto-dequeue resumed the queue — clear paused state
      if (data.action === 'processing' || data.action === 'cleared') {
        store.setQueuePaused(data.threadId, false);
      }
      // If queue execution completed but done(isFinal) was missed, local active state
      // can stay stale. Trigger panel reconciliation against server truth.
      if (data.action === 'completed') {
        const hasProcessingEntry = normalizedQueue.some((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          return (entry as { status?: unknown }).status === 'processing';
        });
        if (!hasProcessingEntry) {
          requestThreadLiveRefresh(data.threadId, 'panels', 'queue_completed');
        }
      }
      if (isDebugEnabled()) {
        const stateAfterUpdate = store.getThreadState(data.threadId);
        recordInvocationEvent({
          event: 'queue_updated',
          threadId: data.threadId,
          action: data.action,
          queueLength: normalizedQueue.length,
          queueStatuses: getQueueStatusesForDebug(data.queue),
          hasActiveInvocation: data.action === 'processing' ? true : stateAfterUpdate?.hasActiveInvocation,
          queuePaused:
            data.action === 'processing' || data.action === 'cleared' ? false : stateAfterUpdate?.queuePaused,
        });
      }
    });
    // F098-D + F117: Messages delivered — update deliveredAt + insert user bubbles for queue sends
    socket.on(
      'messages_delivered',
      (data: {
        threadId: string;
        messageIds: string[];
        deliveredAt: number;
        messages?: Array<{
          id: string;
          content: string;
          agentId: string | null;
          timestamp: number;
          mentions: readonly string[];
          userId: string;
          contentBlocks?: readonly unknown[];
        }>;
      }) => {
        useChatStore.getState().markMessagesDelivered(data.threadId, data.messageIds, data.deliveredAt, data.messages);
      },
    );

    socket.on('queue_paused', (data: { threadId: string; reason: 'canceled' | 'failed'; queue: unknown[] }) => {
      const store = useChatStore.getState();
      store.setQueue(data.threadId, data.queue as import('../stores/chat-types').QueueEntry[]);
      store.setQueuePaused(data.threadId, true, data.reason);
      if (isDebugEnabled()) {
        recordInvocationEvent({
          event: 'queue_paused',
          threadId: data.threadId,
          reason: data.reason,
          queueLength: normalizeQueueForDebug(data.queue).length,
          queueStatuses: getQueueStatusesForDebug(data.queue),
        });
      }

      const normalizedQueue = normalizeQueueForDebug(data.queue);
      const hasQueuedEntry = normalizedQueue.some((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        const status = (entry as { status?: unknown }).status;
        return status === 'queued';
      });
      if (!hasQueuedEntry) return;
      if (queueAutoContinueInFlightRef.current.has(data.threadId)) return;

      queueAutoContinueInFlightRef.current.add(data.threadId);
      void (async () => {
        try {
          const res = await apiFetch(`/api/threads/${data.threadId}/queue/next`, { method: 'POST' });
          if (!res.ok) {
            if (isDebugEnabled()) {
              recordInvocationEvent({
                event: 'queue_paused',
                threadId: data.threadId,
                action: 'auto_continue_failed',
                reason: data.reason,
              });
            }
            return;
          }
          if (isDebugEnabled()) {
            recordInvocationEvent({
              event: 'queue_paused',
              threadId: data.threadId,
              action: 'auto_continue_next',
              reason: data.reason,
            });
          }
        } catch {
          if (isDebugEnabled()) {
            recordInvocationEvent({
              event: 'queue_paused',
              threadId: data.threadId,
              action: 'auto_continue_error',
              reason: data.reason,
            });
          }
        } finally {
          queueAutoContinueInFlightRef.current.delete(data.threadId);
        }
      })();
    });
    socket.on('queue_full_warning', (data: { threadId: string; source: 'user' | 'connector'; queue: unknown[] }) => {
      const store = useChatStore.getState();
      store.setQueue(data.threadId, data.queue as import('../stores/chat-types').QueueEntry[]);
      store.setQueueFull(data.threadId, data.source);
      useToastStore.getState().addToast({
        type: 'info',
        title: '队列已满',
        message: '消息队列已达上限，请管理队列后再发送',
        threadId: data.threadId,
        duration: 5000,
      });
    });

    socket.on('connector_message', (data: ConnectorMessageEvent) => {
      if (!data?.threadId || !data?.message?.id) return;
      const store = useChatStore.getState();
      const shouldTreatAsUser = isUserChannelConnector(data.message.source?.connector);
      store.addMessageToThread(data.threadId, {
        id: data.message.id,
        type: shouldTreatAsUser ? 'user' : 'connector',
        content: data.message.content ?? '',
        ...(data.message.source ? { source: data.message.source } : {}),
        ...(data.message.extra ? { extra: data.message.extra } : {}),
        timestamp: data.message.timestamp ?? Date.now(),
      });
    });

    // F101: Game state updates (per-seat scoped views)
    socket.on('game:state_update', (data: { gameId: string; view: unknown; timestamp: number }) => {
      callbacksRef.current.onGameStateUpdate?.(data);
    });

    // F101 Phase I: Narrator narrative messages (e.g. "🐺 狼人请睁眼")
    socket.on(
      'game:narrative',
      (data: { threadId: string; message: { id: string; type: string; content: string; timestamp: number } }) => {
        if (!data?.threadId || !data?.message?.id) return;
        useChatStore.getState().addMessageToThread(data.threadId, {
          id: data.message.id,
          type: 'system',
          content: data.message.content,
          timestamp: data.message.timestamp,
        });
      },
    );

    // F101 Phase D: Independent game thread created
    socket.on(
      'game:thread_created',
      (data: { gameThreadId: string; gameTitle: string; initiatorUserId: string; timestamp: number }) => {
        callbacksRef.current.onGameThreadCreated?.(data);
      },
    );

    // F111 Phase B + F112 Phase A: Real-time voice stream events
    socket.on('voice_stream_start', handleVoiceStreamStart);
    socket.on('voice_chunk', handleVoiceChunk);
    socket.on('voice_stream_end', handleVoiceStreamEnd);

    socket.on('connect_error', (error: Error & { description?: unknown; context?: unknown }) => {
      console.error('[ws] connect_error', {
        message: error.message,
        name: error.name,
        transport: getTransportName(),
        description: error.description ?? null,
        context: error.context ?? null,
      });
    });

    socket.on('disconnect', (...args: unknown[]) => {
      const [reason, details] = args;
      console.warn('[ws] Disconnected', {
        reason: typeof reason === 'string' ? reason : String(reason),
        transport: getTransportName(),
        details: details ?? null,
      });
      recordInvocationEvent({
        event: 'disconnect',
        threadId: threadIdRef.current,
        reason: typeof reason === 'string' ? reason : String(reason),
      });
    });

    const engine = socket.io.engine as unknown as SocketIoEngineLike | undefined;
    engine?.on('upgrade', () => {
      attachNativeCloseLogger();
      console.log('[ws] Transport upgraded', { transport: getTransportName() });
    });
    engine?.on('close', (...args: unknown[]) => {
      const [reason] = args;
      console.warn('[ws] Engine close', {
        reason: typeof reason === 'string' ? reason : String(reason),
        transport: getTransportName(),
      });
      recordInvocationEvent({
        event: 'engine_close',
        threadId: threadIdRef.current,
        reason: typeof reason === 'string' ? reason : String(reason),
      });
    });

    socketRef.current = socket;

    // Handle page visibility change: refresh thread messages when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentThreadId = threadIdRef.current || useChatStore.getState().currentThreadId;
        if (currentThreadId) {
          console.log('[ws] Page became visible, refreshing thread:', currentThreadId);
          requestThreadLiveRefresh(currentThreadId, 'messages', 'visibility-change');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.disconnect();
      joinedRoomsRef.current.clear();
      for (const timeoutId of missingThreadBufferTimerRef.current.values()) {
        clearTimeout(timeoutId);
      }
      missingThreadBufferTimerRef.current.clear();
      missingThreadBufferRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks accessed via callbacksRef
  }, [persistJoinedRooms]);

  /** Join a single room (additive — does not leave other rooms) */
  const joinRoom = useCallback(
    (roomThreadId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      const room = `thread:${roomThreadId}`;
      if (joinedRoomsRef.current.has(room)) return;
      socket.emit('join_room', room);
      joinedRoomsRef.current.add(room);
      persistJoinedRooms();
    },
    [persistJoinedRooms],
  );

  /**
   * Best-effort server-side join confirmation for race-sensitive flows.
   * Falls back to the legacy fire-and-forget behavior on timeout/unavailable socket.
   */
  const awaitThreadRoom = useCallback(
    async (roomThreadId: string, timeoutMs = ROOM_JOIN_ACK_TIMEOUT_MS): Promise<JoinRoomAwaitStatus> => {
      const room = `thread:${roomThreadId}`;
      joinedRoomsRef.current.add(room);
      persistJoinedRooms();

      const deadline = Date.now() + Math.max(timeoutMs, 0);
      let socket = socketRef.current;

      while ((!socket || !socket.connected) && Date.now() < deadline) {
        const remaining = deadline - Date.now();
        await new Promise((resolve) => setTimeout(resolve, Math.min(ROOM_JOIN_POLL_INTERVAL_MS, remaining)));
        socket = socketRef.current;
      }

      if (!socket) {
        return 'socket_unavailable';
      }

      if (!socket.connected) {
        socket.emit('join_room', room);
        return 'timed_out';
      }

      // Frontend-only guard: re-emit room join after the socket is confirmed up,
      // then leave a tiny settle window for the server to process the membership.
      socket.emit('join_room', room);

      const remaining = deadline - Date.now();
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(ROOM_JOIN_SETTLE_MS, remaining)));
      }

      return socket.connected ? 'joined' : 'timed_out';
    },
    [persistJoinedRooms],
  );

  /** Leave a single room */
  const leaveRoom = useCallback(
    (roomThreadId: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      const room = `thread:${roomThreadId}`;
      if (!joinedRoomsRef.current.has(room)) return;
      socket.emit('leave_room', room);
      joinedRoomsRef.current.delete(room);
      persistJoinedRooms();
    },
    [persistJoinedRooms],
  );

  /** Sync joined rooms to exactly the given set of thread IDs */
  const syncRooms = useCallback(
    (threadIds: string[]) => {
      const socket = socketRef.current;
      if (!socket) return;

      const targetRooms = new Set(threadIds.map((id) => `thread:${id}`));

      // Leave rooms no longer needed
      for (const room of joinedRoomsRef.current) {
        if (!targetRooms.has(room)) {
          socket.emit('leave_room', room);
          joinedRoomsRef.current.delete(room);
        }
      }

      // Join new rooms
      for (const room of targetRooms) {
        if (!joinedRoomsRef.current.has(room)) {
          socket.emit('join_room', room);
          joinedRoomsRef.current.add(room);
        }
      }
      persistJoinedRooms();
    },
    [persistJoinedRooms],
  );

  // Add the active thread plus any background threads whose updates must be
  // reflected in the UI (e.g. unread badges). This stays additive on purpose:
  // persisted room memberships still help during refresh/reconnect windows.
  useEffect(() => {
    if (threadId) {
      joinRoom(threadId);
    }
    for (const watchedThreadId of normalizedWatchedThreadIds) {
      joinRoom(watchedThreadId);
    }
  }, [threadId, normalizedWatchedThreadIds, joinRoom]);

  const cancelInvocation = useCallback((tid: string) => {
    socketRef.current?.emit('cancel_invocation', { threadId: tid });
  }, []);

  return { socketRef, joinRoom, awaitThreadRoom, leaveRoom, syncRooms, cancelInvocation };
}
