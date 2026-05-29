/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  PptStudioSlidesUpdate,
  PptStudioStatus,
  AgentInvocationInfo,
  AgentStatusType,
  ChatMessage,
  ChatMessageMetadata,
  ConnectorSourceData,
  ChatMessagePatch,
  RichBlock,
  ThreadState,
  TokenUsage,
  ToolEvent,
} from '@/stores/chat-types';

export interface BackgroundAgentMessage {
  type: string;
  agentId: string;
  threadId: string;
  content?: string;
  messageId?: string;
  origin?: 'stream' | 'callback';
  source?: ConnectorSourceData;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  isFinal?: boolean;
  metadata?: { provider: string; model: string; sessionId?: string; usage?: TokenUsage };
  /** F52: Cross-thread origin metadata */
  extra?: {
    crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
    errorFallback?: { v: number; kind: string; rawError: string; timestamp: number };
  };
  /** F057-C2: Whether this message mentions the user (@user / @用户) */
  mentionsUser?: boolean;
  /** F121: Reply-to message ID */
  replyTo?: string;
  /** F121: Server-hydrated reply preview */
  replyPreview?: { senderAgentId: string | null; content: string; deleted?: true };
  /** F108: Invocation ID — distinguishes messages from concurrent invocations */
  invocationId?: string;
  /** F142: Tool call ID for precise pairing (from backend AgentMessage) */
  toolCallId?: string;
  timestamp: number;
}

export interface BackgroundStreamRef {
  id: string;
  threadId: string;
  agentId: string;
}

export interface BackgroundToastInput {
  type: 'success' | 'error';
  title: string;
  message: string;
  threadId: string;
  threadTitle?: string;
  duration: number;
}

export interface BackgroundStoreLike {
  addMessageToThread: (threadId: string, msg: ChatMessage) => void;
  removeThreadMessage: (threadId: string, messageId: string) => void;
  appendToThreadMessage: (threadId: string, messageId: string, content: string) => void;
  appendToolEventToThread: (threadId: string, messageId: string, event: ToolEvent) => void;
  /** F22: Append a rich block to a message in a specific thread */
  appendRichBlockToThread: (threadId: string, messageId: string, block: RichBlock) => void;
  setThreadAgentInvocation: (threadId: string, agentId: string, info: Partial<AgentInvocationInfo>) => void;
  setThreadMessageMetadata: (threadId: string, messageId: string, metadata: ChatMessageMetadata) => void;
  setThreadMessageUsage: (threadId: string, messageId: string, usage: TokenUsage) => void;
  /** F045: Set or append extended thinking on an assistant message in a background thread */
  setThreadMessageThinking: (threadId: string, messageId: string, thinking: string) => void;
  /** F081: Persist stream invocation identity on background assistant bubbles */
  setThreadMessageStreamInvocation: (threadId: string, messageId: string, invocationId: string) => void;
  setThreadMessageStreamExecutionDuration: (threadId: string, messageId: string, durationMs: number) => void;
  setThreadMessageStreaming: (threadId: string, messageId: string, streaming: boolean) => void;
  setThreadLoading: (threadId: string, loading: boolean) => void;
  setThreadHasActiveInvocation: (threadId: string, active: boolean) => void;
  /** F108: Add an active invocation slot to a thread */
  addThreadActiveInvocation: (threadId: string, invocationId: string, agentId: string, mode: string) => void;
  /** F108: Remove an active invocation slot from a thread */
  removeThreadActiveInvocation: (threadId: string, invocationId: string) => void;
  updateThreadAgentStatus: (threadId: string, agentId: string, status: AgentStatusType) => void;
  /** Batch content-append + metadata + streaming + nextAgentStatus into one set(). */
  batchStreamChunkUpdate: (params: {
    threadId: string;
    messageId: string;
    agentId: string;
    content: string;
    metadata?: ChatMessageMetadata;
    streaming: boolean;
    nextAgentStatus: AgentStatusType;
  }) => void;
  clearThreadActiveInvocation: (threadId: string) => void;
  getThreadState: (threadId: string) => ThreadState;
  replaceThreadMessageId: (threadId: string, fromId: string, toId: string) => void;
  patchThreadMessage: (threadId: string, messageId: string, patch: ChatMessagePatch) => void;
  upsertPptStudioSlides: (threadId: string, payload: PptStudioSlidesUpdate) => void;
  setPptStudioStatus: (threadId: string, status: PptStudioStatus) => void;
}

export interface HandleBackgroundMessageOptions {
  store: BackgroundStoreLike;
  bgStreamRefs: Map<string, BackgroundStreamRef>;
  replacedInvocations: Map<string, string>;
  backgroundErrorToastsShown: Set<string>;
  nextBgSeq: () => number;
  addToast: (toast: BackgroundToastInput) => void;
  getThreadTitle?: (threadId: string) => string | null | undefined;
  clearDoneTimeout?: (threadId?: string) => void;
  finalizedBgRefs: Map<string, string>;
  notifyTaskComplete?: (title: string, body: string, type: 'success' | 'error', threadId: string) => void;
}

export type ActiveRoutedAgentMessage = {
  type: string;
  agentId: string;
  threadId?: string;
  isFinal?: boolean;
};
