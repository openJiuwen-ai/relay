/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';

export type SessionStatus = 'connected' | 'disconnected';

export interface SessionRecord {
  id: string;
  worktreeId: string;
  paneId: string;
  userId: string;
  status: SessionStatus;
  createdAt: number;
}

export interface CreateSessionInput {
  worktreeId: string;
  paneId: string;
  userId: string;
}

/**
 * In-memory session store for terminal sessions.
 * Decoupled from PTY/tmux so it can be tested independently.
 */
export class TerminalSessionStore {
  private sessions = new Map<string, SessionRecord>();

  create(input: CreateSessionInput): SessionRecord {
    const record: SessionRecord = {
      id: randomUUID(),
      worktreeId: input.worktreeId,
      paneId: input.paneId,
      userId: input.userId,
      status: 'connected',
      createdAt: Date.now(),
    };
    this.sessions.set(record.id, record);
    return record;
  }

  get(id: string): SessionRecord | undefined {
    return this.sessions.get(id);
  }

  /** Ownership-gated lookup: returns session only if userId matches. */
  getByIdAndUser(id: string, userId: string): SessionRecord | undefined {
    const s = this.sessions.get(id);
    return s && s.userId === userId ? s : undefined;
  }

  markDisconnected(id: string): void {
    const s = this.sessions.get(id);
    if (s) s.status = 'disconnected';
  }

  markConnected(id: string): void {
    const s = this.sessions.get(id);
    if (s) s.status = 'connected';
  }

  /** Find a disconnected session for this worktree + user (for reconnect). */
  findReconnectable(worktreeId: string, userId: string): SessionRecord | undefined {
    for (const s of this.sessions.values()) {
      if (s.worktreeId === worktreeId && s.userId === userId && s.status === 'disconnected') {
        return s;
      }
    }
    return undefined;
  }

  remove(id: string): SessionRecord | undefined {
    const s = this.sessions.get(id);
    if (s) this.sessions.delete(id);
    return s;
  }

  listByUser(userId: string): SessionRecord[] {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  listByWorktree(worktreeId: string): SessionRecord[] {
    return [...this.sessions.values()].filter((s) => s.worktreeId === worktreeId);
  }

  hasRemainingForWorktree(worktreeId: string): boolean {
    for (const s of this.sessions.values()) {
      if (s.worktreeId === worktreeId) return true;
    }
    return false;
  }
}
