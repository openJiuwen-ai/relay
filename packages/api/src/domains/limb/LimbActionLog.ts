/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * LimbActionLog — F126 Phase B provenance 审计日志
 *
 * 每次四肢调用记录完整 provenance，支持审计和回放。
 * 内存实现，runtime 活状态不进 F102/evidence index（AC-B5）。
 */

import { randomUUID } from 'node:crypto';
import type { LimbActionLogEntry } from '@openjiuwen/relay-shared';

export class LimbActionLog {
  private readonly entries = new Map<string, LimbActionLogEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries = 10_000) {
    this.maxEntries = maxEntries;
  }

  /** 开始记录一次操作，返回 requestId */
  start(params: {
    invocationId: string;
    leaseId: string | null;
    agentId: string;
    nodeId: string;
    capability: string;
    command: string;
    idempotencyKey?: string;
  }): string {
    const requestId = randomUUID();
    const entry: LimbActionLogEntry = {
      requestId,
      invocationId: params.invocationId,
      leaseId: params.leaseId,
      agentId: params.agentId,
      nodeId: params.nodeId,
      capability: params.capability,
      command: params.command,
      artifactUri: null,
      status: 'pending',
      startedAt: Date.now(),
      endedAt: null,
      idempotencyKey: params.idempotencyKey ?? null,
    };

    // Evict oldest if at capacity
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }

    this.entries.set(requestId, entry);
    return requestId;
  }

  /** 标记运行中 */
  markRunning(requestId: string): void {
    const entry = this.entries.get(requestId);
    if (entry) entry.status = 'running';
  }

  /** 标记完成 */
  complete(requestId: string, result?: { artifactUri?: string }): void {
    const entry = this.entries.get(requestId);
    if (entry) {
      entry.status = 'completed';
      entry.endedAt = Date.now();
      if (result?.artifactUri) entry.artifactUri = result.artifactUri;
    }
  }

  /** 标记失败 */
  fail(requestId: string): void {
    const entry = this.entries.get(requestId);
    if (entry) {
      entry.status = 'failed';
      entry.endedAt = Date.now();
    }
  }

  /** 按 requestId 获取 */
  get(requestId: string): LimbActionLogEntry | undefined {
    return this.entries.get(requestId);
  }

  /** 按 nodeId 查询（最近 N 条） */
  getByNode(nodeId: string, limit = 50): LimbActionLogEntry[] {
    return [...this.entries.values()].filter((e) => e.nodeId === nodeId).slice(-limit);
  }

  /** 按 agentId 查询（最近 N 条） */
  getByCat(agentId: string, limit = 50): LimbActionLogEntry[] {
    return [...this.entries.values()].filter((e) => e.agentId === agentId).slice(-limit);
  }

  get size(): number {
    return this.entries.size;
  }
}
