/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * LimbAccessPolicy — F126 Phase B 三维权限检查
 *
 * agentId × nodeId × capability → authLevel
 * 三级授权：free（直接通过）/ leased（需要租约）/ gated（需要用户审批）
 */

import type { LimbAccessEntry, LimbAuthLevel, LimbCapability } from '@openjiuwen/relay-shared';

export class LimbAccessPolicy {
  private readonly policies = new Map<string, LimbAccessEntry>();

  private static key(agentId: string, nodeId: string, capability: string): string {
    return `${agentId}:${nodeId}:${capability}`;
  }

  /** 设置权限条目（覆盖已有） */
  setPolicy(entry: LimbAccessEntry): void {
    this.policies.set(LimbAccessPolicy.key(entry.agentId, entry.nodeId, entry.capability), entry);
  }

  /** 检查显式策略（未配置返回 null） */
  check(agentId: string, nodeId: string, capability: string): LimbAuthLevel | null {
    const entry = this.policies.get(LimbAccessPolicy.key(agentId, nodeId, capability));
    return entry?.authLevel ?? null;
  }

  /** 获取生效的权限级别：显式策略优先，回退到能力自身的 authLevel */
  getEffectiveAuth(agentId: string, nodeId: string, cap: LimbCapability): LimbAuthLevel {
    return this.check(agentId, nodeId, cap.cap) ?? cap.authLevel;
  }
}
