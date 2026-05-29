/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authorization Rule Store
 * 持久化授权规则 — 类似 Claude Code 的 allow/deny 记忆
 *
 * scope 只有 thread | global（'once' 不存规则）
 * action 支持通配: 'git_*' 匹配 'git_commit'
 */

import type { AgentId, AuthorizationRule } from '@openjiuwen/relay-shared';
import { generateSortableId } from './MessageStore.js';

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type { IAuthorizationRuleStore } from '@openjiuwen/relay-api-server-contracts/storage';

import type { IAuthorizationRuleStore } from '@openjiuwen/relay-api-server-contracts/storage';

/** Simple glob-style match: 'git_*' matches 'git_commit' */
function matchAction(pattern: string, action: string): boolean {
  if (pattern === '*') return true;
  if (pattern === action) return true;
  if (pattern.endsWith('*')) {
    return action.startsWith(pattern.slice(0, -1));
  }
  return false;
}

const DEFAULT_MAX_RULES = 500;

export class AuthorizationRuleStore implements IAuthorizationRuleStore {
  private rules = new Map<string, AuthorizationRule>();
  private readonly maxRules: number;

  constructor(options?: { maxRules?: number }) {
    this.maxRules = options?.maxRules ?? DEFAULT_MAX_RULES;
  }

  add(input: Omit<AuthorizationRule, 'id' | 'createdAt'>): AuthorizationRule {
    if (this.rules.size >= this.maxRules) {
      const firstKey = this.rules.keys().next().value;
      if (firstKey) this.rules.delete(firstKey);
    }
    const rule: AuthorizationRule = {
      ...input,
      id: generateSortableId(Date.now()),
      createdAt: Date.now(),
    };
    this.rules.set(rule.id, rule);
    return rule;
  }

  remove(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Match rules: thread-scoped first (more specific), then global.
   * Within same scope, later rules win (higher createdAt).
   */
  match(agentId: AgentId, action: string, threadId: string): AuthorizationRule | null {
    let bestThread: AuthorizationRule | null = null;
    let bestGlobal: AuthorizationRule | null = null;

    for (const rule of this.rules.values()) {
      const agentMatch = rule.agentId === '*' || rule.agentId === agentId;
      if (!agentMatch) continue;
      if (!matchAction(rule.action, action)) continue;

      if (rule.scope === 'thread' && rule.threadId === threadId) {
        if (!bestThread || rule.createdAt > bestThread.createdAt) {
          bestThread = rule;
        }
      } else if (rule.scope === 'global') {
        if (!bestGlobal || rule.createdAt > bestGlobal.createdAt) {
          bestGlobal = rule;
        }
      }
    }

    return bestThread ?? bestGlobal ?? null;
  }

  list(filter?: { agentId?: AgentId; threadId?: string }): AuthorizationRule[] {
    const result: AuthorizationRule[] = [];
    for (const rule of this.rules.values()) {
      if (filter?.agentId && rule.agentId !== filter.agentId && rule.agentId !== '*') continue;
      if (filter?.threadId && rule.scope === 'thread' && rule.threadId !== filter.threadId) continue;
      result.push(rule);
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  get size(): number {
    return this.rules.size;
  }
}
