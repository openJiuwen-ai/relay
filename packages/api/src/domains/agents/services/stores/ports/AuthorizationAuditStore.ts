/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authorization Audit Store
 * 审计日志持久化 — 所有授权事件必须有记录
 */

import type { AgentId, AuthorizationAuditEntry } from '@openjiuwen/relay-shared';
import { generateSortableId } from './MessageStore.js';

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type { CreateAuditInput, IAuthorizationAuditStore } from '@openjiuwen/relay-api-server-contracts/storage';

import type { CreateAuditInput, IAuthorizationAuditStore } from '@openjiuwen/relay-api-server-contracts/storage';

const DEFAULT_MAX = 5000;

export class AuthorizationAuditStore implements IAuthorizationAuditStore {
  private entries: AuthorizationAuditEntry[] = [];
  private readonly maxEntries: number;

  constructor(options?: { maxEntries?: number }) {
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX;
  }

  append(input: CreateAuditInput): AuthorizationAuditEntry {
    if (this.entries.length >= this.maxEntries) {
      this.entries = this.entries.slice(-Math.floor(this.maxEntries * 0.8));
    }

    const entry: AuthorizationAuditEntry = {
      ...input,
      id: generateSortableId(Date.now()),
      createdAt: Date.now(),
      ...(input.decidedBy ? { decidedAt: Date.now() } : {}),
    };
    this.entries.push(entry);
    return entry;
  }

  list(filter?: { agentId?: AgentId; threadId?: string; limit?: number }): AuthorizationAuditEntry[] {
    const limit = filter?.limit ?? 100;
    const result: AuthorizationAuditEntry[] = [];

    for (let i = this.entries.length - 1; i >= 0 && result.length < limit; i--) {
      const entry = this.entries[i]!;
      if (filter?.agentId && entry.agentId !== filter.agentId) continue;
      if (filter?.threadId && entry.threadId !== filter.threadId) continue;
      result.push(entry);
    }
    return result;
  }

  get size(): number {
    return this.entries.length;
  }
}
