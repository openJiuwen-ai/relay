/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { OFFICE_CLAW_CONFIGS } from '@openjiuwen/relay-shared';
import { create } from 'zustand';
import type {
  PptStudioSession,
  PptStudioSlidesUpdate,
  PptStudioStatus,
} from '@/components/ppt-studio/ppt-studio-types';
import { recordDebugEvent } from '@/debug/invocationEventDebug';
import type { SendMessageOptions } from '@/hooks/useSendMessage';
import { compareMessagesByOrder } from '@/utils/message-order';
import type {
  AgentInvocationInfo,
  AgentStatusType,
  ChatMessage,
  ChatMessageMetadata,
  ChatMessagePatch,
  DeliveryMode,
  GameState,
  InspirationPendingChatInsert,
  QueueEntry,
  RichBlock,
  Thread,
  ThreadState,
  TokenUsage,
  ToolEvent,
  WhisperOptions,
  ActiveOutlinePreview,
} from './chat-types';
import { DEFAULT_THREAD_STATE } from './chat-types';
import {
  closePptStudioPreviewForThread,
  getPreferredPptPagesDirForThread,
  getRightPanelModeForThread,
  mergePptStudioSession,
  openPptStudioPreviewForThread,
  type PptStudioUpsertOptions,
  removePptStudioSession,
  updatePptStudioActiveSlide,
  updatePptStudioStatus,
} from './ppt-preview-store-helpers';

// Re-export types so existing consumers keep working with `import { ... } from '@/stores/chatStore'`
export type {
  AgentInvocationInfo,
  AgentRef,
  AgentStatusType,
  ChatMessage,
  ChatMessageMetadata,
  ChatMessagePatch,
  DeliveryMode,
  EvidenceData,
  EvidenceResultData,
  GameState,
  ImageContent,
  InspirationPendingChatInsert,
  MessageContent,
  QueueEntry,
  RichAudioBlock,
  RichBlock,
  RichBlockKind,
  RichCardBlock,
  RichChecklistBlock,
  RichDiffBlock,
  RichMediaGalleryBlock,
  SkillRef,
  TextContent,
  Thread,
  ThreadState,
  TokenUsage,
  ToolEvent,
  WhisperOptions,
} from './chat-types';
export { DEFAULT_THREAD_STATE } from './chat-types';

// ── Helpers ──

/** Snapshot the flat active-thread fields into a ThreadState object */
function snapshotActive(s: ChatState): ThreadState {
  return {
    messages: s.messages,
    isLoading: s.isLoading,
    isLoadingHistory: s.isLoadingHistory,
    hasMore: s.hasMore,
    hasActiveInvocation: s.hasActiveInvocation,
    activeInvocations: s.activeInvocations,
    intentMode: s.intentMode,
    targetAgents: s.targetAgents,
    agentStatuses: s.agentStatuses,
    agentInvocations: s.agentInvocations,
    currentGame: s.currentGame,
    unreadCount: 0, // active thread always 0
    hasUserMention: false,
    lastActivity: Date.now(),
    queue: s.queue,
    queuePaused: s.queuePaused,
    queuePauseReason: s.queuePauseReason,
    queueFull: s.queueFull,
    queueFullSource: s.queueFullSource,
  };
}

/** Flatten a ThreadState into partial ChatState fields */
function flattenThread(ts: ThreadState): Partial<ChatState> {
  return {
    messages: ts.messages,
    isLoading: ts.isLoading,
    isLoadingHistory: ts.isLoadingHistory,
    hasMore: ts.hasMore,
    hasActiveInvocation: ts.hasActiveInvocation,
    activeInvocations: ts.activeInvocations,
    intentMode: ts.intentMode,
    targetAgents: ts.targetAgents,
    agentStatuses: ts.agentStatuses,
    agentInvocations: ts.agentInvocations,
    currentGame: ts.currentGame,
    queue: ts.queue,
    queuePaused: ts.queuePaused,
    queuePauseReason: ts.queuePauseReason,
    queueFull: ts.queueFull,
    queueFullSource: ts.queueFullSource,
  };
}

const MAX_BLOB_MESSAGES = 200;
const MAX_QUEUE_DEPTH = 20;

const UI_THINKING_EXPANDED_KEY = 'officeclaw.ui.thinkingExpandedByDefault';
const LEGACY_UI_THINKING_EXPANDED_KEY = 'catcafe.ui.thinkingExpandedByDefault';

function loadUiThinkingExpandedByDefault(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    let v = window.localStorage.getItem(UI_THINKING_EXPANDED_KEY);
    if (v === null) v = window.localStorage.getItem(LEGACY_UI_THINKING_EXPANDED_KEY);
    if (v === '1' && window.localStorage.getItem(UI_THINKING_EXPANDED_KEY) === null) {
      try {
        window.localStorage.setItem(UI_THINKING_EXPANDED_KEY, '1');
        window.localStorage.removeItem(LEGACY_UI_THINKING_EXPANDED_KEY);
      } catch {
        /* ignore */
      }
    }
    return v === '1';
  } catch {
    return false;
  }
}

function persistUiThinkingExpandedByDefault(next: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_THINKING_EXPANDED_KEY, next ? '1' : '0');
    try {
      window.localStorage.removeItem(LEGACY_UI_THINKING_EXPANDED_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    // ignore storage failures (privacy mode, quota, etc.)
  }
}

function appendThinkingText(existing: string | undefined, next: string): string {
  if (!existing) return next;
  if (!next) return existing;
  return `${existing}${next}`;
}

function revokeBlobUrls(messages: ChatMessage[]) {
  for (const msg of messages) {
    if (msg.contentBlocks) {
      for (const block of msg.contentBlocks) {
        if (block.type === 'image' && block.url.startsWith('blob:')) {
          URL.revokeObjectURL(block.url);
        }
      }
    }
  }
}

function collectBlobUrls(messages: ChatMessage[]): Set<string> {
  const blobUrls = new Set<string>();
  for (const msg of messages) {
    if (!msg.contentBlocks) continue;
    for (const block of msg.contentBlocks) {
      if (block.type === 'image' && block.url.startsWith('blob:')) {
        blobUrls.add(block.url);
      }
    }
  }
  return blobUrls;
}

function revokeRemovedBlobUrls(previousMessages: ChatMessage[], nextMessages: ChatMessage[]) {
  const retainedBlobUrls = collectBlobUrls(nextMessages);
  for (const msg of previousMessages) {
    if (!msg.contentBlocks) continue;
    for (const block of msg.contentBlocks) {
      if (block.type === 'image' && block.url.startsWith('blob:') && !retainedBlobUrls.has(block.url)) {
        URL.revokeObjectURL(block.url);
      }
    }
  }
}

type ReplaceMessageIdResult = {
  messages: ChatMessage[];
  droppedMessage?: ChatMessage;
  retainedMessage?: ChatMessage;
};

function replaceMessageIdInList(messages: ChatMessage[], fromId: string, toId: string): ReplaceMessageIdResult {
  if (fromId === toId) return { messages };
  const fromIndex = messages.findIndex((msg) => msg.id === fromId);
  if (fromIndex === -1) return { messages };

  const fromMessage = messages[fromIndex];
  const retainedMessage = messages.find((msg) => msg.id === toId);
  if (retainedMessage) {
    return {
      messages: messages.filter((msg) => msg.id !== fromId),
      droppedMessage: fromMessage,
      retainedMessage,
    };
  }

  return { messages: messages.map((msg) => (msg.id === fromId ? { ...msg, id: toId } : msg)) };
}

function recordMessageIdDedupDrop(
  threadId: string,
  droppedMessage: ChatMessage | undefined,
  retainedMessage: ChatMessage | undefined,
  toId: string,
) {
  if (!droppedMessage || !retainedMessage) return;
  recordDebugEvent({
    event: 'bubble_lifecycle',
    threadId,
    timestamp: Date.now(),
    action: 'drop',
    reason: 'replace_message_id_dedup',
    agentId: droppedMessage.agentId ?? retainedMessage.agentId,
    messageId: toId,
    invocationId: droppedMessage.extra?.stream?.invocationId ?? retainedMessage.extra?.stream?.invocationId,
    origin: droppedMessage.origin ?? retainedMessage.origin,
  });
}

function applyMessagePatch(message: ChatMessage, patch: ChatMessagePatch): ChatMessage {
  return {
    ...message,
    ...patch,
    ...(patch.extra ? { extra: { ...message.extra, ...patch.extra } } : {}),
    ...(patch.metadata
      ? { metadata: message.metadata ? { ...message.metadata, ...patch.metadata } : patch.metadata }
      : {}),
  };
}

