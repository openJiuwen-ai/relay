/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Storage Plugin API — the contract that third-party storage providers implement.
 *
 * Parallel to auth.ts: external packages implement OfficeClawStorageProvider,
 * export it, and the runtime loads + registers it via env var.
 *
 * Design constraints:
 *   - Provider ID is a runtime string, never an enum/union.
 *   - Provider creates store instances; the platform passes options (TTL, callbacks).
 *   - No silent fallback: if a provider fails to create a store, the platform fails fast.
 */

import type { IAuthorizationAuditStore, IAuthorizationRuleStore } from './authorization-types.js';
import type {
  ApprovalDecision,
  ApprovalRecordInput,
  ApprovalScope,
  ApprovalSource,
  IApprovalRecordStore,
  ListApprovalRecordsQuery,
  SecurityApprovalRecord,
  SecurityApprovalRecordSettings,
  SecurityApprovalRecordsResponse,
} from './authorization-types.js';
import type { IBacklogStore } from './backlog-types.js';
import type { IDraftStore } from './draft-types.js';
import type { IInvocationRecordStore } from './invocation-record-types.js';
import type { IMemoryStore } from './memory-kv-types.js';
import type { IMessageStore, StoredMessage } from './message-types.js';
import type { IPendingRequestStore } from './pending-request-types.js';
import type { IPushSubscriptionStore } from './push-subscription-types.js';
import type { IThreadReadStateStore } from './read-state-types.js';
import type { ISessionChainStore } from './session-chain-types.js';
import type { ITaskStore } from './task-types.js';
import type { IThreadStore } from './thread-types.js';
import type { IWorkflowSopStore } from './workflow-sop-types.js';

// ---------------------------------------------------------------------------
// Store creation options — passed from platform to provider
// ---------------------------------------------------------------------------

export interface CreateMessageStoreOptions {
  onAppend?: (msg: Pick<StoredMessage, 'id' | 'threadId' | 'timestamp' | 'content'>) => void;
  ttlSeconds?: number;
}

export interface CreateThreadStoreOptions {
  ttlSeconds?: number;
}

export interface CreateStoreOptions {
  ttlSeconds?: number;
}

export interface CreateApprovalRecordStoreOptions {
  storagePath?: string;
}

// ---------------------------------------------------------------------------
// OfficeClawStorageProvider — the main contract
// ---------------------------------------------------------------------------

export interface OfficeClawStorageProvider {
  readonly id: string;
  readonly displayName?: string;

  createMessageStore(options?: CreateMessageStoreOptions): IMessageStore | Promise<IMessageStore>;
  createThreadStore(options?: CreateThreadStoreOptions): IThreadStore | Promise<IThreadStore>;
  createTaskStore(options?: CreateStoreOptions): ITaskStore | Promise<ITaskStore>;
  createBacklogStore(options?: CreateStoreOptions): IBacklogStore | Promise<IBacklogStore>;
  createMemoryStore(options?: CreateStoreOptions): IMemoryStore | Promise<IMemoryStore>;
  createDraftStore(options?: CreateStoreOptions): IDraftStore | Promise<IDraftStore>;
  createSessionChainStore(options?: CreateStoreOptions): ISessionChainStore | Promise<ISessionChainStore>;
  createInvocationRecordStore(options?: CreateStoreOptions): IInvocationRecordStore | Promise<IInvocationRecordStore>;
  createPendingRequestStore(options?: CreateStoreOptions): IPendingRequestStore | Promise<IPendingRequestStore>;
  createAuthorizationRuleStore(
    options?: CreateStoreOptions,
  ): IAuthorizationRuleStore | Promise<IAuthorizationRuleStore>;
  createAuthorizationAuditStore(
    options?: CreateStoreOptions,
  ): IAuthorizationAuditStore | Promise<IAuthorizationAuditStore>;
  createApprovalRecordStore?(
    options?: CreateApprovalRecordStoreOptions,
  ): IApprovalRecordStore | Promise<IApprovalRecordStore>;
  createPushSubscriptionStore(options?: CreateStoreOptions): IPushSubscriptionStore | Promise<IPushSubscriptionStore>;
  createReadStateStore(options?: CreateStoreOptions): IThreadReadStateStore | Promise<IThreadReadStateStore>;
  createWorkflowSopStore(options?: CreateStoreOptions): IWorkflowSopStore | Promise<IWorkflowSopStore>;

  bootstrap?(): Promise<void>;
  shutdown?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Re-exports — single import path for consumers
// ---------------------------------------------------------------------------

export type {
  ApprovalDecision,
  ApprovalRecordInput,
  ApprovalScope,
  ApprovalSource,
  CreateAuditInput,
  IAuthorizationAuditStore,
  IAuthorizationRuleStore,
  IApprovalRecordStore,
  ListApprovalRecordsQuery,
  SecurityApprovalRecord,
  SecurityApprovalRecordSettings,
  SecurityApprovalRecordsResponse,
} from './authorization-types.js';
export type { IBacklogStore } from './backlog-types.js';
export type { DraftRecord, IDraftStore } from './draft-types.js';
export type {
  CreateInvocationInput,
  CreateResult,
  IInvocationRecordStore,
  InvocationRecord,
  InvocationStatus,
  UpdateInvocationInput,
} from './invocation-record-types.js';
export type { IMemoryStore } from './memory-kv-types.js';
export { MAX_KEYS_PER_THREAD } from './memory-kv-types.js';
export type {
  AppendMessageInput,
  IMessageStore,
  MessageMetadata,
  StoredMessage,
  StoredToolEvent,
  TokenUsage,
} from './message-types.js';
export type { CreatePendingInput, IPendingRequestStore } from './pending-request-types.js';
export type { IPushSubscriptionStore, PushSubscriptionRecord } from './push-subscription-types.js';
export type { IThreadReadStateStore, ThreadReadState, ThreadUnreadSummary } from './read-state-types.js';
export type { CreateSessionInput, ISessionChainStore, SessionRecordPatch } from './session-chain-types.js';
export type { ITaskStore } from './task-types.js';
export type {
  BootcampPhase,
  BootcampStateV1,
  ConnectorHubStateV1,
  IThreadStore,
  MentionActionabilityMode,
  MentionRoutingSuppressionReason,
  Thread,
  ThreadMemoryV1,
  ThreadMentionRoutingFeedback,
  ThreadMentionRoutingFeedbackItem,
  ThreadParticipantActivity,
  ThreadRoutingPolicyV1,
  ThreadRoutingRule,
  ThreadRoutingScope,
  VotingStateV1,
} from './thread-types.js';
export { DEFAULT_THREAD_ID } from './thread-types.js';

export type { IWorkflowSopStore } from './workflow-sop-types.js';
export { VersionConflictError } from './workflow-sop-types.js';
