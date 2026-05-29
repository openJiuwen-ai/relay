/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from './ids.js';

export type BacklogPriority = 'p0' | 'p1' | 'p2' | 'p3';
export type BacklogStatus = 'open' | 'suggested' | 'approved' | 'dispatched' | 'done';
export type ThreadPhase = 'coding' | 'research' | 'brainstorm';
export type BacklogSuggestionStatus = 'pending' | 'approved' | 'rejected';
export type BacklogLeaseState = 'active' | 'released' | 'reclaimed';

export interface BacklogClaimSuggestion {
  readonly agentId: AgentId;
  readonly why: string;
  readonly plan: string;
  readonly requestedPhase: ThreadPhase;
  readonly status: BacklogSuggestionStatus;
  readonly suggestedAt: number;
  readonly decidedAt?: number;
  readonly decidedBy?: string;
  readonly note?: string;
}

export interface BacklogLease {
  readonly ownerAgentId: AgentId;
  readonly state: BacklogLeaseState;
  readonly acquiredAt: number;
  readonly heartbeatAt: number;
  readonly expiresAt: number;
  readonly releasedAt?: number;
  readonly releasedBy?: string;
  readonly reclaimedAt?: number;
  readonly reclaimedBy?: string;
}

export type BacklogAuditAction =
  | 'created'
  | 'refreshed'
  | 'suggested'
  | 'approved'
  | 'rejected'
  | 'dispatched'
  | 'done'
  | 'lease_acquired'
  | 'lease_heartbeat'
  | 'lease_released'
  | 'lease_reclaimed';

export interface BacklogAuditActor {
  readonly kind: 'agent' | 'user';
  readonly id: string;
}

export interface BacklogAuditEntry {
  readonly id: string;
  readonly action: BacklogAuditAction;
  readonly actor: BacklogAuditActor;
  readonly timestamp: number;
  readonly detail?: string;
}

export interface BacklogItem {
  readonly id: string;
  readonly userId: string;
  readonly projectId?: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: BacklogPriority;
  readonly tags: readonly string[];
  readonly status: BacklogStatus;
  readonly createdBy: AgentId | 'user';
  readonly suggestion?: BacklogClaimSuggestion;
  readonly lease?: BacklogLease;
  readonly dispatchedThreadId?: string;
  readonly dispatchedThreadPhase?: ThreadPhase;
  readonly dispatchAttemptId?: string;
  readonly pendingThreadId?: string;
  readonly kickoffMessageId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly approvedAt?: number;
  readonly dispatchedAt?: number;
  readonly doneAt?: number;
  readonly dependencies?: BacklogDependencies;
  readonly audit: readonly BacklogAuditEntry[];
}

export interface CreateBacklogItemInput {
  readonly userId: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: BacklogPriority;
  readonly tags: readonly string[];
  readonly createdBy: AgentId | 'user';
  readonly dependencies?: BacklogDependencies;
  /** Optional initial status for import (skips workflow transitions). Defaults to 'open'. */
  readonly initialStatus?: BacklogStatus;
  /** Optional project scope for cross-project backlog (F076). */
  readonly projectId?: string;
}

export interface RefreshBacklogItemInput {
  readonly title: string;
  readonly summary: string;
  readonly priority: BacklogPriority;
  readonly tags: readonly string[];
  readonly refreshedBy: string;
  readonly dependencies?: BacklogDependencies;
  /** Optional status override from import. Only upgrades (open→dispatched), never downgrades. */
  readonly importStatus?: BacklogStatus;
}

export interface SuggestBacklogClaimInput {
  readonly agentId: AgentId;
  readonly why: string;
  readonly plan: string;
  readonly requestedPhase: ThreadPhase;
}

export interface DecideBacklogClaimInput {
  readonly decision: 'approve' | 'reject';
  readonly decidedBy: string;
  readonly note?: string;
}

export interface DispatchBacklogItemInput {
  readonly threadId: string;
  readonly threadPhase: ThreadPhase;
  readonly dispatchedBy: string;
}

export interface UpdateBacklogDispatchProgressInput {
  readonly updatedBy: string;
  readonly dispatchAttemptId?: string;
  readonly pendingThreadId?: string;
  readonly kickoffMessageId?: string;
}

export interface AcquireBacklogLeaseInput {
  readonly agentId: AgentId;
  readonly ttlMs: number;
  readonly actorId: string;
}

export interface HeartbeatBacklogLeaseInput {
  readonly agentId: AgentId;
  readonly ttlMs: number;
  readonly actorId: string;
}

export interface ReleaseBacklogLeaseInput {
  readonly actorId: string;
  readonly agentId?: AgentId;
}

export interface ReclaimBacklogLeaseInput {
  readonly actorId: string;
}

export interface MarkDoneInput {
  readonly doneBy: string;
}

export interface BacklogDependencies {
  readonly evolvedFrom?: readonly string[];
  readonly blockedBy?: readonly string[];
  readonly related?: readonly string[];
}

export interface AtomicDispatchInput {
  readonly dispatchAttemptId: string;
  readonly pendingThreadId: string;
  readonly kickoffMessageId: string;
  readonly threadId: string;
  readonly threadPhase: ThreadPhase;
  readonly dispatchedBy: string;
}

export interface FeatureDocAC {
  readonly id: string;
  readonly text: string;
  readonly done: boolean;
}

export interface FeatureDocPhase {
  readonly id: string;
  readonly name: string;
  readonly acs: readonly FeatureDocAC[];
}

export interface FeatureDocRisk {
  readonly risk: string;
  readonly mitigation: string;
}

export interface FeatureDocDetail {
  readonly featureId: string;
  readonly status: string | null;
  readonly owner: string | null;
  readonly phases: readonly FeatureDocPhase[];
  readonly risks: readonly FeatureDocRisk[];
  readonly dependencies: BacklogDependencies;
}
