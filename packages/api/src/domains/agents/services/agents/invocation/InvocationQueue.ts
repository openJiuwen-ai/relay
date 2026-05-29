/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * InvocationQueue
 * Per-thread, per-user FIFO 队列，用于智能体在跑时排队用户/connector 消息。
 *
 * 与 InvocationTracker（互斥锁，跟踪活跃调用）互补：
 * - InvocationTracker: "谁在跑"
 * - InvocationQueue: "谁在等"
 *
 * scopeKey = `${threadId}:${userId}` — 存储层天然用户隔离。
 * 系统级出队（invocation 完成后）通过 *AcrossUsers 方法跨用户 FIFO。
 */

import { randomUUID } from 'node:crypto';
import type { AgentId } from '@openjiuwen/relay-shared';
import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import { createModuleLogger, userVisibleFields } from '../../../../../infrastructure/logger.js';
import { type PptMessageContext, serializePptMessageContext } from '../../../../ppt/ppt-context.js';
import { InvocationQueueKeys } from '../../stores/redis-keys/invocation-queue-keys.js';

export interface QueueEntry {
  id: string;
  threadId: string;
  userId: string;
  content: string;
  /** Optional attachment display names for queue UI (shown after content). */
  attachmentNames?: string[];
  messageId: string | null;
  mergedMessageIds: string[];
  source: 'user' | 'connector' | 'agent';
  targetAgents: string[];
  intent: string;
  status: 'queued' | 'processing';
  createdAt: number;
  /** Set when entry transitions to 'processing'. Used for stale-processing TTL. */
  processingStartedAt?: number;
  /** F122B: auto-execute without waiting for steer/manual trigger */
  autoExecute: boolean;
  /** F122B: which agent initiated this entry (for A2A/multi_mention display) */
  callerAgentId?: string;
  /** F134: sender identity for connector group chat messages (used for UI display) */
  senderMeta?: { id: string; name?: string };
  /** Explicit interrupted-session resume target for provider integrations that support resume semantics. */
  resumeAgentId?: AgentId;
  /** Hidden PPT HTML targeting context for live slide micro-tuning. */
  pptContext?: PptMessageContext;
  /** End-to-end trace ID from the original HTTP request, preserved across queue delay. */
  traceId?: string;
}

export interface EnqueueResult {
  outcome: 'enqueued' | 'merged' | 'full';
  entry?: QueueEntry;
  queuePosition?: number;
}

const MAX_QUEUE_DEPTH = 20;
const QUEUE_PERSIST_VERSION = 1;

interface InvocationQueueSnapshot {
  version: number;
  queues: Record<string, QueueEntry[]>;
}

export class InvocationQueue {
  private readonly log = createModuleLogger('invocation-queue');
  private queues = new Map<string, QueueEntry[]>();
  private persistScheduled = false;
  private persistInFlight: Promise<void> | null = null;

  /** Last pre-merge content per entryId, for rollback */
  private preMergeSnapshots = new Map<string, string>();
  /** Original content per entryId at enqueue time, for rollbackEnqueue */
  private originalContents = new Map<string, string>();

  constructor(private readonly redis?: RedisClient) {}