function patchMessageInList(messages: ChatMessage[], id: string, patch: ChatMessagePatch): ChatMessage[] {
  let changed = false;
  const nextMessages = messages.map((msg) => {
    if (msg.id !== id) return msg;
    changed = true;
    return applyMessagePatch(msg, patch);
  });
  return changed ? nextMessages : messages;
}

function getLatestMessageTimestamp(messages: ChatMessage[]): number {
  let maxTs = 0;
  for (const msg of messages) {
    if (typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp)) {
      if (msg.timestamp > maxTs) maxTs = msg.timestamp;
    }
  }
  return maxTs;
}

function isUnreadBodyMessage(msg: ChatMessage): boolean {
  return msg.type === 'assistant' || !!msg.source;
}

function isSeenCallbackTailMessage(existing: ThreadState, msg: ChatMessage): boolean {
  if (msg.type !== 'assistant' || msg.origin !== 'callback') return false;

  const callbackInvocationId = msg.extra?.stream?.invocationId;
  if (callbackInvocationId) {
    return existing.messages.some(
      (m) =>
        m.type === 'assistant' &&
        m.origin === 'stream' &&
        m.agentId === msg.agentId &&
        m.extra?.stream?.invocationId === callbackInvocationId,
    );
  }

  // Fallback for providers that emit callback text without invocationId:
  // if we just had a stream message from the same cat very recently, treat
  // callback as tail replacement instead of a brand-new unread message.
  const fallbackWindowMs = 8_000;
  for (let i = existing.messages.length - 1; i >= 0; i -= 1) {
    const m = existing.messages[i];
    if (m?.type !== 'assistant' || m.origin !== 'stream' || m.agentId !== msg.agentId) continue;
    if (
      typeof m.timestamp === 'number' &&
      Number.isFinite(m.timestamp) &&
      typeof msg.timestamp === 'number' &&
      Number.isFinite(msg.timestamp) &&
      msg.timestamp >= m.timestamp &&
      msg.timestamp - m.timestamp <= fallbackWindowMs
    ) {
      return true;
    }
    break;
  }
  return false;
}

/** F067 Phase 2: Fire macOS notification when a cat @mentions the co-creator */
function fireOwnerMentionNotification(msg: ChatMessage) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    Notification.requestPermission();
    return;
  }
  const catConfig = OFFICE_CLAW_CONFIGS[msg.agentId ?? ''];
  const catName = catConfig?.displayName ?? msg.agentId ?? '智能体';
  const preview = typeof msg.content === 'string' ? msg.content.replace(/\n/g, ' ').slice(0, 120) : '';
  new Notification(`${catName} @ 了你`, {
    body: preview,
    icon: catConfig?.avatar ?? '/favicon.ico',
    tag: `cocreator-mention-${msg.id}`,
  });
}

function updateThreadMessage(
  state: ChatState,
  threadId: string,
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
): ChatState | Partial<ChatState> {
  if (threadId === state.currentThreadId) {
    return {
      messages: state.messages.map((m) => (m.id === messageId ? updater(m) : m)),
    };
  }

  const existing = state.threadStates[threadId];
  if (!existing) return state;
  return {
    threadStates: {
      ...state.threadStates,
      [threadId]: {
        ...existing,
        messages: existing.messages.map((m) => (m.id === messageId ? updater(m) : m)),
        lastActivity: Date.now(),
      },
    },
  };
}

// ── Store interface ──

export type PendingNewThreadSend = {
  requestId: string;
  content: string;
  createdAt: number;
  images?: File[];
  whisper?: WhisperOptions;
  deliveryMode?: DeliveryMode;
  sendOptions?: SendMessageOptions;
  targetThreadId?: string;
};

function snapshotPendingNewThreadSendPayload(
  payload: Omit<PendingNewThreadSend, 'targetThreadId'>,
): Omit<PendingNewThreadSend, 'targetThreadId'> {
  return {
    ...payload,
    ...(payload.images ? { images: [...payload.images] } : {}),
    ...(payload.whisper
      ? {
          whisper: {
            ...payload.whisper,
            whisperTo: [...payload.whisper.whisperTo],
          },
        }
      : {}),
    ...(payload.sendOptions ? { sendOptions: { ...payload.sendOptions } } : {}),
  };
}

interface ChatState {
  // Per-thread state (flat — reflects the active thread for backward compat)
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  hasMore: boolean;
  /** Whether the thread has an active invocation (broader than isLoading — stays true during A2A chains) */
  hasActiveInvocation: boolean;
  /** F108: Per-invocation slot tracking — key=invocationId, value=slot info */
  activeInvocations: Record<string, { agentId: string; mode: string; startedAt?: number }>;
  intentMode: 'execute' | 'ideate' | null;
  targetAgents: string[];
  agentStatuses: Record<string, AgentStatusType>;
  agentInvocations: Record<string, AgentInvocationInfo>;
  /** F101: Active game in current thread */
  currentGame: GameState | null;
  /** F39: Message queue entries */
  queue: QueueEntry[];
  /** F39: Whether the queue is paused */
  queuePaused: boolean;
  /** F39: Pause reason */
  queuePauseReason?: 'canceled' | 'failed';
  /** F39: Queue full flag */
  queueFull: boolean;
  /** F39: Who triggered the full warning */
  queueFullSource?: 'user' | 'connector';

  // Multi-thread state map (preserves per-thread state across switches)
  threadStates: Record<string, ThreadState>;

  // Multi-thread UI
  viewMode: 'single' | 'split';
  splitPaneThreadIds: string[];
  splitPaneTargetId: string | null;

  // Global state
  currentThreadId: string;
  currentProjectPath: string;
  /** Transient: suppress initThreadUnread re-hydration for recently-cleared threads */
  _unreadSuppressedUntil: Record<string, number>;
  /** #586: Count of in-flight ack requests per thread — suppression clears only when 0 */
  _pendingAckCount: Record<string, number>;
  /** Internal read watermark per thread (latest viewed message timestamp). */
  _lastReadAtByThread: Record<string, number>;
  threads: Thread[];
  isLoadingThreads: boolean;
  pendingNewThreadSend: PendingNewThreadSend | null;
  /** UI: Whether Thinking blocks should be expanded by default (global preference). */
  uiThinkingExpandedByDefault: boolean;

  // ── Active-thread actions (operate on flat state) ──
  addMessage: (msg: ChatMessage) => void;
  removeMessage: (id: string) => void;
  prependHistory: (msgs: ChatMessage[], hasMore: boolean, expectedThreadId?: string) => void;
  replaceMessages: (msgs: ChatMessage[], hasMore: boolean, expectedThreadId?: string) => void;
  replaceMessageId: (fromId: string, toId: string) => void;
  patchMessage: (id: string, patch: ChatMessagePatch) => void;
  appendToLastMessage: (content: string) => void;
  appendToMessage: (id: string, content: string) => void;
  appendToolEvent: (id: string, event: ToolEvent) => void;
  /** F22: Append a rich block to a message */
  appendRichBlock: (id: string, block: RichBlock) => void;
  /** F096: Update a specific rich block within a message */
  updateRichBlock: (messageId: string, blockId: string, patch: Record<string, unknown>) => void;
  setStreaming: (id: string, streaming: boolean) => void;
  setLoading: (loading: boolean) => void;
  setHasActiveInvocation: (v: boolean) => void;
  /** F108: Register a new active invocation slot */
  addActiveInvocation: (invocationId: string, agentId: string, mode: string) => void;
  /** F108: Remove an active invocation slot; derives hasActiveInvocation */
  removeActiveInvocation: (invocationId: string) => void;
  /** F108: Clear all active invocations (timeout/error/stop recovery) */
  clearAllActiveInvocations: () => void;
  setLoadingHistory: (loading: boolean) => void;
  setIntentMode: (mode: 'execute' | 'ideate' | null) => void;
  setTargetAgents: (agentIds: string[]) => void;
  setAgentStatus: (agentId: string, status: AgentStatusType) => void;
  clearAgentStatuses: () => void;
  setAgentInvocation: (agentId: string, info: Partial<AgentInvocationInfo>) => void;
  setMessageUsage: (messageId: string, usage: TokenUsage) => void;
  /** Merge metadata onto an active-thread message (parallel to setThreadMessageMetadata) */
  setMessageMetadata: (messageId: string, metadata: ChatMessageMetadata) => void;
  /** F045: Set or append extended thinking content on an assistant message */
  setMessageThinking: (messageId: string, thinking: string) => void;
  /** F081: Persist stream invocation identity onto a message for replace/hydration reconcile */
  setMessageStreamInvocation: (messageId: string, invocationId: string) => void;
  /** invocation_complete：把本轮耗时写到气泡上，供思考执行标签读取 */
  setMessageStreamExecutionDuration: (messageId: string, durationMs: number) => void;
  clearMessages: () => void;
  /** Bug C: Monotonic counter + target threadId — increment to request a history catch-up fetch */
  streamCatchUpVersion: number;
  streamCatchUpThreadId: string | null;
  requestStreamCatchUp: (threadId: string) => void;
  /** F101: Update current game state */
  setCurrentGame: (game: GameState | null) => void;

