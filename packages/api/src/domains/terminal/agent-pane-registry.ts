/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * AgentPaneRegistry — tracks which invocations are running in tmux panes.
 * In-memory store; used by terminal routes to let frontend discover agent panes.
 */

export type AgentPaneStatus = 'running' | 'done' | 'crashed';

export interface AgentPaneInfo {
  invocationId: string;
  worktreeId: string;
  paneId: string;
  userId: string;
  status: AgentPaneStatus;
  exitCode?: number | null;
  signal?: string | null;
  startedAt: number;
  finishedAt?: number;
}

const STALE_THRESHOLD_MS = 3_600_000; // 1 hour after finishing

export class AgentPaneRegistry {
  private panes = new Map<string, AgentPaneInfo>();

  register(invocationId: string, worktreeId: string, paneId: string, userId: string): void {
    this.panes.set(invocationId, {
      invocationId,
      worktreeId,
      paneId,
      userId,
      status: 'running',
      startedAt: Date.now(),
    });
    this.evictStale();
  }

  getByInvocation(invocationId: string): AgentPaneInfo | undefined {
    return this.panes.get(invocationId);
  }

  listByWorktreeAndUser(worktreeId: string, userId: string): AgentPaneInfo[] {
    const now = Date.now();
    return Array.from(this.panes.values()).filter(
      (p) =>
        p.worktreeId === worktreeId &&
        p.userId === userId &&
        (p.status === 'running' || !p.finishedAt || now - p.finishedAt < STALE_THRESHOLD_MS),
    );
  }

  /** Remove terminal entries (done/crashed) older than threshold since finishing */
  private evictStale(): void {
    const now = Date.now();
    for (const [id, p] of this.panes) {
      if (p.status !== 'running' && p.finishedAt && now - p.finishedAt > STALE_THRESHOLD_MS) {
        this.panes.delete(id);
      }
    }
  }

  markDone(invocationId: string, exitCode: number | null): void {
    const p = this.panes.get(invocationId);
    if (p) {
      p.status = 'done';
      p.exitCode = exitCode;
      p.finishedAt = Date.now();
    }
  }

  markCrashed(invocationId: string, signal: string | null): void {
    const p = this.panes.get(invocationId);
    if (p) {
      p.status = 'crashed';
      p.signal = signal;
      p.finishedAt = Date.now();
    }
  }

  remove(invocationId: string): void {
    this.panes.delete(invocationId);
  }
}