  /**
   * Best-effort hydration from Redis snapshot.
   * Processing entries are downgraded to queued after restart because in-flight execution cannot be resumed safely.
   */
  async hydrate(): Promise<void> {
    if (!this.redis) return;
    try {
      const raw = await this.redis.get(InvocationQueueKeys.snapshot());
      if (!raw) return;
      const parsed = JSON.parse(raw) as InvocationQueueSnapshot;
      if (!parsed || parsed.version !== QUEUE_PERSIST_VERSION || !parsed.queues || typeof parsed.queues !== 'object') {
        this.log.warn('[InvocationQueue] invalid snapshot payload, ignoring');
        return;
      }

      const nextQueues = new Map<string, QueueEntry[]>();
      const nextOriginalContents = new Map<string, string>();
      for (const [scope, entries] of Object.entries(parsed.queues)) {
        if (!Array.isArray(entries) || entries.length === 0) continue;
        const normalizedEntries: QueueEntry[] = [];
        for (const entry of entries) {
          const normalized = this.normalizeHydratedEntry(entry);
          if (!normalized) continue;
          normalizedEntries.push(normalized);
          nextOriginalContents.set(normalized.id, normalized.content);
        }
        if (normalizedEntries.length > 0) {
          nextQueues.set(scope, normalizedEntries);
        }
      }

      this.queues = nextQueues;
      this.originalContents = nextOriginalContents;
      this.preMergeSnapshots.clear();
      this.log.info({ scopeCount: nextQueues.size }, '[InvocationQueue] hydrated snapshot from Redis');
    } catch (error) {
      this.log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        '[InvocationQueue] hydrate failed; continuing with in-memory queue',
      );
    }
  }

  private scopeKey(threadId: string, userId: string): string {
    return `${threadId}:${userId}`;
  }

  private getOrCreate(key: string): QueueEntry[] {
    let q = this.queues.get(key);
    if (!q) {
      q = [];
      this.queues.set(key, q);
    }
    return q;
  }

  /**
   * 预留队列位。容量检查在此完成。
   * 仅 agent 源的同目标连续消息允许自动合并；
   * 用户手动排队的消息必须始终保留为独立列表项。
   */
  enqueue(
    input: Omit<
      QueueEntry,
      'id' | 'status' | 'createdAt' | 'mergedMessageIds' | 'messageId' | 'autoExecute' | 'callerAgentId'
    > & {
      autoExecute?: boolean;
      callerAgentId?: string;
    },
  ): EnqueueResult {
    const key = this.scopeKey(input.threadId, input.userId);
    const q = this.getOrCreate(key);

    // Check merge with tail — only agent-sourced chained entries may merge.
    // User queue sends must stay as distinct list items in the UI.
    // F134: connector messages never merge (different group senders could collide)
    // Stale defense: never merge into a stale agent entry — its createdAt is too old
    // for listAutoExecute() to pick up, so merging would silently swallow the new message.
    const tail = q.length > 0 ? q[q.length - 1] : null;
    const isStaleTail =
      tail?.source === 'agent' &&
      tail.status === 'queued' &&
      Date.now() - tail.createdAt >= InvocationQueue.STALE_QUEUED_THRESHOLD_MS;
    if (
      tail &&
      !isStaleTail &&
      tail.status === 'queued' &&
      tail.source === 'agent' &&
      tail.source === input.source &&
      tail.intent === input.intent &&
      tail.resumeAgentId === input.resumeAgentId &&
      serializePptMessageContext(tail.pptContext) === serializePptMessageContext(input.pptContext) &&
      arraysEqual(sorted(tail.targetAgents), sorted(input.targetAgents))
    ) {
      // Save snapshot for rollback
      this.preMergeSnapshots.set(tail.id, tail.content);
      tail.content += `\n${input.content}`;
      if (input.attachmentNames?.length) {
        const merged = [...(tail.attachmentNames ?? []), ...input.attachmentNames];
        tail.attachmentNames = merged;
      }
      this.schedulePersist();
      return { outcome: 'merged', entry: { ...tail }, queuePosition: q.indexOf(tail) + 1 };
    }

    // Capacity check (only non-stale queued entries count)
    const now = Date.now();
    const queuedCount = q.filter(
      (e) =>
        e.status === 'queued' &&
        !(e.source === 'agent' && now - e.createdAt >= InvocationQueue.STALE_QUEUED_THRESHOLD_MS),
    ).length;
    if (queuedCount >= MAX_QUEUE_DEPTH) {
      this.log.warn(
        userVisibleFields('critical', { threadId: input.threadId, userId: input.userId, queuedCount }),
        '[InvocationQueue] queue full',
      );
      return { outcome: 'full' };
    }

    const entry: QueueEntry = {
      id: randomUUID(),
      threadId: input.threadId,
      userId: input.userId,
      content: input.content,
      ...(input.attachmentNames?.length ? { attachmentNames: [...input.attachmentNames] } : {}),
      messageId: null,
      mergedMessageIds: [],
      source: input.source,
      targetAgents: [...input.targetAgents],
      intent: input.intent,
      status: 'queued',
      createdAt: Date.now(),
      autoExecute: input.autoExecute ?? false,
      callerAgentId: input.callerAgentId,
      senderMeta: input.senderMeta,
      resumeAgentId: input.resumeAgentId,
      pptContext: input.pptContext,
    };
    q.push(entry);
    this.originalContents.set(entry.id, input.content);
    this.schedulePersist();
    this.log.info(
      userVisibleFields('progress', {
        threadId: entry.threadId,
        userId: entry.userId,
        entryId: entry.id,
        source: entry.source,
        targetAgents: entry.targetAgents,
        queuePosition: q.length,
      }),
      '[InvocationQueue] message enqueued',
    );
    return { outcome: 'enqueued', entry: { ...entry }, queuePosition: q.length };
  }

  /** Backfill messageId on a new entry (null → value). */
  backfillMessageId(threadId: string, userId: string, entryId: string, messageId: string): void {
    const e = this.findEntry(threadId, userId, entryId);
    if (e) {
      e.messageId = messageId;
      this.schedulePersist();
    }
  }

  /** Append to mergedMessageIds (does NOT overwrite messageId). */
  appendMergedMessageId(threadId: string, userId: string, entryId: string, messageId: string): void {
    const e = this.findEntry(threadId, userId, entryId);
    if (e) {
      e.mergedMessageIds.push(messageId);
      this.schedulePersist();
    }
  }

  /** Rollback a merge — restore pre-merge content snapshot. */
  rollbackMerge(threadId: string, userId: string, entryId: string): void {
    const e = this.findEntry(threadId, userId, entryId);
    const snapshot = this.preMergeSnapshots.get(entryId);
    if (e && snapshot !== undefined) {
      e.content = snapshot;
      this.preMergeSnapshots.delete(entryId);
      this.schedulePersist();
    }
  }

  /**
   * Rollback an enqueued entry's write failure.
   * If no merges have occurred → remove entry entirely.
   * If merges exist → strip original content, keep merged content alive.
   * This prevents a race where request A fails after request B merged into A's entry.
   */
  rollbackEnqueue(threadId: string, userId: string, entryId: string): void {
    const e = this.findEntry(threadId, userId, entryId);
    if (!e) return;

    const origContent = this.originalContents.get(entryId);
    // Detect merges: content grew beyond original
    if (origContent !== undefined && e.content !== origContent) {
      // Strip original content prefix, keep merged content
      const prefix = `${origContent}\n`;
      if (e.content.startsWith(prefix)) {
        e.content = e.content.slice(prefix.length);
      }
      // Promote surviving merged message ID so QueueProcessor can link it
      if (e.mergedMessageIds.length > 0) {
        e.messageId = e.mergedMessageIds.shift()!;
      } else {
        e.messageId = null;
      }
      // Clear stale snapshot so rollbackMerge can't reintroduce ghost content
      this.preMergeSnapshots.delete(entryId);
    } else {
      // No merges — safe to remove entirely
      this.remove(threadId, userId, entryId);
    }
    this.originalContents.delete(entryId);
    this.schedulePersist();
  }

  /** Remove and return the first entry (FIFO). */
  dequeue(threadId: string, userId: string): QueueEntry | null {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q || q.length === 0) return null;
    const entry = q.shift()!;
    this.originalContents.delete(entry.id);
    this.preMergeSnapshots.delete(entry.id);
    if (q.length === 0) {
      this.queues.delete(this.scopeKey(threadId, userId));
    }
    this.schedulePersist();
    return entry;
  }

  /** Look at the first entry without removing. */
  peek(threadId: string, userId: string): QueueEntry | null {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    return q?.[0] ?? null;
  }

  /** Remove a specific entry by id. Returns null if not found. */
  remove(threadId: string, userId: string, entryId: string): QueueEntry | null {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q) return null;
    const idx = q.findIndex((e) => e.id === entryId);
    if (idx === -1) return null;
    this.originalContents.delete(entryId);
    this.preMergeSnapshots.delete(entryId);
    const removed = q.splice(idx, 1)[0] ?? null;
    if (q.length === 0) {
      this.queues.delete(this.scopeKey(threadId, userId));
    }
    this.schedulePersist();
    return removed;
  }

  /** Shallow copy of all entries for this user in this thread. */
  list(threadId: string, userId: string): QueueEntry[] {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    return q ? [...q] : [];
  }

  /** Count of queued (not processing) entries. */
  size(threadId: string, userId: string): number {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q) return 0;
    return q.filter((e) => e.status === 'queued').length;
  }

  /** Clear all entries for this user. Returns removed entries. */
  clear(threadId: string, userId: string): QueueEntry[] {
    const key = this.scopeKey(threadId, userId);
    const q = this.queues.get(key);
    if (!q) return [];
    for (const e of q) {
      this.originalContents.delete(e.id);
      this.preMergeSnapshots.delete(e.id);
    }
    this.queues.delete(key);
    this.schedulePersist();
    return q;
  }

  /** Clear queued (non-processing) entries for this user. Returns removed entries. */
  clearQueued(threadId: string, userId: string): QueueEntry[] {
    const key = this.scopeKey(threadId, userId);
    const q = this.queues.get(key);
    if (!q || q.length === 0) return [];

    const removed: QueueEntry[] = [];
    const kept: QueueEntry[] = [];
    for (const e of q) {
      if (e.status === 'queued') {
        removed.push(e);
        this.originalContents.delete(e.id);
        this.preMergeSnapshots.delete(e.id);
      } else {
        kept.push(e);
      }
    }

    if (kept.length > 0) {
      this.queues.set(key, kept);
    } else {
      this.queues.delete(key);
    }
    this.schedulePersist();
    return removed;
  }

  /**
   * Move entry up or down within the user's queue.
   * Returns false if entry is processing or not found.
   */
  move(threadId: string, userId: string, entryId: string, direction: 'up' | 'down'): boolean {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q) return false;
    const idx = q.findIndex((e) => e.id === entryId);
    if (idx === -1) return false;
    if (q[idx]?.status === 'processing') return false;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= q.length) return true; // boundary no-op, idempotent

    const a = q[idx]!;
    const b = q[swapIdx]!;
    q[idx] = b;
    q[swapIdx] = a;
    this.schedulePersist();
    return true;
  }

  /**
   * Promote a queued entry to the front of queued entries (after any processing entries).
   * Returns false if not found or entry is processing.
   */
  promote(threadId: string, userId: string, entryId: string): boolean {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q) return false;
    const idx = q.findIndex((e) => e.id === entryId);
    if (idx === -1) return false;
    const entry = q[idx]!;
    if (entry.status === 'processing') return false;

    q.splice(idx, 1);
    const firstQueuedIdx = q.findIndex((e) => e.status === 'queued');
    const insertIdx = firstQueuedIdx === -1 ? q.length : firstQueuedIdx;
    q.splice(insertIdx, 0, entry);
    this.schedulePersist();
    return true;
  }

  /** Mark the first queued entry as processing (stays in array). */
  markProcessing(threadId: string, userId: string): QueueEntry | null {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q) return null;
    const first = q.find((e) => e.status === 'queued');
    if (!first) return null;
    first.status = 'processing';
    first.processingStartedAt = Date.now();
    this.schedulePersist();
    return { ...first };
  }

  /** Peek at the next queued entry without mutating state. */
  peekNextQueued(threadId: string, userId: string): QueueEntry | null {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q) return null;
    const first = q.find((e) => e.status === 'queued');
    return first ? { ...first } : null;
  }

  /** Rollback a processing entry back to queued (undo markProcessing/markProcessingAcrossUsers). */
  rollbackProcessing(threadId: string, entryId: string): boolean {
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      const entry = q.find((e) => e.id === entryId && e.status === 'processing');
      if (entry) {
        entry.status = 'queued';
        delete entry.processingStartedAt;
        this.schedulePersist();
        return true;
      }
    }
    return false;
  }

  /** Remove a processing entry for this user by entryId. */
  removeProcessed(threadId: string, userId: string, entryId: string): QueueEntry | null {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    if (!q) return null;
    const idx = q.findIndex((e) => e.status === 'processing' && e.id === entryId);
    if (idx === -1) return null;
    this.originalContents.delete(entryId);
    this.preMergeSnapshots.delete(entryId);
    const removed = q.splice(idx, 1)[0] ?? null;
    if (q.length === 0) {
      this.queues.delete(this.scopeKey(threadId, userId));
    }
    this.schedulePersist();
    return removed;
  }

  // ── Cross-user methods (system-level only) ──

  /**
   * Find the oldest queued HEAD entry across all users for a thread.
   *
   * Important: only each scope's next runnable queued entry participates.
   * This preserves per-user queue order and makes `promote()` meaningful
   * for auto-dequeue after invocation completion.
   */
  peekOldestAcrossUsers(threadId: string): QueueEntry | null {
    let oldestHead: QueueEntry | null = null;
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      const head = q.find((e) => e.status === 'queued');
      if (!head) continue;
      if (!oldestHead || head.createdAt < oldestHead.createdAt) {
        oldestHead = head;
      }
    }
    return oldestHead ? { ...oldestHead } : null;
  }

  /**
   * Mark the oldest queued HEAD entry across users as processing.
   *
   * We only compare each scope's next runnable queued entry (queue head)
   * instead of every queued entry in that scope. Otherwise a promoted entry
   * can still be skipped by an older non-head entry from the same scope.
   */
  markProcessingAcrossUsers(threadId: string): QueueEntry | null {
    let oldestHead: QueueEntry | null = null;
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      const head = q.find((e) => e.status === 'queued');
      if (!head) continue;
      if (!oldestHead || head.createdAt < oldestHead.createdAt) {
        oldestHead = head;
      }
    }
    if (!oldestHead) return null;
    oldestHead.status = 'processing';
    oldestHead.processingStartedAt = Date.now();
    this.schedulePersist();
    return { ...oldestHead };
  }

  /** Remove a processing entry across all users for a thread by entryId. */
  removeProcessedAcrossUsers(threadId: string, entryId: string): QueueEntry | null {
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      const idx = q.findIndex((e) => e.status === 'processing' && e.id === entryId);
      if (idx !== -1) {
        this.originalContents.delete(entryId);
        this.preMergeSnapshots.delete(entryId);
        const removed = q.splice(idx, 1)[0] ?? null;
        if (q.length === 0) {
          this.queues.delete(key);
        }
        this.schedulePersist();
        return removed;
      }
    }
    return null;
  }

  /** Get unique userIds that have entries (any status) for this thread. */
  listUsersForThread(threadId: string): string[] {
    const users: string[] = [];
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`) || q.length === 0) continue;
      const userId = key.slice(threadId.length + 1);
      users.push(userId);
    }
    return users;
  }

  /** F122B: List all queued autoExecute entries for a thread (for scanning past busy slots). */
  listAutoExecute(threadId: string): QueueEntry[] {
    const now = Date.now();
    const result: QueueEntry[] = [];
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      for (const e of q) {
        if (e.status !== 'queued' || !e.autoExecute) continue;
        // Keep auto-execute scan consistent with dedup guard semantics:
        // stale queued entries must not be picked up indefinitely.
        if (now - e.createdAt >= InvocationQueue.STALE_QUEUED_THRESHOLD_MS) continue;
        result.push({ ...e });
      }
    }
    return result;
  }

  /** F122B: Count queued+processing agent-sourced entries for a thread (depth tracking).
   *  Stale defense: queued entries older than STALE_QUEUED_THRESHOLD_MS are excluded
   *  so zombie entries don't eat up the A2A depth quota. */
  countAgentEntriesForThread(threadId: string): number {
    const now = Date.now();
    let count = 0;
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      for (const e of q) {
        if (e.source !== 'agent') continue;
        // Exclude stale queued entries (zombie defense) — processing entries always count
        if (e.status === 'queued' && now - e.createdAt >= InvocationQueue.STALE_QUEUED_THRESHOLD_MS) continue;
        count++;
      }
    }
    return count;
  }

  /** F122B: Check if a specific agent already has a queued agent entry for this thread.
   *  Used by callback-a2a-trigger for dedup — only checks 'queued' so that new handoffs
   *  can still be enqueued while an earlier entry is processing.
   *
   *  Stale defense: entries older than STALE_QUEUED_THRESHOLD_MS are ignored.
   *  Without this, a zombie queued entry (e.g. from a canceled invocation that
   *  didn't clean up) would permanently block all subsequent @mentions for that
   *  agent in that thread until server restart. */
  hasQueuedAgent(threadId: string, agentId: string): boolean {
    const now = Date.now();
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      for (const e of q) {
        if (e.source === 'agent' && e.status === 'queued' && e.targetAgents.includes(agentId)) {
          const queuedAge = now - e.createdAt;
          if (queuedAge >= InvocationQueue.STALE_QUEUED_THRESHOLD_MS) {
            this.log?.warn(
              {
                threadId,
                agentId,
                matchedEntry: {
                  entryId: e.id,
                  status: e.status,
                  queuedAgeMs: queuedAge,
                  userId: key.split(':')[1] ?? '',
                },
              },
              '[DIAG] hasQueuedAgent: ignoring stale queued entry (zombie defense)',
            );
            continue;
          }
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Cross-path dedup: checks processing + fresh queued agent entries.
   * Used by route-serial to prevent text-scan @mention when callback already dispatched.
   *
   * 'processing' entries block only if fresh (< STALE_PROCESSING_THRESHOLD_MS).
   * Zombie processing entries (invocation hung without cleanup) are ignored to
   * prevent permanent A2A routing deadlock.
   *
   * 'queued' entries only block if created within STALE_QUEUED_THRESHOLD_MS — fresh entries
   * are legitimate pending dispatches that tryAutoExecute will pick up.
   * Stale queued entries (older than threshold) are ignored — they may never execute
   * (tryAutoExecute can fail to start them if the slot stays busy), and blocking
   * on them causes permanent A2A deadlock.
   */
  static readonly STALE_QUEUED_THRESHOLD_MS = 60_000;
  static readonly STALE_PROCESSING_THRESHOLD_MS = 600_000; // 10 minutes
  hasActiveOrQueuedAgent(threadId: string, agentId: string): boolean {
    const now = Date.now();
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      for (const e of q) {
        if (e.source !== 'agent' || !e.targetAgents.includes(agentId)) continue;

        if (e.status === 'processing') {
          // Use processingStartedAt (when the entry actually began processing),
          // NOT createdAt (when it was enqueued). An entry may sit queued for a
          // long time before being picked up — using createdAt would falsely
          // expire it the moment it starts processing. (P1 fix per codex review)
          const processingAge = now - (e.processingStartedAt ?? e.createdAt);
          if (processingAge < InvocationQueue.STALE_PROCESSING_THRESHOLD_MS) {
            return true;
          }
          // Stale processing — zombie defense: ignore and continue
          continue;
        }

        if (e.status === 'queued') {
          const queuedAge = now - e.createdAt;
          if (queuedAge < InvocationQueue.STALE_QUEUED_THRESHOLD_MS) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /** F122B: Mark a specific entry as processing by ID (cross-user). */
  markProcessingById(threadId: string, entryId: string): boolean {
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      const entry = q.find((e) => e.id === entryId && e.status === 'queued');
      if (entry) {
        entry.status = 'processing';
        entry.processingStartedAt = Date.now();
        this.schedulePersist();
        return true;
      }
    }
    return false;
  }

  /** Whether any user has queued entries for this thread. */
  hasQueuedForThread(threadId: string): boolean {
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      if (q.some((e) => e.status === 'queued')) return true;
    }
    return false;
  }

  /**
   * Whether any user-sourced message is queued for this thread.
   * Agent/connector-sourced entries are excluded — they have their own
   * per-agent dedup via hasActiveOrQueuedAgent and must NOT block
   * the A2A text-scan fairness gate in routeSerial.
   */
  hasQueuedUserMessagesForThread(threadId: string): boolean {
    for (const [key, q] of this.queues) {
      if (!key.startsWith(`${threadId}:`)) continue;
      if (q.some((e) => e.status === 'queued' && e.source === 'user')) return true;
    }
    return false;
  }

  // ── Internal helpers ──

  private findEntry(threadId: string, userId: string, entryId: string): QueueEntry | undefined {
    const q = this.queues.get(this.scopeKey(threadId, userId));
    return q?.find((e) => e.id === entryId);
  }

  private normalizeHydratedEntry(entry: QueueEntry): QueueEntry | null {
    if (!entry || typeof entry !== 'object') return null;
    if (!entry.id || !entry.threadId || !entry.userId || !entry.intent) return null;
    if (entry.source !== 'user' && entry.source !== 'connector' && entry.source !== 'agent') return null;

    const createdAt =
      typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now();

    // raw cast for backwards-compat access to old field names (pre-branding-rename schema)
    const raw = entry as unknown as Record<string, unknown>;

    return {
      id: entry.id,
      threadId: entry.threadId,
      userId: entry.userId,
      content: typeof entry.content === 'string' ? entry.content : '',
      ...(Array.isArray(entry.attachmentNames)
        ? {
            attachmentNames: entry.attachmentNames.filter(
              (name): name is string => typeof name === 'string' && name.trim().length > 0,
            ),
          }
        : {}),
      messageId: typeof entry.messageId === 'string' || entry.messageId === null ? entry.messageId : null,
      mergedMessageIds: Array.isArray(entry.mergedMessageIds)
        ? entry.mergedMessageIds.filter((id): id is string => typeof id === 'string')
        : [],
      source: entry.source,
      targetAgents: Array.isArray(entry.targetAgents)
        ? entry.targetAgents.filter((agentId): agentId is string => typeof agentId === 'string')
        : Array.isArray(raw['targetCats'])
          ? (raw['targetCats'] as unknown[]).filter((agentId): agentId is string => typeof agentId === 'string')
          : [],
      intent: entry.intent,
      // Downgrade processing -> queued on restore; old in-flight slots are not safely resumable.
      status: 'queued',
      createdAt,
      autoExecute: Boolean(entry.autoExecute),
      ...(entry.callerAgentId
        ? { callerAgentId: entry.callerAgentId }
        : raw['callerCatId']
          ? { callerAgentId: raw['callerCatId'] as string }
          : {}),
      ...(entry.senderMeta && entry.senderMeta.id
        ? { senderMeta: { id: entry.senderMeta.id, ...(entry.senderMeta.name ? { name: entry.senderMeta.name } : {}) } }
        : {}),
      ...(entry.resumeAgentId
        ? { resumeAgentId: entry.resumeAgentId }
        : raw['resumeCatId']
          ? { resumeAgentId: raw['resumeCatId'] as AgentId }
          : {}),
      ...(entry.pptContext && typeof entry.pptContext === 'object' ? { pptContext: entry.pptContext } : {}),
    };
  }

  private schedulePersist(): void {
    if (!this.redis) return;
    if (this.persistScheduled) return;
    this.persistScheduled = true;
    queueMicrotask(() => {
      this.persistScheduled = false;
      const previous = this.persistInFlight ?? Promise.resolve();
      this.persistInFlight = previous
        .catch(() => {
          // swallow previous failure and continue latest snapshot persistence
        })
        .then(() => this.persistSnapshot())
        .finally(() => {
          this.persistInFlight = null;
        });
    });
  }

  private async persistSnapshot(): Promise<void> {
    if (!this.redis) return;
    const payload: InvocationQueueSnapshot = {
      version: QUEUE_PERSIST_VERSION,
      queues: Object.fromEntries(this.queues.entries()),
    };
    try {
      await this.redis.set(InvocationQueueKeys.snapshot(), JSON.stringify(payload));
    } catch (error) {
      this.log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        '[InvocationQueue] failed to persist queue snapshot',
      );
    }
  }
}

/** Sort a string array (returns new array). */
function sorted(arr: string[]): string[] {
  return [...arr].sort();
}

/** Compare two sorted string arrays for equality. */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
