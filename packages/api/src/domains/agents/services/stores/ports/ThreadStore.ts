/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Thread Store
 * 对话管理：创建、查询、参与者追踪
 *
 * 内存实现，Map-based + LRU 淘汰。
 * Phase 3.3 可扩展 Redis 版本。
 */

import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { relative, resolve, win32 } from 'node:path';
import type { AgentId, ThreadPhase } from '@openjiuwen/relay-shared';
import { generateThreadId } from '@openjiuwen/relay-shared';
import { GovernanceBootstrapService } from '../../../../../config/governance/governance-bootstrap.js';
import { findMonorepoRoot } from '../../../../../utils/monorepo-root.js';
import { isUnderAllowedRoot } from '../../../../../utils/project-path.js';

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
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
} from '@openjiuwen/relay-api-server-contracts/storage';
export { DEFAULT_THREAD_ID } from '@openjiuwen/relay-api-server-contracts/storage';

import type {
  BootcampStateV1,
  ConnectorHubStateV1,
  IThreadStore,
  MentionActionabilityMode,
  Thread,
  ThreadMemoryV1,
  ThreadMentionRoutingFeedback,
  ThreadParticipantActivity,
  ThreadRoutingPolicyV1,
  VotingStateV1,
} from '@openjiuwen/relay-api-server-contracts/storage';
import { DEFAULT_THREAD_ID } from '@openjiuwen/relay-api-server-contracts/storage';

declare module '@openjiuwen/relay-api-server-contracts/storage' {
  interface Thread {
    invitedExpertIds?: string[];
  }

  interface IThreadStore {
    inviteExpert(threadId: string, expertId: string): void | Promise<void>;
    removeExpert(threadId: string, expertId: string): void | Promise<void>;
    getInvitedExperts(threadId: string): string[] | Promise<string[]>;
  }
}

const MAX_THREADS = 100;

export interface ThreadStoreProjectPathOptions {
  monorepoRoot?: string;
}

function isPathWithinRoot(absPath: string, root: string): boolean {
  const rel = relative(root, absPath);
  if (rel === '') return true;
  if (process.platform === 'win32' && win32.isAbsolute(rel)) return false;
  return !rel.startsWith('..') && !rel.startsWith('/') && !rel.startsWith('\\');
}

function resolveMonorepoRoot(options?: ThreadStoreProjectPathOptions): string {
  const configuredRoot = options?.monorepoRoot;
  if (!configuredRoot) return findMonorepoRoot(process.cwd());
  const absRoot = resolve(configuredRoot);
  return existsSync(absRoot) ? realpathSync(absRoot) : absRoot;
}

function bootstrapWorkspaceGovernance(projectPath: string, monorepoRoot: string): void {
  const service = new GovernanceBootstrapService(monorepoRoot);
  void service.bootstrap(projectPath, { dryRun: false }).catch(() => {});
}