  // ── Thread management ──
  setThreads: (threads: Thread[]) => void;
  setCurrentThread: (threadId: string) => void;
  setCurrentProject: (projectPath: string) => void;
  setLoadingThreads: (loading: boolean) => void;
  updateThreadTitle: (threadId: string, title: string) => void;
  updateThreadPin: (threadId: string, pinned: boolean) => void;
  updateThreadFavorite: (threadId: string, favorited: boolean) => void;
  updateThreadLastActive: (threadId: string, lastActiveAt?: number) => void;
  updateThreadThinkingMode: (threadId: string, mode: 'debug' | 'play') => void;

  updateThreadPreferredAgents: (threadId: string, preferredAgentIds: string[]) => void;
  setUiThinkingExpandedByDefault: (next: boolean) => void;

  // ── Multi-thread actions (new) ──
  addMessageToThread: (threadId: string, msg: ChatMessage) => void;
  removeThreadMessage: (threadId: string, messageId: string) => void;
  replaceThreadMessageId: (threadId: string, fromId: string, toId: string) => void;
  patchThreadMessage: (threadId: string, messageId: string, patch: ChatMessagePatch) => void;
  appendToThreadMessage: (threadId: string, messageId: string, content: string) => void;
  appendToolEventToThread: (threadId: string, messageId: string, event: ToolEvent) => void;
  /** F22: Append a rich block to a message in a specific thread */
  appendRichBlockToThread: (threadId: string, messageId: string, block: RichBlock) => void;
  setThreadAgentInvocation: (threadId: string, agentId: string, info: Partial<AgentInvocationInfo>) => void;
  setThreadMessageMetadata: (threadId: string, messageId: string, metadata: ChatMessageMetadata) => void;
  setThreadMessageUsage: (threadId: string, messageId: string, usage: TokenUsage) => void;
  setThreadMessageThinking: (threadId: string, messageId: string, thinking: string) => void;
  setThreadMessageStreamInvocation: (threadId: string, messageId: string, invocationId: string) => void;
  setThreadMessageStreamExecutionDuration: (threadId: string, messageId: string, durationMs: number) => void;
  setThreadMessageStreaming: (threadId: string, messageId: string, streaming: boolean) => void;
  setThreadLoading: (threadId: string, loading: boolean) => void;
  setThreadHasActiveInvocation: (threadId: string, active: boolean) => void;
  /** F108: Add an active invocation to a thread (background or active) */
  addThreadActiveInvocation: (threadId: string, invocationId: string, agentId: string, mode: string) => void;
  /** F108: Remove an active invocation from a thread; derives hasActiveInvocation */
  removeThreadActiveInvocation: (threadId: string, invocationId: string) => void;
  /** F108: Clear all active invocations for a thread (cancel fallback when invocationId unknown) */
  clearAllThreadActiveInvocations: (threadId: string) => void;
  setThreadIntentMode: (threadId: string, mode: 'execute' | 'ideate' | null) => void;
  setThreadTargetAgents: (threadId: string, agentIds: string[]) => void;
  replaceThreadTargetAgents: (threadId: string, agentIds: string[]) => void;
  getThreadState: (threadId: string) => ThreadState;
  incrementUnread: (threadId: string) => void;
  clearUnread: (threadId: string) => void;
  /** F072: Clear unread badges for all threads at once */
  clearAllUnread: () => void;
  /** #586: One ack resolved — decrement pending count; clear suppression when 0 */
  confirmUnreadAck: (threadId: string) => void;
  /** #586: Ack about to fire — increment pending count + set Infinity suppression */
  armUnreadSuppression: (threadId: string) => void;
  /** F069: Initialize unread state from API (page load recovery) */
  initThreadUnread: (threadId: string, unreadCount: number, hasUserMention: boolean) => void;
  updateThreadAgentStatus: (threadId: string, agentId: string, status: AgentStatusType) => void;
  /** Batch content-append + metadata + streaming + nextAgentStatus into a single set() to prevent
   *  React update-depth overflow during high-frequency background streaming. */
  batchStreamChunkUpdate: (params: {
    threadId: string;
    messageId: string;
    agentId: string;
    content: string;
    metadata?: ChatMessageMetadata;
    streaming: boolean;
    nextAgentStatus: AgentStatusType;
  }) => void;
  setViewMode: (mode: 'single' | 'split') => void;
  setSplitPaneThreadIds: (ids: string[]) => void;
  setSplitPaneTarget: (threadId: string | null) => void;

  /** Clear hasActiveInvocation for a specific thread (active or background) */
  clearThreadActiveInvocation: (threadId: string) => void;
  /** Clear invocation-scoped UI state for a specific thread (active or background) */
  resetThreadInvocationState: (threadId: string) => void;

  // ── F39: Queue actions ──
  setQueue: (threadId: string, queue: QueueEntry[]) => void;
  setQueuePaused: (threadId: string, paused: boolean, reason?: 'canceled' | 'failed') => void;
  setQueueFull: (threadId: string, source: 'user' | 'connector') => void;
  /** F098-D + F117: Mark queued messages as delivered (set deliveredAt) + insert user bubbles for queue-sent messages */
  markMessagesDelivered: (
    threadId: string,
    messageIds: string[],
    deliveredAt: number,
    messages?: Array<{
      id: string;
      content: string;
      agentId: string | null;
      timestamp: number;
      contentBlocks?: readonly unknown[];
    }>,
  ) => void;

  // ── F63: Workspace Explorer ──
  rightPanelMode: 'status' | 'workspace' | 'pptStudio' | 'outlinePreview' | 'fileBrowser';
  workspaceWorktreeId: string | null;
  workspaceOpenTabs: string[];
  workspaceOpenFilePath: string | null;
  workspaceOpenFileLine: number | null;
  workspaceEditToken: string | null;
  workspaceEditTokenExpiry: number | null;
  /** @internal Last workspace-file-set event context (timestamp + threadId).
   * Used by WorkspacePanel to distinguish fresh navigate from stale leftovers on mount. */
  _workspaceFileSetAt: { ts: number; threadId: string | null };
  setRightPanelMode: (mode: 'status' | 'workspace' | 'pptStudio' | 'outlinePreview' | 'fileBrowser') => void;
  openFileBrowserPanel: (initialTab?: 'tasks' | 'artifacts' | 'workspace') => void;
  /** Open the file browser panel with a specific file pre-selected. */
  openFileBrowserPanelWithFile: (path: string) => void;
  /** Path to auto-select when the file browser panel first opens. Consumed once and cleared. */
  fileBrowserInitialPath: string | null;
  /** Tab to auto-select when the file browser panel first opens. Consumed once and cleared. */
  fileBrowserInitialTab: 'tasks' | 'artifacts' | 'workspace' | null;
  /** Currently selected file path within the file browser panel. */
  fileBrowserSelectedPath: string | null;
  setWorkspaceWorktreeId: (id: string | null) => void;
  setWorkspaceOpenFile: (
    path: string | null,
    line?: number | null,
    worktreeId?: string | null,
    originThreadId?: string | null,
  ) => void;
  closeWorkspaceTab: (path: string) => void;
  restoreWorkspaceTabs: (tabs: string[], openFile: string | null) => void;
  setWorkspaceEditToken: (token: string | null, expiresIn?: number) => void;

  workspaceRevealPath: string | null;
  setWorkspaceRevealPath: (path: string | null, originThreadId?: string | null) => void;

  // ── F120: Preview auto-open (always-mounted listener) ──
  pendingPreviewAutoOpen: { port: number; path: string } | null;
  setPendingPreviewAutoOpen: (data: { port: number; path: string }) => void;
  consumePreviewAutoOpen: () => { port: number; path: string } | null;

