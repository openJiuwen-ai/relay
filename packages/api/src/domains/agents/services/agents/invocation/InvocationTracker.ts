/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Invocation Tracker (SlotTracker)
 * 追踪每个 thread 中每只猫的活跃调用 — per-thread-per-agent 多槽
 *
 * F108: ExecutionSlot(threadId, agentId) 为并发执行的基本单元。
 * - 同一 agentId 在同一 thread 仍保持单锁语义（新调用 abort 旧调用）
 * - 不同 agentId 在同一 thread 可以并发执行
 */

interface ActiveInvocation {
  controller: AbortController;
  userId: string;
  agentId: string;
  /** Cat(s) being invoked — used for cancel feedback broadcast */
  agentIds: string[];
}

export interface CancelResult {
  cancelled: boolean;
  agentIds: string[];
}

export interface DeleteGuard {
  /** Whether the guard was acquired (no active invocation at acquire time) */
  acquired: boolean;
  /** Release the guard after delete completes (success or failure) */
  release: () => void;
}

export class InvocationTracker {
  /** Key: `${threadId}:${agentId}` (slotKey) */
  private active = new Map<string, ActiveInvocation>();
  private deleting = new Set<string>();

  private slotKey(threadId: string, agentId: string): string {
    return `${threadId}:${agentId}`;
  }

  /**
   * Start a new invocation for a slot (threadId + agentId).
   * Only aborts existing invocation for the SAME slot — other cats' slots untouched.
   * If thread is being deleted, returns a pre-aborted controller.
   */
  start(threadId: string, agentId: string, userId: string = 'unknown', agentIds: string[] = []): AbortController {
    if (this.deleting.has(threadId)) {
      const controller = new AbortController();
      controller.abort();
      return controller;
    }
    const key = this.slotKey(threadId, agentId);
    // Abort existing invocation for this SAME slot only
    this.active.get(key)?.controller.abort('preempted');
    const controller = new AbortController();
    this.active.set(key, { controller, userId, agentId, agentIds });
    return controller;
  }

  /**
   * F122 Phase A.1: Non-preemptive thread-level start.
   * Atomically checks if ANY slot in the thread is active (or deleting),
   * then registers the new slot — all in one synchronous operation.
   *
   * Returns AbortController on success, null if thread is busy or deleting.
   * Unlike start(), this NEVER aborts existing invocations.
   */
  tryStartThread(
    threadId: string,
    agentId: string,
    userId: string = 'unknown',
    agentIds: string[] = [],
  ): AbortController | null {
    if (this.deleting.has(threadId)) return null;
    if (this.has(threadId)) return null;
    const controller = new AbortController();
    const key = this.slotKey(threadId, agentId);
    this.active.set(key, { controller, userId, agentId, agentIds });
    return controller;
  }

  /**
   * Atomically check-and-guard for thread deletion.
   * Synchronous: checks ALL slots + marks deleting in one tick.
   * Caller MUST call release() in a finally block after delete completes.
   */
  guardDelete(threadId: string): DeleteGuard {
    if (this.deleting.has(threadId)) {
      return { acquired: false, release: () => {} };
    }
    // Check if ANY slot is active for this thread
    if (this.has(threadId)) {
      return { acquired: false, release: () => {} };
    }
    this.deleting.add(threadId);
    return {
      acquired: true,
      release: () => this.deleting.delete(threadId),
    };
  }

  /**
   * Cancel an active invocation for a specific slot.
   * If requestUserId is provided, only cancels if it matches the invocation owner.
   * Optional abortReason is forwarded to AbortController.abort(reason).
   */
  cancel(threadId: string, agentId: string, requestUserId?: string, abortReason?: string): CancelResult {
    const key = this.slotKey(threadId, agentId);
    const inv = this.active.get(key);
    if (!inv) return { cancelled: false, agentIds: [] };
    if (requestUserId && inv.userId !== requestUserId) return { cancelled: false, agentIds: [] };
    const { agentIds } = inv;
    inv.controller.abort(abortReason);
    this.active.delete(key);
    return { cancelled: true, agentIds };
  }

  /**
   * Cancel ALL active slots for a thread.
   * When requestUserId is provided, only cancel invocations owned by that user.
   * Without it, cancel everything (system/admin flow such as thread deletion).
   */
  cancelAll(threadId: string, requestUserId?: string): string[] {
    const prefix = `${threadId}:`;
    const cancelledAgentIds: string[] = [];
    for (const [key, inv] of this.active) {
      if (key.startsWith(prefix)) {
        if (requestUserId && inv.userId !== requestUserId) continue;
        cancelledAgentIds.push(inv.agentId);
        inv.controller.abort();
        this.active.delete(key);
      }
    }
    return cancelledAgentIds;
  }

  /** Get the userId who started the invocation for a specific slot. */
  getUserId(threadId: string, agentId: string): string | null {
    const key = this.slotKey(threadId, agentId);
    return this.active.get(key)?.userId ?? null;
  }

  /** Get target agent IDs of the active invocation for a specific slot. */
  getAgentIds(threadId: string, agentId: string): string[] {
    const key = this.slotKey(threadId, agentId);
    return this.active.get(key)?.agentIds ?? [];
  }

  /** Mark an invocation as complete (cleanup). Only removes if controller matches. */
  complete(threadId: string, agentId: string, controller?: AbortController): void {
    const key = this.slotKey(threadId, agentId);
    const inv = this.active.get(key);
    if (!inv) return;
    if (controller && inv.controller !== controller) return;
    this.active.delete(key);
  }

  /**
   * Whether a thread/slot has an active invocation.
   * - has(threadId, agentId) — specific slot check
   * - has(threadId) — any slot active in thread?
   */
  has(threadId: string, agentId?: string): boolean {
    if (agentId) {
      return this.active.has(this.slotKey(threadId, agentId));
    }
    // Thread-level: check if ANY slot is active
    const prefix = `${threadId}:`;
    for (const key of this.active.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Get all active agentIds for a thread. */
  getActiveSlots(threadId: string): string[] {
    const prefix = `${threadId}:`;
    const result: string[] = [];
    for (const [key, inv] of this.active) {
      if (key.startsWith(prefix)) {
        result.push(inv.agentId);
      }
    }
    return result;
  }

  /** Whether a thread is currently being deleted (delete guard active). */
  isDeleting(threadId: string): boolean {
    return this.deleting.has(threadId);
  }
}