function ensureWorkspaceProjectPath(monorepoRoot: string): { projectPath: string; created: boolean } {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const workspacePath = resolve(monorepoRoot, 'workspace', timestamp);
  const existedBefore = existsSync(workspacePath);
  mkdirSync(workspacePath, { recursive: true });

  const resolvedWorkspacePath = realpathSync(workspacePath);
  const resolvedMonorepoRoot = realpathSync(monorepoRoot);
  if (!isPathWithinRoot(resolvedWorkspacePath, resolvedMonorepoRoot)) {
    throw new Error(`Workspace path escapes monorepo root: ${resolvedWorkspacePath}`);
  }

  if (!statSync(resolvedWorkspacePath).isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${resolvedWorkspacePath}`);
  }

  return {
    projectPath: resolvedWorkspacePath,
    created: !existedBefore,
  };
}

function resolveExistingProjectPath(projectPath: string): string | null {
  try {
    const resolvedProjectPath = realpathSync(resolve(projectPath));
    if (!isUnderAllowedRoot(resolvedProjectPath)) return null;
    if (!statSync(resolvedProjectPath).isDirectory()) return null;
    return resolvedProjectPath;
  } catch {
    return null;
  }
}

export function resolveThreadProjectPath(projectPath?: string, options?: ThreadStoreProjectPathOptions): string {
  const monorepoRoot = resolveMonorepoRoot(options);
  if (!projectPath || projectPath === 'default') {
    const workspace = ensureWorkspaceProjectPath(monorepoRoot);
    if (workspace.created) bootstrapWorkspaceGovernance(workspace.projectPath, monorepoRoot);
    return workspace.projectPath;
  }

  const existingProjectPath = resolveExistingProjectPath(projectPath);
  if (existingProjectPath) return existingProjectPath;

  const workspace = ensureWorkspaceProjectPath(monorepoRoot);
  if (workspace.created) bootstrapWorkspaceGovernance(workspace.projectPath, monorepoRoot);
  return workspace.projectPath;
}

/**
 * In-memory thread store with LRU eviction.
 */
export class ThreadStore implements IThreadStore {
  private threads: Map<string, Thread> = new Map();
  /** F032 Phase C: Track participant activity per thread. Key: `${threadId}:${agentId}` */
  private participantActivity: Map<string, { lastMessageAt: number; messageCount: number }> = new Map();
  /** F046 D3: one-shot suppressed mention feedback per thread+agent */
  private mentionRoutingFeedback: Map<string, ThreadMentionRoutingFeedback> = new Map();
  private readonly maxThreads: number;
  private readonly monorepoRoot?: string;

  constructor(options?: { maxThreads?: number; monorepoRoot?: string }) {
    this.maxThreads = options?.maxThreads ?? MAX_THREADS;
    this.monorepoRoot = options?.monorepoRoot;
  }

  /** F032 Phase C: Generate activity key */
  private activityKey(threadId: string, agentId: AgentId): string {
    return `${threadId}:${agentId}`;
  }

  private mentionRoutingFeedbackKey(threadId: string, agentId: AgentId): string {
    return `${threadId}:${agentId}`;
  }

  create(userId: string, title?: string, projectPath?: string): Thread {
    this.evictIfNeeded();
    const resolvedProjectPath = resolveThreadProjectPath(projectPath, { monorepoRoot: this.monorepoRoot });
    const now = Date.now();

    const thread: Thread = {
      id: generateThreadId(),
      projectPath: resolvedProjectPath,
      title: title ?? null,
      createdBy: userId,
      participants: [],
      invitedExpertIds: [],
      lastActiveAt: now,
      createdAt: now,
    };

    this.threads.set(thread.id, thread);
    return thread;
  }

  get(threadId: string): Thread | null {
    // Auto-create default thread on first access
    if (threadId === DEFAULT_THREAD_ID && !this.threads.has(DEFAULT_THREAD_ID)) {
      const defaultThread: Thread = {
        id: DEFAULT_THREAD_ID,
        projectPath: 'default',
        title: null,
        createdBy: 'system',
        participants: [],
        invitedExpertIds: [],
        lastActiveAt: Date.now(),
        createdAt: Date.now(),
      };
      this.threads.set(DEFAULT_THREAD_ID, defaultThread);
    }

    return this.threads.get(threadId) ?? null;
  }

  list(userId: string): Thread[] {
    const result: Thread[] = [];
    for (const thread of this.threads.values()) {
      if ((thread.createdBy === userId || thread.id === DEFAULT_THREAD_ID) && !thread.deletedAt) {
        result.push(thread);
      }
    }
    // Sort by lastActiveAt descending (most recent first)
    result.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    return result;
  }

  listByProject(userId: string, projectPath: string): Thread[] {
    return this.list(userId).filter((t) => t.projectPath === projectPath);
  }

  addParticipants(threadId: string, agentIds: AgentId[]): void {
    const thread = this.get(threadId);
    if (!thread) return;

    // Cloud Codex P1 fix: Only add to participants list, do NOT update activity.
    // Activity should only be updated via updateParticipantActivity() after successful message append.
    for (const agentId of agentIds) {
      if (!thread.participants.includes(agentId)) {
        thread.participants.push(agentId);
      }
    }
  }

  getParticipants(threadId: string): AgentId[] {
    const thread = this.get(threadId);
    return thread?.participants ?? [];
  }

  /** F032 Phase C: Get participants with activity, sorted by lastMessageAt descending */
  getParticipantsWithActivity(threadId: string): ThreadParticipantActivity[] {
    const participants = this.getParticipants(threadId);
    const result: ThreadParticipantActivity[] = participants.map((agentId) => {
      const key = this.activityKey(threadId, agentId);
      const activity = this.participantActivity.get(key);
      return {
        agentId,
        lastMessageAt: activity?.lastMessageAt ?? 0,
        messageCount: activity?.messageCount ?? 0,
      };
    });
    // Sort by lastMessageAt descending (most recent first)
    result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    return result;
  }

  /** F032 P1-2 fix: Update participant activity on every message */
  updateParticipantActivity(threadId: string, agentId: AgentId): void {
    const thread = this.get(threadId);
    if (!thread) return;

    // Ensure agent is in participants list
    if (!thread.participants.includes(agentId)) {
      thread.participants.push(agentId);
    }

    // Update activity timestamp and increment count
    const key = this.activityKey(threadId, agentId);
    const existing = this.participantActivity.get(key);
    this.participantActivity.set(key, {
      lastMessageAt: Date.now(),
      messageCount: (existing?.messageCount ?? 0) + 1,
    });
  }

  updateTitle(threadId: string, title: string): void {
    const thread = this.get(threadId);
    if (thread) thread.title = title;
  }

  updatePin(threadId: string, pinned: boolean): void {
    const thread = this.get(threadId);
    if (thread) {
      thread.pinned = pinned;
      thread.pinnedAt = pinned ? Date.now() : null;
    }
  }

  updateFavorite(threadId: string, favorited: boolean): void {
    const thread = this.get(threadId);
    if (thread) {
      thread.favorited = favorited;
      thread.favoritedAt = favorited ? Date.now() : null;
    }
  }

  updateThinkingMode(threadId: string, mode: 'debug' | 'play'): void {
    const thread = this.get(threadId);
    if (thread) thread.thinkingMode = mode;
  }

  updateMentionActionabilityMode(threadId: string, mode: MentionActionabilityMode): void {
    const thread = this.get(threadId);
    if (!thread) return;
    // strict is default behavior, so clear explicit override to preserve backwards compatibility.
    if (mode === 'strict') {
      delete thread.mentionActionabilityMode;
      return;
    }
    thread.mentionActionabilityMode = mode;
  }

  updatePreferredCats(threadId: string, agentIds: AgentId[]): void {
    const thread = this.get(threadId);
    if (!thread) return;
    // R5 fix: dedupe at write time to prevent duplicate invocations
    const unique = [...new Set(agentIds)];
    if (unique.length > 0) {
      thread.preferredCats = unique;
    } else {
      delete thread.preferredCats;
    }
  }

  updatePhase(threadId: string, phase: ThreadPhase): void {
    const thread = this.get(threadId);
    if (thread) thread.phase = phase;
  }

  linkBacklogItem(threadId: string, backlogItemId: string): void {
    const thread = this.get(threadId);
    if (thread) thread.backlogItemId = backlogItemId;
  }

  setMentionRoutingFeedback(threadId: string, agentId: AgentId, feedback: ThreadMentionRoutingFeedback): void {
    const key = this.mentionRoutingFeedbackKey(threadId, agentId);
    const sourceMessage = feedback.sourceMessageId ? { sourceMessageId: feedback.sourceMessageId } : {};
    this.mentionRoutingFeedback.set(key, {
      ...sourceMessage,
      sourceTimestamp: feedback.sourceTimestamp,
      items: [...feedback.items],
    });
  }

  consumeMentionRoutingFeedback(threadId: string, agentId: AgentId): ThreadMentionRoutingFeedback | null {
    const key = this.mentionRoutingFeedbackKey(threadId, agentId);
    const feedback = this.mentionRoutingFeedback.get(key);
    if (!feedback) return null;
    this.mentionRoutingFeedback.delete(key);
    const sourceMessage = feedback.sourceMessageId ? { sourceMessageId: feedback.sourceMessageId } : {};
    return {
      ...sourceMessage,
      sourceTimestamp: feedback.sourceTimestamp,
      items: [...feedback.items],
    };
  }

  updateRoutingPolicy(threadId: string, policy: ThreadRoutingPolicyV1 | null): void {
    const thread = this.get(threadId);
    if (!thread) return;

    // Normalize: null or empty scopes clears policy.
    const scopes = policy?.scopes;
    const hasScopes = scopes && Object.keys(scopes).length > 0;
    if (!policy || policy.v !== 1 || !hasScopes) {
      delete thread.routingPolicy;
      return;
    }

    thread.routingPolicy = policy;
  }

  getThreadMemory(threadId: string): ThreadMemoryV1 | null {
    const thread = this.get(threadId);
    return thread?.threadMemory ?? null;
  }

  updateThreadMemory(threadId: string, memory: ThreadMemoryV1): void {
    const thread = this.get(threadId);
    if (thread) thread.threadMemory = memory;
  }

  getVotingState(threadId: string): VotingStateV1 | null {
    const thread = this.get(threadId);
    return thread?.votingState ?? null;
  }

  updateVotingState(threadId: string, state: VotingStateV1 | null): void {
    const thread = this.get(threadId);
    if (!thread) return;
    if (state === null) {
      delete thread.votingState;
    } else {
      thread.votingState = state;
    }
  }

  updateVoiceMode(threadId: string, voiceMode: boolean): void {
    const thread = this.get(threadId);
    if (!thread) return;
    if (voiceMode) {
      thread.voiceMode = true;
    } else {
      delete thread.voiceMode;
    }
  }

  updateBootcampState(threadId: string, state: BootcampStateV1 | null): void {
    const thread = this.get(threadId);
    if (!thread) return;
    if (state === null) {
      delete thread.bootcampState;
    } else {
      thread.bootcampState = state;
    }
  }

  updateConnectorHubState(threadId: string, state: ConnectorHubStateV1 | null): void {
    const thread = this.get(threadId);
    if (!thread) return;
    if (state === null) {
      delete thread.connectorHubState;
    } else {
      thread.connectorHubState = state;
    }
  }

  inviteExpert(threadId: string, expertId: string): void {
    const thread = this.get(threadId);
    if (!thread) return;
    const invitedExpertIds = thread.invitedExpertIds ?? [];
    if (!invitedExpertIds.includes(expertId)) {
      thread.invitedExpertIds = [...invitedExpertIds, expertId];
    }
    if (!thread.participants.includes(expertId as AgentId)) {
      thread.participants.push(expertId as AgentId);
    }
  }

  removeExpert(threadId: string, expertId: string): void {
    const thread = this.get(threadId);
    if (!thread) return;
    thread.invitedExpertIds = (thread.invitedExpertIds ?? []).filter((id) => id !== expertId);
    thread.participants = thread.participants.filter((id) => id !== expertId);
  }

  getInvitedExperts(threadId: string): string[] {
    const thread = this.get(threadId);
    return thread?.invitedExpertIds ?? [];
  }

  updateLastActive(threadId: string): void {
    const thread = this.get(threadId);
    if (thread) {
      thread.lastActiveAt = Date.now();
      // Move to end of Map for LRU (delete + re-insert)
      this.threads.delete(threadId);
      this.threads.set(threadId, thread);
    }
  }

  delete(threadId: string): boolean {
    if (threadId === DEFAULT_THREAD_ID) return false; // Cannot delete default
    // Cloud Codex R3 P2 fix: Clean up activity entries to prevent memory leak
    this.clearActivityForThread(threadId);
    this.clearMentionRoutingFeedbackForThread(threadId);
    return this.threads.delete(threadId);
  }

  /** F095 Phase D: Soft-delete — mark thread as deleted. */
  softDelete(threadId: string): boolean {
    if (threadId === DEFAULT_THREAD_ID) return false;
    const thread = this.threads.get(threadId);
    if (!thread || thread.deletedAt) return false;
    thread.deletedAt = Date.now();
    return true;
  }

  /** F095 Phase D: Restore a soft-deleted thread. */
  restore(threadId: string): boolean {
    const thread = this.threads.get(threadId);
    if (!thread || !thread.deletedAt) return false;
    thread.deletedAt = null;
    return true;
  }

  /** F095 Phase D: List soft-deleted threads (trash bin). */
  listDeleted(userId: string): Thread[] {
    const result: Thread[] = [];
    for (const thread of this.threads.values()) {
      if (thread.createdBy === userId && thread.deletedAt) {
        result.push(thread);
      }
    }
    result.sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
    return result;
  }

  /** Cloud Codex R3 P2 fix: Remove all activity entries for a thread */
  private clearActivityForThread(threadId: string): void {
    const prefix = `${threadId}:`;
    for (const key of this.participantActivity.keys()) {
      if (key.startsWith(prefix)) {
        this.participantActivity.delete(key);
      }
    }
  }

  private clearMentionRoutingFeedbackForThread(threadId: string): void {
    const prefix = `${threadId}:`;
    for (const key of this.mentionRoutingFeedback.keys()) {
      if (key.startsWith(prefix)) {
        this.mentionRoutingFeedback.delete(key);
      }
    }
  }

  /** Current thread count (for testing) */
  get size(): number {
    return this.threads.size;
  }

  private evictIfNeeded(): void {
    while (this.threads.size >= this.maxThreads) {
      // Find the oldest non-default key (Map preserves insertion order)
      let evicted = false;
      for (const key of this.threads.keys()) {
        if (key !== DEFAULT_THREAD_ID) {
          // Cloud Codex R3 P2 fix: Clean up activity before evicting
          this.clearActivityForThread(key);
          this.clearMentionRoutingFeedbackForThread(key);
          this.threads.delete(key);
          evicted = true;
          break;
        }
      }
      // Only default thread left — cannot evict further
      if (!evicted) break;
    }
  }
}