  // ── PPT Studio ──
  pptStudioSessions: Record<string, PptStudioSession>; // key: pagesDir（每个 PPT 独立 Session）
  activePptPagesDir: string | null; // 右侧面板当前聚焦的 PPT
  upsertPptStudioSlides: (threadId: string, payload: PptStudioSlidesUpdate, options?: PptStudioUpsertOptions) => void;
  setPptStudioActiveSlide: (pagesDir: string, activeSlideId: string | null) => void;
  setPptStudioStatus: (pagesDir: string, status: PptStudioStatus) => void;
  clearPptStudioSession: (pagesDir: string) => void;
  setActivePptPagesDir: (pagesDir: string | null) => void;
  openPptStudioPreview: (pagesDir: string, threadId?: string) => void;
  closePptStudioPreview: (threadId?: string) => void;

  /** Outline preview in secondary pane */
  activeOutlinePreview: ActiveOutlinePreview | null;
  openOutlinePreview: (preview: Omit<ActiveOutlinePreview, 'threadId' | 'editedText' | 'panelMode'> & { threadId?: string; isConfirmed?: boolean }) => void;
  closeOutlinePreview: () => void;
  updateOutlinePreviewText: (text: string) => void;
  setOutlinePreviewMode: (mode: 'preview' | 'edit') => void;
  setOutlinePreviewConfirmed: (confirmed: boolean) => void;

  // ── F63-AC15: Code-to-chat reference ──
  pendingChatInsert:
    | {
        threadId: string;
        text: string;
        replaceTrailingMentionTrigger?: boolean;
        suppressMentionMenu?: boolean;
        mentionRefs?: { catId: string; mention: string }[];
        /** 为 true 时直接覆盖输入框内容，不追加 */
        replaceAll?: boolean;
        inspirationData?: InspirationPendingChatInsert;
      }
    | null;
  setPendingChatInsert: (
    insert:
      | {
          threadId: string;
          text: string;
          replaceTrailingMentionTrigger?: boolean;
          suppressMentionMenu?: boolean;
          mentionRefs?: { catId: string; mention: string }[];
          /** 为 true 时直接覆盖输入框内容，不追加 */
          replaceAll?: boolean;
          inspirationData?: InspirationPendingChatInsert
        }
      | null,
  ) => void;
  setPendingNewThreadSend: (payload: Omit<PendingNewThreadSend, 'targetThreadId'>) => void;
  attachPendingNewThreadTarget: (threadId: string) => void;
  consumePendingNewThreadSend: (threadId: string) => PendingNewThreadSend | null;
  clearPendingNewThreadSend: () => void;

  // ── Hub modal (F12) ──
  hubState: { open: boolean; tab?: string } | null;
  openHub: (tab?: string) => void;
  closeHub: () => void;

