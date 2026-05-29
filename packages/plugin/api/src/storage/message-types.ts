/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Message storage contract — DTOs and interface for message persistence.
 *
 * These types were extracted from the API's internal MessageStore port
 * so that external storage providers can implement IMessageStore without
 * depending on the full API package.
 */

import type {
  AgentId,
  ConnectorSource,
  ErrorFallbackMetadata,
  MessageContent,
  RichMessageExtra,
  TaskRunPersistExtra,
} from '@openjiuwen/relay-shared';

// ---------------------------------------------------------------------------
// Token / Metadata DTOs (moved from api/domains/agents/services/types.ts)
// ---------------------------------------------------------------------------

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  contextWindowSize?: number;
  lastTurnInputTokens?: number;
  contextUsedTokens?: number;
  contextResetsAtMs?: number;
}

export interface MessageMetadata {
  provider: string;
  model: string;
  sessionId?: string;
  usage?: TokenUsage;
  modelVerified?: boolean;
}

// ---------------------------------------------------------------------------
// Stored message DTOs
// ---------------------------------------------------------------------------

export interface StoredToolEvent {
  id: string;
  type: 'tool_use' | 'tool_result';
  label: string;
  detail?: string;
  timestamp: number;
  toolCallId?: string;
}

export interface StoredMessage {
  id: string;
  threadId: string;
  userId: string;
  agentId: AgentId | null;
  content: string;
  contentBlocks?: readonly MessageContent[];
  toolEvents?: readonly StoredToolEvent[];
  metadata?: MessageMetadata;
  extra?: {
    rich?: RichMessageExtra;
    stream?: { invocationId: string; durationMs?: number; userStopped?: boolean };
    crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
    targetAgents?: string[];
    errorFallback?: ErrorFallbackMetadata;
    taskRuns?: TaskRunPersistExtra;
  };
  mentions: readonly AgentId[];
  mentionsUser?: boolean;
  timestamp: number;
  thinking?: string;
  origin?: 'stream' | 'callback';
  visibility?: 'public' | 'whisper';
  whisperTo?: readonly AgentId[];
  revealedAt?: number;
  source?: ConnectorSource;
  deliveredAt?: number;
  deliveryStatus?: 'queued' | 'delivered' | 'canceled';
  replyTo?: string;
  deletedAt?: number;
  deletedBy?: string;
  _tombstone?: true;
}

export type AppendMessageInput = Omit<StoredMessage, 'id' | 'threadId'> & {
  threadId?: string;
  idempotencyKey?: string;
};

// ---------------------------------------------------------------------------
// IMessageStore — the contract that storage providers implement
// ---------------------------------------------------------------------------

export interface IMessageStore {
  onAppend?: (msg: Pick<StoredMessage, 'id' | 'threadId' | 'timestamp' | 'content'>) => void;
  append(msg: AppendMessageInput): StoredMessage | Promise<StoredMessage>;
  getById(id: string): StoredMessage | null | Promise<StoredMessage | null>;
  getRecent(limit?: number, userId?: string): StoredMessage[] | Promise<StoredMessage[]>;
  getMentionsFor(
    agentId: AgentId,
    limit?: number,
    userId?: string,
    threadId?: string,
    afterMessageId?: string,
  ): StoredMessage[] | Promise<StoredMessage[]>;
  getRecentMentionsFor(
    agentId: AgentId,
    limit?: number,
    userId?: string,
    threadId?: string,
  ): StoredMessage[] | Promise<StoredMessage[]>;
  getBefore(
    timestamp: number,
    limit?: number,
    userId?: string,
    beforeId?: string,
  ): StoredMessage[] | Promise<StoredMessage[]>;
  getByThread(threadId: string, limit?: number, userId?: string): StoredMessage[] | Promise<StoredMessage[]>;
  getByThreadAfter(
    threadId: string,
    afterId?: string,
    limit?: number,
    userId?: string,
  ): StoredMessage[] | Promise<StoredMessage[]>;
  getByThreadBefore(
    threadId: string,
    timestamp: number,
    limit?: number,
    beforeId?: string,
    userId?: string,
  ): StoredMessage[] | Promise<StoredMessage[]>;
  deleteByThread(threadId: string): number | Promise<number>;
  softDelete(id: string, deletedBy: string): StoredMessage | null | Promise<StoredMessage | null>;
  hardDelete(id: string, deletedBy: string): StoredMessage | null | Promise<StoredMessage | null>;
  restore(id: string): StoredMessage | null | Promise<StoredMessage | null>;
  revealWhispers(threadId: string, userId: string): number | Promise<number>;
  updateExtra(
    id: string,
    extra: NonNullable<StoredMessage['extra']>,
  ): StoredMessage | null | Promise<StoredMessage | null>;
  markDelivered(id: string, deliveredAt: number): StoredMessage | null | Promise<StoredMessage | null>;
  markCanceled(id: string): StoredMessage | null | Promise<StoredMessage | null>;
}
