/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Session Manager
 * 管理 user+agent+thread session ID 的存取。
 *
 * 注意：Session 按 threadId 隔离（茶话会夺魂 bug fix #38）
 * - 同一用户与同一猫在不同 thread 有独立的 session
 * - 避免跨 thread 上下文污染
 *
 * Redis SessionStore 可用时走 Redis，否则降级到内存 Map (LRU)。
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import type { SessionStore } from '@openjiuwen/relay-shared/utils';

/** Maximum number of sessions to keep in memory (fallback mode only) */
const MAX_SESSIONS = 1000;

export class SessionManager {
  private readonly sessionStore: SessionStore | null;
  /** In-memory fallback when no Redis SessionStore is provided */
  private readonly sessions: Map<string, string> = new Map();

  constructor(sessionStore?: SessionStore) {
    this.sessionStore = sessionStore ?? null;
  }

  /**
   * Store session ID for user + agent + thread combination.
   * Uses Redis SessionStore when available, falls back to in-memory Map.
   */
  async store(userId: string, agentId: AgentId, threadId: string, sessionId: string): Promise<void> {
    if (this.sessionStore) {
      await this.sessionStore.setSessionId(userId, agentId, threadId, sessionId);
      return;
    }

    const key = `${userId}:${agentId}:${threadId}`;

    // Delete first so it moves to the end (most recent) on re-insert
    if (this.sessions.has(key)) {
      this.sessions.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey !== undefined) {
        this.sessions.delete(oldestKey);
      }
    }

    this.sessions.set(key, sessionId);
  }

  /**
   * Get stored session ID for user + agent + thread combination.
   * Uses Redis SessionStore when available, falls back to in-memory Map.
   */
  async get(userId: string, agentId: AgentId, threadId: string): Promise<string | undefined> {
    if (this.sessionStore) {
      const result = await this.sessionStore.getSessionId(userId, agentId, threadId);
      return result ?? undefined;
    }

    return this.sessions.get(`${userId}:${agentId}:${threadId}`);
  }

  /**
   * Delete stored session for user + agent + thread combination.
   * Used by self-healing flows when persisted CLI session becomes invalid.
   */
  async delete(userId: string, agentId: AgentId, threadId: string): Promise<void> {
    if (this.sessionStore) {
      await this.sessionStore.deleteSession(userId, agentId, threadId);
      return;
    }
    this.sessions.delete(`${userId}:${agentId}:${threadId}`);
  }
}