  // ── F079: Vote modal ──
  showVoteModal: boolean;
  setShowVoteModal: (show: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isLoading: false,
  isLoadingHistory: false,
  hasMore: true,
  hasActiveInvocation: false,
  activeInvocations: {},
  intentMode: null,
  targetAgents: [],
  agentStatuses: {},
  agentInvocations: {},
  currentGame: null,
  queue: [],
  queuePaused: false,
  queueFull: false,

  threadStates: {},
  viewMode: 'single',
  splitPaneThreadIds: [],
  splitPaneTargetId: null,

  currentThreadId: 'default',
  currentProjectPath: 'default',
  _unreadSuppressedUntil: {},
  _pendingAckCount: {},
  _lastReadAtByThread: {},
  threads: [],
  isLoadingThreads: false,
  pendingNewThreadSend: null,
  uiThinkingExpandedByDefault: loadUiThinkingExpandedByDefault(),

  setUiThinkingExpandedByDefault: (next) => {
    persistUiThinkingExpandedByDefault(next);
    set({ uiThinkingExpandedByDefault: next });
  },

  // ── F39: Queue actions ──

  setQueue: (threadId, queue) =>
    set((state) => {
      const wasFull = threadId === state.currentThreadId ? state.queueFull : state.threadStates[threadId]?.queueFull;
      const isShrinking = wasFull && queue.length < MAX_QUEUE_DEPTH;
      if (threadId === state.currentThreadId) {
        return {
          queue,
          queuePaused: queue.length === 0 ? false : state.queuePaused,
          ...(isShrinking ? { queueFull: false, queueFullSource: undefined } : {}),
        };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            queue,
            queuePaused: queue.length === 0 ? false : existing.queuePaused,
            ...(isShrinking ? { queueFull: false, queueFullSource: undefined } : {}),
            lastActivity: Date.now(),
          },
        },
      };
    }),

  setQueuePaused: (threadId, paused, reason) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        return { queuePaused: paused, queuePauseReason: paused ? reason : undefined };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            queuePaused: paused,
            queuePauseReason: paused ? reason : undefined,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  setQueueFull: (threadId, source) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        return { queueFull: true, queueFullSource: source };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            queueFull: true,
            queueFullSource: source,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  markMessagesDelivered: (threadId, messageIds, deliveredAt, serverMessages) =>
    set((state) => {
      const idSet = new Set(messageIds);
      const updateMsgs = (msgs: ChatMessage[]) => {
        // Update deliveredAt on existing messages
        const updated = msgs.map((m) => (idSet.has(m.id) ? { ...m, deliveredAt } : m));
        // F117: Insert user bubbles for queue-sent messages not yet in the store
        if (serverMessages) {
          const existingIds = new Set(updated.map((m) => m.id));
          for (const sm of serverMessages) {
            if (!existingIds.has(sm.id)) {
              updated.push({
                id: sm.id,
                type: 'user',
                content: sm.content,
                timestamp: sm.timestamp,
                deliveredAt,
                contentBlocks: sm.contentBlocks as ChatMessage['contentBlocks'],
              });
            }
          }
        }
        // Re-sort: delivered messages use deliveredAt so they appear at delivery
        // position (current tail), not their original send-time slot.
        updated.sort(compareMessagesByOrder);
        return updated;
      };

      if (threadId === state.currentThreadId) {
        return { messages: updateMsgs(state.messages) };
      }
      const existing = state.threadStates[threadId];
      if (!existing) return state;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: { ...existing, messages: updateMsgs(existing.messages) },
        },
      };
    }),

  // ── F63: Workspace Explorer ──
  rightPanelMode: 'status' as const,
  workspaceWorktreeId: null,
  workspaceOpenTabs: [],
  workspaceOpenFilePath: null,
  workspaceOpenFileLine: null,
  workspaceEditToken: null,
  workspaceEditTokenExpiry: null,
  _workspaceFileSetAt: { ts: 0, threadId: null },
  fileBrowserInitialPath: null,
  fileBrowserInitialTab: null,
  fileBrowserSelectedPath: null,
  setRightPanelMode: (mode) => set({ rightPanelMode: mode }),
  openFileBrowserPanel: (initialTab) => set({ rightPanelMode: 'fileBrowser', fileBrowserInitialPath: null, fileBrowserInitialTab: initialTab ?? null }),
  openFileBrowserPanelWithFile: (path) => set({ rightPanelMode: 'fileBrowser', fileBrowserInitialPath: path, fileBrowserInitialTab: null }),
  setWorkspaceWorktreeId: (id) => {
    // Guard: skip destructive reset when worktreeId is unchanged.
    // setWorkspaceWorktreeId unconditionally clears openFilePath/openTabs,
    // which causes "snapback" if callers (e.g. fetchWorktrees auto-select)
    // redundantly set the same worktreeId that's already active.
    if (id === get().workspaceWorktreeId) return;
    set({
      workspaceWorktreeId: id,
      workspaceOpenTabs: [],
      workspaceOpenFilePath: null,
      workspaceOpenFileLine: null,
      workspaceEditToken: null,
      workspaceEditTokenExpiry: null,
    });
  },
  setWorkspaceOpenFile: (path, line, targetWorktreeId, originThreadId) => {
    if (path) {
      const stamp = { ts: Date.now(), threadId: originThreadId ?? get().currentThreadId };
      // Switch worktree if a different one is specified
      if (targetWorktreeId && targetWorktreeId !== get().workspaceWorktreeId) {
        set({
          workspaceWorktreeId: targetWorktreeId,
          workspaceOpenTabs: [path],
          workspaceOpenFilePath: path,
          workspaceOpenFileLine: line ?? null,
          workspaceEditToken: null,
          workspaceEditTokenExpiry: null,
          _workspaceFileSetAt: stamp,
        });
      } else {
        const tabs = get().workspaceOpenTabs;
        const newTabs = tabs.includes(path) ? tabs : [...tabs, path];
        set({
          workspaceOpenTabs: newTabs,
          workspaceOpenFilePath: path,
          workspaceOpenFileLine: line ?? null,
          _workspaceFileSetAt: stamp,
        });
      }
    } else {
      set({
        workspaceOpenFilePath: null,
        workspaceOpenFileLine: null,
      });
    }
  },
  closeWorkspaceTab: (path) => {
    const { workspaceOpenTabs: tabs, workspaceOpenFilePath: active } = get();
    const newTabs = tabs.filter((t) => t !== path);
    if (active === path) {
      const idx = tabs.indexOf(path);
      const next = newTabs[Math.min(idx, newTabs.length - 1)] ?? null;
      set({ workspaceOpenTabs: newTabs, workspaceOpenFilePath: next, workspaceOpenFileLine: null });
    } else {
      set({ workspaceOpenTabs: newTabs });
    }
  },
  restoreWorkspaceTabs: (tabs, openFile) => {
    set({
      workspaceOpenTabs: tabs,
      workspaceOpenFilePath: openFile,
      workspaceOpenFileLine: null,
      workspaceEditToken: null,
      workspaceEditTokenExpiry: null,
    });
  },
  setWorkspaceEditToken: (token, expiresIn) =>
    set({
      workspaceEditToken: token,
      workspaceEditTokenExpiry: token && expiresIn ? Date.now() + expiresIn * 1000 : null,
    }),

  workspaceRevealPath: null,
  setWorkspaceRevealPath: (path, originThreadId) =>
    set((state) => ({
      workspaceRevealPath: path,
      _workspaceFileSetAt: { ts: Date.now(), threadId: originThreadId ?? state.currentThreadId },
    })),

  // ── F120: Preview auto-open ──
  pendingPreviewAutoOpen: null,
  setPendingPreviewAutoOpen: (data) => set({ pendingPreviewAutoOpen: data }),
  consumePreviewAutoOpen: () => {
    const pending = get().pendingPreviewAutoOpen;
    if (pending) set({ pendingPreviewAutoOpen: null });
    return pending;
  },

  // ── PPT Studio ──
  pptStudioSessions: {},
  activePptPagesDir: null,
  activeOutlinePreview: null,
  upsertPptStudioSlides: (threadId, payload, options) =>
    set((state) => mergePptStudioSession(state, threadId, payload, options)),
  setPptStudioActiveSlide: (pagesDir, activeSlideId) =>
    set((state) => updatePptStudioActiveSlide(state, pagesDir, activeSlideId)),
  setPptStudioStatus: (pagesDir, status) => set((state) => updatePptStudioStatus(state, pagesDir, status)),
  clearPptStudioSession: (pagesDir) => set((state) => removePptStudioSession(state, pagesDir)),
  setActivePptPagesDir: (pagesDir) => set({ activePptPagesDir: pagesDir }),
  openPptStudioPreview: (pagesDir, threadId) =>
    set((state) => openPptStudioPreviewForThread(state, pagesDir, threadId)),
  closePptStudioPreview: (threadId) => set((state) => closePptStudioPreviewForThread(state, threadId)),
  openOutlinePreview: (preview) =>
    set((state) => ({
      activeOutlinePreview: {
        ...preview,
        editedText: preview.initialText,
        panelMode: 'preview',
        isConfirmed: preview.isConfirmed ?? false,
        threadId: preview.threadId ?? state.currentThreadId,
      },
      rightPanelMode: 'outlinePreview',
    })),
  closeOutlinePreview: () =>
    set((state) => {
      if (!state.activeOutlinePreview) return state;
      return {
        activeOutlinePreview: null,
        rightPanelMode: getRightPanelModeForThread(
          { ...state, activeOutlinePreview: null },
          state.currentThreadId,
        ),
      };
    }),
  updateOutlinePreviewText: (text) =>
    set((state) => {
      if (!state.activeOutlinePreview) return state;
      return {
        activeOutlinePreview: {
          ...state.activeOutlinePreview,
          editedText: text,
        },
      };
    }),
  setOutlinePreviewMode: (mode) =>
    set((state) => {
      if (!state.activeOutlinePreview) return state;
      return {
        activeOutlinePreview: {
          ...state.activeOutlinePreview,
          panelMode: mode,
        },
      };
    }),
  setOutlinePreviewConfirmed: (confirmed) =>
    set((state) => {
      if (!state.activeOutlinePreview) return state;
      return {
        activeOutlinePreview: {
          ...state.activeOutlinePreview,
          isConfirmed: confirmed,
        },
      };
    }),

  // ── F63-AC15: Code-to-chat reference ──
  pendingChatInsert: null,
  setPendingChatInsert: (insert) => set({ pendingChatInsert: insert }),
  setPendingNewThreadSend: (payload) => set({ pendingNewThreadSend: snapshotPendingNewThreadSendPayload(payload) }),
  attachPendingNewThreadTarget: (threadId) =>
    set((state) => {
      if (!state.pendingNewThreadSend) return state;
      return {
        pendingNewThreadSend: {
          ...state.pendingNewThreadSend,
          targetThreadId: threadId,
        },
      };
    }),
  consumePendingNewThreadSend: (threadId) => {
    const pending = get().pendingNewThreadSend;
    if (!pending || pending.targetThreadId !== threadId) return null;
    set({ pendingNewThreadSend: null });
    return pending;
  },
  clearPendingNewThreadSend: () => set({ pendingNewThreadSend: null }),

  hubState: null,
  openHub: (tab) => set({ hubState: { open: true, tab } }),
  closeHub: () => set({ hubState: null }),
  showVoteModal: false,
  setShowVoteModal: (show) => set({ showVoteModal: show }),

  // ── Active-thread actions ──

  addMessage: (msg) =>
    set((state) => {
      if (state.messages.some((m) => m.id === msg.id)) return state;
      const messages = [...state.messages, msg].sort(compareMessagesByOrder);
      if (messages.length > MAX_BLOB_MESSAGES) {
        revokeBlobUrls(messages.slice(0, messages.length - MAX_BLOB_MESSAGES));
      }
      // F067: Notify on active thread when user is not focused
      if (msg.mentionsUser && typeof document !== 'undefined' && !document.hasFocus()) {
        fireOwnerMentionNotification(msg);
      }
      return { messages };
    }),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),

  prependHistory: (msgs, hasMore, expectedThreadId) =>
    set((state) => {
      if (expectedThreadId && state.currentThreadId !== expectedThreadId) {
        console.warn('[prependHistory] stale response dropped', {
          currentThreadId: state.currentThreadId,
          expectedThreadId,
        });
        return state;
      }
      const existingIds = new Set(state.messages.map((m) => m.id));
      const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
      return { messages: [...newMsgs, ...state.messages], hasMore };
    }),

  replaceMessages: (msgs, hasMore, expectedThreadId) =>
    set((state) => {
      if (expectedThreadId && state.currentThreadId !== expectedThreadId) {
        console.warn('[replaceMessages] stale response dropped', {
          currentThreadId: state.currentThreadId,
          expectedThreadId,
        });
        return state;
      }
      revokeRemovedBlobUrls(state.messages, msgs);
      return { messages: msgs, hasMore };
    }),

  replaceMessageId: (fromId, toId) =>
    set((state) => {
      const result = replaceMessageIdInList(state.messages, fromId, toId);
      if (result.messages === state.messages) return state;
      recordMessageIdDedupDrop(state.currentThreadId, result.droppedMessage, result.retainedMessage, toId);
      revokeRemovedBlobUrls(state.messages, result.messages);
      return { messages: result.messages };
    }),

  patchMessage: (id, patch) =>
    set((state) => {
      const nextMessages = patchMessageInList(state.messages, id, patch);
      if (nextMessages === state.messages) return state;
      return { messages: nextMessages };
    }),

  appendToLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const last = messages[messages.length - 1];
      if (last && last.type === 'assistant') {
        messages[messages.length - 1] = { ...last, content: last.content + content };
      }
      return { messages };
    }),

  /** 追加内容到指定消息（与后端保持一致：原始拼接） */
  appendToMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id === id) {
          return { ...m, content: (m.content || '') + content };
        }
        return m;
      }),
    })),

  appendToolEvent: (id, event) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, toolEvents: [...(m.toolEvents ?? []), event] } : m)),
    })),

  appendRichBlock: (id, block) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id) return m;
        const rich = m.extra?.rich ?? { v: 1 as const, blocks: [] };
        // Defensive dedup by block.id (server already deduplicates, this is a safety net)
        if (rich.blocks.some((b: { id: string }) => b.id === block.id)) return m;
        return { ...m, extra: { ...m.extra, rich: { ...rich, blocks: [...rich.blocks, block] } } };
      }),
    })),

  /** F096: Update a specific rich block within a message (e.g. set disabled + selectedIds) */
  updateRichBlock: (messageId: string, blockId: string, patch: Record<string, unknown>) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== messageId || !m.extra?.rich?.blocks) return m;
        return {
          ...m,
          extra: {
            ...m.extra,
            rich: {
              ...m.extra.rich,
              blocks: m.extra.rich.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
            },
          },
        };
      }),
    })),

  setStreaming: (id, streaming) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, isStreaming: streaming } : m)),
    })),

  setLoading: (loading) => set({ isLoading: loading }),
  setHasActiveInvocation: (v) => set({ hasActiveInvocation: v }),
  /** F108: Register a new active invocation slot */
  addActiveInvocation: (invocationId, agentId, mode) =>
    set((state) => {
      const activeInvocations = { ...state.activeInvocations, [invocationId]: { agentId, mode, startedAt: Date.now() } };
      return { activeInvocations, hasActiveInvocation: true };
    }),
  /** F108: Remove an active invocation slot; derives hasActiveInvocation */
  removeActiveInvocation: (invocationId) =>
    set((state) => {
      if (!(invocationId in state.activeInvocations)) {
        return { hasActiveInvocation: Object.keys(state.activeInvocations).length > 0 };
      }
      const rest = Object.fromEntries(Object.entries(state.activeInvocations).filter(([k]) => k !== invocationId));
      return { activeInvocations: rest, hasActiveInvocation: Object.keys(rest).length > 0 };
    }),
  /** F108: Clear all active invocations (timeout/error/stop recovery) */
  clearAllActiveInvocations: () => set({ activeInvocations: {}, hasActiveInvocation: false }),
  setLoadingHistory: (loading) => set({ isLoadingHistory: loading }),
  setIntentMode: (mode) => set({ intentMode: mode }),

  setTargetAgents: (agentIds) =>
    set((state) => {
      if (agentIds.length === 0) return { targetAgents: [], agentStatuses: {} };
      const merged = [...new Set([...state.targetAgents, ...agentIds])];
      const statuses = { ...state.agentStatuses };
      for (const c of agentIds) {
        if (!(c in statuses)) statuses[c] = 'pending' as const;
      }
      return { targetAgents: merged, agentStatuses: statuses };
    }),

  setAgentStatus: (agentId, status) =>
    set((state) => {
      if (state.agentStatuses[agentId] === status) return state;
      return { agentStatuses: { ...state.agentStatuses, [agentId]: status } };
    }),

  clearAgentStatuses: () =>
    set((state) => {
      // #586 Bug 2: Mark stale agentInvocations taskProgress as completed so
      // RightStatusPanel stays consistent with agentStatuses being cleared.
      // Cloud review P1: Only touch 'running' snapshots — preserve 'interrupted'
      // which is a distinct semantic state (user-initiated cancel, etc.).
      const cleanedInvocations: Record<string, import('./chat-types').AgentInvocationInfo> = {};
      for (const [agentId, info] of Object.entries(state.agentInvocations)) {
        if (info.taskProgress?.snapshotStatus === 'running') {
          cleanedInvocations[agentId] = {
            ...info,
            taskProgress: { ...info.taskProgress, snapshotStatus: 'completed' },
          };
        } else {
          cleanedInvocations[agentId] = info;
        }
      }
      return { targetAgents: [], agentStatuses: {}, agentInvocations: cleanedInvocations };
    }),

  setAgentInvocation: (agentId, info) =>
    set((state) => ({
      agentInvocations: {
        ...state.agentInvocations,
        [agentId]: { ...state.agentInvocations[agentId], ...info },
      },
    })),

  setMessageUsage: (messageId, usage) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId && m.metadata ? { ...m, metadata: { ...m.metadata, usage } } : m,
      ),
    })),

  setMessageMetadata: (messageId, metadata) => {
    // Skip if message already has metadata (avoid per-chunk re-render during streaming)
    const msg = get().messages.find((m) => m.id === messageId);
    if (msg?.metadata) return;
    set((state) => ({
      messages: state.messages.map((m) => (m.id === messageId ? { ...m, metadata } : m)),
    }));
  },

  setMessageThinking: (messageId, thinking) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, thinking: appendThinkingText(m.thinking, thinking) } : m,
      ),
    })),

  setMessageStreamInvocation: (messageId, invocationId) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              extra: {
                ...m.extra,
                stream: { ...m.extra?.stream, invocationId },
              },
            }
          : m,
      ),
    })),

  setMessageStreamExecutionDuration: (messageId, durationMs) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              extra: {
                ...m.extra,
                stream: { ...m.extra?.stream, durationMs },
              },
            }
          : m,
      ),
    })),

  clearMessages: () =>
    set((state) => {
      revokeBlobUrls(state.messages);
      return { messages: [], hasMore: true };
    }),

  streamCatchUpVersion: 0,
  streamCatchUpThreadId: null,
  requestStreamCatchUp: (threadId: string) =>
    set((state) => ({
      streamCatchUpVersion: state.streamCatchUpVersion + 1,
      streamCatchUpThreadId: threadId,
    })),

  setCurrentGame: (game) => set({ currentGame: game }),

  // ── Thread management ──

  setThreads: (threads) => set({ threads }),
  setCurrentProject: (projectPath) => set({ currentProjectPath: projectPath }),
  setLoadingThreads: (loading) => set({ isLoadingThreads: loading }),

  updateThreadTitle: (threadId, title) =>
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, title } : t)),
    })),

  updateThreadPin: (threadId, pinned) =>
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, pinned, pinnedAt: pinned ? Date.now() : null } : t,
      ),
    })),

  updateThreadFavorite: (threadId, favorited) =>
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, favorited, favoritedAt: favorited ? Date.now() : null } : t,
      ),
    })),

  updateThreadLastActive: (threadId, lastActiveAt) =>
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, lastActiveAt: lastActiveAt ?? Date.now() } : t)),
    })),

  updateThreadThinkingMode: (threadId, mode) =>
    set((state) => ({
      threads: state.threads.map((t) => (t.id === threadId ? { ...t, thinkingMode: mode } : t)),
    })),

  updateThreadPreferredAgents: (threadId, preferredAgentIds) =>
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, preferredAgentIds: preferredAgentIds.length > 0 ? preferredAgentIds : undefined } : t,
      ),
    })),

  /**
   * Switch active thread.
   * Saves current flat state into threadStates map, then restores the target thread's state.
   * This is the key mechanism that preserves per-thread state across switches.
   */
  setCurrentThread: (threadId) =>
    set((state) => {
      if (threadId === state.currentThreadId) return state;

      // Save current flat state to map
      const saved = snapshotActive(state);
      // Load target thread state (or defaults for first visit)
      const loaded = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      const savedThreadLatestReadAt = getLatestMessageTimestamp(saved.messages);
      const prevReadAt = state._lastReadAtByThread[state.currentThreadId] ?? 0;

      return {
        currentThreadId: threadId,
        threadStates: {
          ...state.threadStates,
          [state.currentThreadId]: saved,
        },
        _lastReadAtByThread: {
          ...state._lastReadAtByThread,
          [state.currentThreadId]: Math.max(prevReadAt, savedThreadLatestReadAt),
        },
        rightPanelMode: getRightPanelModeForThread(state, threadId),
        activePptPagesDir: getPreferredPptPagesDirForThread(state, threadId),
        ...flattenThread(loaded),
      };
    }),

  // ── Multi-thread actions ──

  /** Add a message to a specific thread (for background thread socket updates) */
  addMessageToThread: (threadId, msg) =>
    set((state) => {
      // Active thread — delegate to flat state
      if (threadId === state.currentThreadId) {
        if (state.messages.some((m) => m.id === msg.id)) return state;
        const messages = [...state.messages, msg].sort(compareMessagesByOrder);
        if (messages.length > MAX_BLOB_MESSAGES) {
          revokeBlobUrls(messages.slice(0, messages.length - MAX_BLOB_MESSAGES));
        }
        // F067: Notify even on active thread when tab is not focused
        // document.hidden is false when switching macOS apps (only true for tab switch/minimize)
        // document.hasFocus() correctly returns false when another app is in foreground
        if (msg.mentionsUser && typeof document !== 'undefined' && !document.hasFocus()) {
          fireOwnerMentionNotification(msg);
        }
        return { messages };
      }

      // Background thread — update map + increment unread
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      if (existing.messages.some((m) => m.id === msg.id)) return state;
      const lastReadAt = state._lastReadAtByThread[threadId] ?? 0;
      const isBodyMessage = isUnreadBodyMessage(msg);
      const isSeenTail = isSeenCallbackTailMessage(existing, msg);
      const isReplayOrAlreadyViewed =
        !isBodyMessage ||
        isSeenTail ||
        (typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) && msg.timestamp <= lastReadAt);

      // F067 Phase 2: Fire macOS notification for @co-creator mention
      if (msg.mentionsUser && !isReplayOrAlreadyViewed) fireOwnerMentionNotification(msg);

      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            messages: [...existing.messages, msg].sort(compareMessagesByOrder),
            unreadCount: existing.unreadCount + (isReplayOrAlreadyViewed ? 0 : 1),
            hasUserMention: existing.hasUserMention || (!!msg.mentionsUser && !isReplayOrAlreadyViewed),
            lastActivity: Date.now(),
          },
        },
      };
    }),

  removeThreadMessage: (threadId, messageId) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        const nextMessages = state.messages.filter((m) => m.id !== messageId);
        if (nextMessages.length === state.messages.length) return state;
        revokeRemovedBlobUrls(state.messages, nextMessages);
        return { messages: nextMessages };
      }

      const existing = state.threadStates[threadId];
      if (!existing) return state;
      const nextMessages = existing.messages.filter((m) => m.id !== messageId);
      if (nextMessages.length === existing.messages.length) return state;
      revokeRemovedBlobUrls(existing.messages, nextMessages);
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            messages: nextMessages,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  replaceThreadMessageId: (threadId, fromId, toId) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        const result = replaceMessageIdInList(state.messages, fromId, toId);
        if (result.messages === state.messages) return state;
        recordMessageIdDedupDrop(threadId, result.droppedMessage, result.retainedMessage, toId);
        revokeRemovedBlobUrls(state.messages, result.messages);
        return { messages: result.messages };
      }

      const existing = state.threadStates[threadId];
      if (!existing) return state;

      const result = replaceMessageIdInList(existing.messages, fromId, toId);
      if (result.messages === existing.messages) return state;
      recordMessageIdDedupDrop(threadId, result.droppedMessage, result.retainedMessage, toId);
      revokeRemovedBlobUrls(existing.messages, result.messages);
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            messages: result.messages,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  patchThreadMessage: (threadId, messageId, patch) =>
    set((state) => updateThreadMessage(state, threadId, messageId, (m) => applyMessagePatch(m, patch))),

  /** 追加内容到指定线程中的指定消息（与后端保持一致：原始拼接） */
  appendToThreadMessage: (threadId, messageId, content) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => {
        return { ...m, content: (m.content || '') + content };
      }),
    ),

  /** Append tool event to a specific assistant message in a specific thread. */
  appendToolEventToThread: (threadId, messageId, event) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => ({
        ...m,
        toolEvents: [...(m.toolEvents ?? []), event],
      })),
    ),

  /** F22: Append a rich block to a message in a specific thread. */
  appendRichBlockToThread: (threadId, messageId, block) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => {
        const rich = m.extra?.rich ?? { v: 1 as const, blocks: [] };
        if (rich.blocks.some((b: { id: string }) => b.id === block.id)) return m;
        return { ...m, extra: { ...m.extra, rich: { ...rich, blocks: [...rich.blocks, block] } } };
      }),
    ),

  /** Set/merge cat invocation info for a specific thread (active or background). */
  setThreadAgentInvocation: (threadId, agentId, info) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        return {
          agentInvocations: {
            ...state.agentInvocations,
            [agentId]: { ...state.agentInvocations[agentId], ...info },
          },
        };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            agentInvocations: {
              ...existing.agentInvocations,
              [agentId]: { ...existing.agentInvocations[agentId], ...info },
            },
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** Set/merge metadata on a specific message in a specific thread (active or background). */
  setThreadMessageMetadata: (threadId, messageId, metadata) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => ({
        ...m,
        metadata: m.metadata ? { ...m.metadata, ...metadata } : metadata,
      })),
    ),

  /** Set usage on a specific message in a specific thread (active or background). */
  setThreadMessageUsage: (threadId, messageId, usage) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) =>
        m.metadata ? { ...m, metadata: { ...m.metadata, usage } } : m,
      ),
    ),

  /** F045: Set/append extended thinking on an assistant message in a background thread. */
  setThreadMessageThinking: (threadId, messageId, thinking) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => ({
        ...m,
        thinking: appendThinkingText(m.thinking, thinking),
      })),
    ),

  setThreadMessageStreamInvocation: (threadId, messageId, invocationId) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => ({
        ...m,
        extra: {
          ...m.extra,
          stream: { ...m.extra?.stream, invocationId },
        },
      })),
    ),

  setThreadMessageStreamExecutionDuration: (threadId, messageId, durationMs) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => ({
        ...m,
        extra: {
          ...m.extra,
          stream: { ...m.extra?.stream, durationMs },
        },
      })),
    ),

  /** Update isStreaming for a specific message in a specific thread. */
  setThreadMessageStreaming: (threadId, messageId, streaming) =>
    set((state) =>
      updateThreadMessage(state, threadId, messageId, (m) => ({
        ...m,
        isStreaming: streaming,
      })),
    ),

  /** Update isLoading for a specific thread (active or background). */
  setThreadLoading: (threadId, loading) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        return { isLoading: loading };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            isLoading: loading,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** Update hasActiveInvocation for a specific thread (active or background). */
  setThreadHasActiveInvocation: (threadId, active) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        return { hasActiveInvocation: active };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            hasActiveInvocation: active,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** F108: Add an active invocation to a thread (background or active) */
  addThreadActiveInvocation: (threadId, invocationId, agentId, mode) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        const activeInvocations = {
          ...state.activeInvocations,
          [invocationId]: { agentId, mode, startedAt: Date.now() },
        };
        return { activeInvocations, hasActiveInvocation: true };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      const activeInvocations = {
        ...existing.activeInvocations,
        [invocationId]: { agentId, mode, startedAt: Date.now() },
      };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: { ...existing, activeInvocations, hasActiveInvocation: true, lastActivity: Date.now() },
        },
      };
    }),

  /** F108: Remove an active invocation from a thread; derives hasActiveInvocation */
  removeThreadActiveInvocation: (threadId, invocationId) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        const rest = Object.fromEntries(Object.entries(state.activeInvocations).filter(([k]) => k !== invocationId));
        return { activeInvocations: rest, hasActiveInvocation: Object.keys(rest).length > 0 };
      }
      const existing = state.threadStates[threadId];
      if (!existing) return state;
      const rest = Object.fromEntries(Object.entries(existing.activeInvocations).filter(([k]) => k !== invocationId));
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            activeInvocations: rest,
            hasActiveInvocation: Object.keys(rest).length > 0,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** F108: Clear all active invocations for a thread (cancel fallback when invocationId unknown). */
  clearAllThreadActiveInvocations: (threadId) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        return { activeInvocations: {}, hasActiveInvocation: false };
      }
      const existing = state.threadStates[threadId];
      if (!existing) return state;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            activeInvocations: {},
            hasActiveInvocation: false,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** Update intentMode for a specific thread (active or background).
   *  Also resets agentStatuses — new intent mode = new invocation = fresh statuses. */
  setThreadIntentMode: (threadId, mode) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        return { intentMode: mode, agentStatuses: {} };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            intentMode: mode,
            agentStatuses: {},
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** Update targetAgents for a specific thread (active or background).
   *  Also pre-seeds agentStatuses with 'pending' — mirrors active setTargetAgents
   *  so ThreadAgentStatus renders the working indicator immediately. */
  setThreadTargetAgents: (threadId, agentIds) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        if (agentIds.length === 0) return { targetAgents: [], agentStatuses: {} };
        const merged = [...new Set([...state.targetAgents, ...agentIds])];
        const statuses = { ...state.agentStatuses };
        for (const c of agentIds) {
          if (!(c in statuses)) statuses[c] = 'pending' as const;
        }
        return { targetAgents: merged, agentStatuses: statuses };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      if (agentIds.length === 0) {
        return {
          threadStates: {
            ...state.threadStates,
            [threadId]: { ...existing, targetAgents: [], agentStatuses: {}, lastActivity: Date.now() },
          },
        };
      }
      const prevAgentIds = existing.targetAgents ?? [];
      const prevStatuses = (existing.agentStatuses ?? {}) as Record<string, AgentStatusType>;
      const merged = [...new Set([...prevAgentIds, ...agentIds])];
      const statuses: Record<string, AgentStatusType> = { ...prevStatuses };
      for (const c of agentIds) {
        if (!(c in statuses)) statuses[c] = 'pending' as const;
      }
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            targetAgents: merged,
            agentStatuses: statuses,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** Server-authoritative replace for queue hydration / history restore.
   *  Unlike setThreadTargetAgents (merge), this overwrites targetAgents entirely
   *  so stale agent ids are removed. */
  replaceThreadTargetAgents: (threadId, agentIds) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        if (agentIds.length === 0) return { targetAgents: [], agentStatuses: {} };
        const statuses: Record<string, AgentStatusType> = {};
        for (const c of agentIds) statuses[c] = 'pending' as const;
        return { targetAgents: [...agentIds], agentStatuses: statuses };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      if (agentIds.length === 0) {
        return {
          threadStates: {
            ...state.threadStates,
            [threadId]: { ...existing, targetAgents: [], agentStatuses: {}, lastActivity: Date.now() },
          },
        };
      }
      const statuses: Record<string, AgentStatusType> = {};
      for (const c of agentIds) statuses[c] = 'pending' as const;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            targetAgents: [...agentIds],
            agentStatuses: statuses,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** Get a thread's state (active thread returns flat state, others return map) */
  getThreadState: (threadId) => {
    const state = get();
    if (threadId === state.currentThreadId) return snapshotActive(state);
    return state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
  },

  incrementUnread: (threadId) =>
    set((state) => {
      if (threadId === state.currentThreadId) return state;
      const ts = state.threadStates[threadId];
      if (!ts) return state;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: { ...ts, unreadCount: ts.unreadCount + 1 },
        },
      };
    }),

  clearUnread: (threadId) =>
    set((state) => {
      const ts = state.threadStates[threadId];
      if (!ts || (ts.unreadCount === 0 && !ts.hasUserMention)) return state;
      const latestReadAt = getLatestMessageTimestamp(ts.messages);
      const prevReadAt = state._lastReadAtByThread[threadId] ?? 0;
      // #586 Bug 3: Use Infinity instead of 10s timeout. Suppression persists
      // until confirmUnreadAck() is called after POST /read/latest succeeds,
      // preventing stale server unread counts from overwriting cleared state.
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: { ...ts, unreadCount: 0, hasUserMention: false },
        },
        _lastReadAtByThread: {
          ...state._lastReadAtByThread,
          [threadId]: Math.max(prevReadAt, latestReadAt),
        },
        _unreadSuppressedUntil: {
          ...state._unreadSuppressedUntil,
          [threadId]: Infinity,
        },
      };
    }),

  clearAllUnread: () =>
    set((state) => {
      const updated: Record<string, ThreadState> = {};
      // #586 P1-1 fix: clearAllUnread is called AFTER POST /mark-all succeeds
      // (server cursors already updated), so a short grace window suffices.
      // Using Infinity here would permanently block initThreadUnread for threads
      // the user never opens (no ChatContainer ack effect to release them).
      const suppressUntil = Date.now() + 30_000;
      const suppressed: Record<string, number> = { ...state._unreadSuppressedUntil };
      const nextReadAtByThread: Record<string, number> = { ...state._lastReadAtByThread };
      let changed = false;
      for (const [tid, ts] of Object.entries(state.threadStates)) {
        if (ts.unreadCount > 0 || ts.hasUserMention) {
          updated[tid] = { ...ts, unreadCount: 0, hasUserMention: false };
          suppressed[tid] = suppressUntil;
          nextReadAtByThread[tid] = Math.max(nextReadAtByThread[tid] ?? 0, getLatestMessageTimestamp(ts.messages));
          changed = true;
        } else {
          updated[tid] = ts;
        }
      }
      return changed
        ? { threadStates: updated, _unreadSuppressedUntil: suppressed, _lastReadAtByThread: nextReadAtByThread }
        : state;
    }),

  confirmUnreadAck: (threadId) =>
    set((state) => {
      // #586 final: Decrement pending ack count. Only clear suppression when
      // ALL in-flight acks have resolved — this prevents an early-resolving ack
      // from clearing suppression while a newer ack is still in flight.
      const count = Math.max(0, (state._pendingAckCount[threadId] ?? 1) - 1);
      const newCounts = { ...state._pendingAckCount, [threadId]: count };
      if (count > 0) {
        // Still have pending acks — keep suppression, just update counter
        return { _pendingAckCount: newCounts };
      }
      // All acks resolved — safe to clear suppression
      if (!state._unreadSuppressedUntil[threadId]) return { _pendingAckCount: newCounts };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [threadId]: _removed, ...rest } = state._unreadSuppressedUntil;
      return { _unreadSuppressedUntil: rest, _pendingAckCount: newCounts };
    }),

  armUnreadSuppression: (threadId) =>
    set((state) => ({
      // #586 final: Increment pending ack count + set Infinity suppression.
      // Each ack attempt increments; confirmUnreadAck decrements. Suppression
      // only clears when counter reaches 0 (all in-flight acks resolved).
      _unreadSuppressedUntil: {
        ...state._unreadSuppressedUntil,
        [threadId]: Infinity,
      },
      _pendingAckCount: {
        ...state._pendingAckCount,
        [threadId]: (state._pendingAckCount[threadId] ?? 0) + 1,
      },
    })),

  initThreadUnread: (threadId, unreadCount, hasUserMention) =>
    set((state) => {
      if (threadId === state.currentThreadId) return state;
      // Skip re-hydration if this thread was recently cleared (ack race suppression)
      const suppressUntil = state._unreadSuppressedUntil[threadId];
      if (suppressUntil && Date.now() < suppressUntil) return state;
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      if (existing.unreadCount === unreadCount && existing.hasUserMention === hasUserMention) return state;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: { ...existing, unreadCount, hasUserMention },
        },
      };
    }),

  /** Update a specific cat's status in a background thread (for sidebar indicators) */
  updateThreadAgentStatus: (threadId, agentId, status) =>
    set((state) => {
      if (threadId === state.currentThreadId) {
        if (state.agentStatuses[agentId] === status) return state;
        return { agentStatuses: { ...state.agentStatuses, [agentId]: status } };
      }
      const existing = state.threadStates[threadId] ?? { ...DEFAULT_THREAD_STATE };
      if (existing.agentStatuses[agentId] === status) return state;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            agentStatuses: { ...existing.agentStatuses, [agentId]: status },
            lastActivity: Date.now(),
          },
        },
      };
    }),

  batchStreamChunkUpdate: ({ threadId, messageId, agentId, content, metadata, streaming, nextAgentStatus }) =>
    set((state) => {
      const applyMessageUpdate = (m: ChatMessage): ChatMessage => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          content: m.content + content,
          ...(metadata ? { metadata: m.metadata ? { ...m.metadata, ...metadata } : metadata } : {}),
          isStreaming: streaming,
        };
      };

      if (threadId === state.currentThreadId) {
        const statusChanged = state.agentStatuses[agentId] !== nextAgentStatus;
        return {
          messages: state.messages.map(applyMessageUpdate),
          ...(statusChanged ? { agentStatuses: { ...state.agentStatuses, [agentId]: nextAgentStatus } } : {}),
        };
      }

      const existing = state.threadStates[threadId];
      if (!existing) return state;
      const statusChanged = existing.agentStatuses[agentId] !== nextAgentStatus;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...existing,
            messages: existing.messages.map(applyMessageUpdate),
            ...(statusChanged ? { agentStatuses: { ...existing.agentStatuses, [agentId]: nextAgentStatus } } : {}),
            lastActivity: Date.now(),
          },
        },
      };
    }),

  /** Clear hasActiveInvocation for a specific thread (active or background) */
  clearThreadActiveInvocation: (threadId) =>
    set((state) => {
      // Active thread — clear flat state
      if (threadId === state.currentThreadId) {
        return { hasActiveInvocation: false, activeInvocations: {} };
      }
      // Background thread — update in threadStates map (no-op if unknown)
      const ts = state.threadStates[threadId];
      if (!ts) return state;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: { ...ts, hasActiveInvocation: false, activeInvocations: {} },
        },
      };
    }),

  /** Clear invocation-scoped UI state for a specific thread (active or background) */
  resetThreadInvocationState: (threadId) =>
    set((state) => {
      const resetPatch = {
        isLoading: false,
        hasActiveInvocation: false,
        intentMode: null,
        targetAgents: [] as string[],
        agentStatuses: {} as Record<string, AgentStatusType>,
      };

      // Active thread — clear flat state
      if (threadId === state.currentThreadId) {
        return resetPatch;
      }

      // Background thread — update in threadStates map (no-op if unknown)
      const ts = state.threadStates[threadId];
      if (!ts) return state;
      return {
        threadStates: {
          ...state.threadStates,
          [threadId]: {
            ...ts,
            ...resetPatch,
            lastActivity: Date.now(),
          },
        },
      };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),
  setSplitPaneThreadIds: (ids) => set({ splitPaneThreadIds: ids }),
  setSplitPaneTarget: (threadId) => set({ splitPaneTargetId: threadId }),
}));
