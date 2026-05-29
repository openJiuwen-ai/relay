/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Thread storage contract — DTOs and interface for thread persistence.
 *
 * These types were extracted from the API's internal ThreadStore port
 * so that external storage providers can implement IThreadStore without
 * depending on the full API package.
 */

import type { AgentId, ThreadPhase } from '@openjiuwen/relay-shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_THREAD_ID = 'default';

// ---------------------------------------------------------------------------
// Thread DTOs
// ---------------------------------------------------------------------------

export interface ThreadParticipantActivity {
  agentId: AgentId;
  lastMessageAt: number;
  messageCount: number;
}

export type ThreadRoutingScope = 'review' | 'architecture';

export interface ThreadRoutingRule {
  preferCats?: AgentId[];
  avoidCats?: AgentId[];
  reason?: string;
  expiresAt?: number;
}

export interface ThreadRoutingPolicyV1 {
  v: 1;
  scopes?: Partial<Record<ThreadRoutingScope, ThreadRoutingRule>>;
}

export interface ThreadMemoryV1 {
  v: 1;
  summary: string;
  sessionsIncorporated: number;
  updatedAt: number;
}

export type MentionRoutingSuppressionReason = 'no_action' | 'cross_paragraph';
export type MentionActionabilityMode = 'strict' | 'relaxed';

export interface ThreadMentionRoutingFeedbackItem {
  targetAgentId: AgentId;
  reason: MentionRoutingSuppressionReason;
}

export interface ThreadMentionRoutingFeedback {
  sourceMessageId?: string;
  sourceTimestamp: number;
  items: ThreadMentionRoutingFeedbackItem[];
}

export interface ConnectorHubStateV1 {
  v: 1;
  connectorId: string;
  externalChatId: string;
  createdAt: number;
  lastCommandAt?: number;
}

export type BootcampPhase =
  | 'phase-0-select-agent'
  | 'phase-1-intro'
  | 'phase-2-env-check'
  | 'phase-3-config-help'
  | 'phase-3.5-advanced'
  | 'phase-4-task-select'
  | 'phase-5-kickoff'
  | 'phase-6-design'
  | 'phase-7-dev'
  | 'phase-8-review'
  | 'phase-9-complete'
  | 'phase-10-retro'
  | 'phase-11-farewell';

export interface BootcampStateV1 {
  v: 1;
  phase: BootcampPhase;
  leadCat?: AgentId;
  selectedTaskId?: string;
  envCheck?: Record<string, { ok: boolean; version?: string; note?: string }>;
  advancedFeatures?: Record<string, 'available' | 'unavailable' | 'skipped'>;
  startedAt: number;
  completedAt?: number;
}

export interface VotingStateV1 {
  v: 1;
  question: string;
  options: string[];
  votes: Record<string, string>;
  anonymous: boolean;
  deadline: number;
  createdBy: string;
  status: 'active' | 'closed';
  voters?: string[];
  initiatedByCat?: string;
}

export interface Thread {
  id: string;
  projectPath: string;
  title: string | null;
  createdBy: string;
  participants: AgentId[];
  lastActiveAt: number;
  createdAt: number;
  pinned?: boolean;
  pinnedAt?: number | null;
  favorited?: boolean;
  favoritedAt?: number | null;
  thinkingMode?: 'debug' | 'play';
  mentionActionabilityMode?: MentionActionabilityMode;
  preferredCats?: AgentId[];
  phase?: ThreadPhase;
  backlogItemId?: string;
  routingPolicy?: ThreadRoutingPolicyV1;
  threadMemory?: ThreadMemoryV1;
  votingState?: VotingStateV1;
  voiceMode?: boolean;
  deletedAt?: number | null;
  bootcampState?: BootcampStateV1;
  connectorHubState?: ConnectorHubStateV1;
}

// ---------------------------------------------------------------------------
// IThreadStore — the contract that storage providers implement
// ---------------------------------------------------------------------------

export interface IThreadStore {
  create(userId: string, title?: string, projectPath?: string): Thread | Promise<Thread>;
  get(threadId: string): Thread | null | Promise<Thread | null>;
  list(userId: string): Thread[] | Promise<Thread[]>;
  listByProject(userId: string, projectPath: string): Thread[] | Promise<Thread[]>;
  addParticipants(threadId: string, agentIds: AgentId[]): void | Promise<void>;
  getParticipants(threadId: string): AgentId[] | Promise<AgentId[]>;
  getParticipantsWithActivity(threadId: string): ThreadParticipantActivity[] | Promise<ThreadParticipantActivity[]>;
  updateParticipantActivity(threadId: string, agentId: AgentId): void | Promise<void>;
  updateTitle(threadId: string, title: string): void | Promise<void>;
  updatePin(threadId: string, pinned: boolean): void | Promise<void>;
  updateFavorite(threadId: string, favorited: boolean): void | Promise<void>;
  updateThinkingMode(threadId: string, mode: 'debug' | 'play'): void | Promise<void>;
  updateMentionActionabilityMode(threadId: string, mode: MentionActionabilityMode): void | Promise<void>;
  updatePreferredCats(threadId: string, agentIds: AgentId[]): void | Promise<void>;
  updatePhase(threadId: string, phase: ThreadPhase): void | Promise<void>;
  linkBacklogItem(threadId: string, backlogItemId: string): void | Promise<void>;
  setMentionRoutingFeedback(
    threadId: string,
    agentId: AgentId,
    feedback: ThreadMentionRoutingFeedback,
  ): void | Promise<void>;
  consumeMentionRoutingFeedback(
    threadId: string,
    agentId: AgentId,
  ): ThreadMentionRoutingFeedback | null | Promise<ThreadMentionRoutingFeedback | null>;
  updateRoutingPolicy(threadId: string, policy: ThreadRoutingPolicyV1 | null): void | Promise<void>;
  getThreadMemory(threadId: string): ThreadMemoryV1 | null | Promise<ThreadMemoryV1 | null>;
  updateThreadMemory(threadId: string, memory: ThreadMemoryV1): void | Promise<void>;
  getVotingState(threadId: string): VotingStateV1 | null | Promise<VotingStateV1 | null>;
  updateVotingState(threadId: string, state: VotingStateV1 | null): void | Promise<void>;
  updateVoiceMode(threadId: string, voiceMode: boolean): void | Promise<void>;
  updateBootcampState(threadId: string, state: BootcampStateV1 | null): void | Promise<void>;
  updateConnectorHubState(threadId: string, state: ConnectorHubStateV1 | null): void | Promise<void>;
  updateLastActive(threadId: string): void | Promise<void>;
  delete(threadId: string): boolean | Promise<boolean>;
  softDelete(threadId: string): boolean | Promise<boolean>;
  restore(threadId: string): boolean | Promise<boolean>;
  listDeleted(userId: string): Thread[] | Promise<Thread[]>;
}
