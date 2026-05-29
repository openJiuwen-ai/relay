/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import type { AgentId } from '@openjiuwen/relay-shared';

export type DispatchTaskPhase = 'resolution' | 'dispatch' | 'response_collection';
export type DispatchTaskStatus = 'accepted' | 'queued' | 'running' | 'succeeded' | 'failed' | 'timeout';
export type DispatchTaskErrorCode =
  | 'unknown_target'
  | 'ambiguous_target'
  | 'dispatch_failed'
  | 'target_invocation_failed'
  | 'response_timeout'
  | 'response_collection_failed';

export interface DispatchTaskRecord {
  requestId: string;
  sourceInvocationId: string;
  threadId: string;
  target: string;
  resolvedTargetAgentId?: AgentId;
  status: DispatchTaskStatus;
  phase: DispatchTaskPhase;
  responseText: string;
  errorCode?: DispatchTaskErrorCode;
  message?: string;
  idempotencyKey?: string;
  createdAt: number;
  updatedAt: number;
}

interface CreateDispatchTaskInput {
  sourceInvocationId: string;
  threadId: string;
  target: string;
  resolvedTargetAgentId?: AgentId;
  idempotencyKey?: string;
}

const TERMINAL_STATUSES = new Set<DispatchTaskStatus>(['succeeded', 'failed', 'timeout']);

export class DispatchTaskRegistry {
  private readonly records = new Map<string, DispatchTaskRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly listeners = new Map<string, Set<(record: DispatchTaskRecord) => void>>();

  create(input: CreateDispatchTaskInput): { record: DispatchTaskRecord; created: boolean } {
    if (input.idempotencyKey) {
      const existingId = this.idempotencyIndex.get(`${input.threadId}:${input.idempotencyKey}`);
      if (existingId) {
        const existing = this.records.get(existingId);
        if (existing) {
          return { record: existing, created: false };
        }
      }
    }

    const now = Date.now();
    const record: DispatchTaskRecord = {
      requestId: randomUUID(),
      sourceInvocationId: input.sourceInvocationId,
      threadId: input.threadId,
      target: input.target,
      ...(input.resolvedTargetAgentId ? { resolvedTargetAgentId: input.resolvedTargetAgentId } : {}),
      status: 'accepted',
      phase: 'dispatch',
      responseText: '',
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(record.requestId, record);
    if (input.idempotencyKey) {
      this.idempotencyIndex.set(`${input.threadId}:${input.idempotencyKey}`, record.requestId);
    }
    return { record, created: true };
  }

  get(requestId: string): DispatchTaskRecord | undefined {
    return this.records.get(requestId);
  }

  markQueued(requestId: string): DispatchTaskRecord {
    return this.update(requestId, {
      status: 'queued',
      phase: 'dispatch',
      errorCode: undefined,
      message: undefined,
    });
  }

  markRunning(requestId: string): DispatchTaskRecord {
    return this.update(requestId, {
      status: 'running',
      phase: 'response_collection',
      errorCode: undefined,
      message: undefined,
    });
  }

  markSucceeded(requestId: string, responseText: string): DispatchTaskRecord {
    return this.update(requestId, {
      status: 'succeeded',
      phase: 'response_collection',
      responseText,
      errorCode: undefined,
      message: undefined,
    });
  }

  markFailed(requestId: string, errorCode: DispatchTaskErrorCode, message: string, responseText = ''): DispatchTaskRecord {
    return this.update(requestId, {
      status: 'failed',
      phase: errorCode === 'dispatch_failed' ? 'dispatch' : 'response_collection',
      responseText,
      errorCode,
      message,
    });
  }

  markTimeout(requestId: string, message: string): DispatchTaskRecord {
    return this.update(requestId, {
      status: 'timeout',
      phase: 'response_collection',
      errorCode: 'response_timeout',
      message,
    });
  }

  async waitForTerminal(requestId: string, timeoutMs: number): Promise<DispatchTaskRecord> {
    const existing = this.records.get(requestId);
    if (!existing) {
      throw new Error(`Dispatch task not found: ${requestId}`);
    }
    if (TERMINAL_STATUSES.has(existing.status)) return existing;

    return await new Promise<DispatchTaskRecord>((resolve) => {
      const timer = setTimeout(() => {
        const timedOut = this.markTimeout(requestId, `Timed out waiting for target agent response after ${timeoutMs} ms.`);
        this.removeListener(requestId, onUpdate);
        resolve(timedOut);
      }, timeoutMs);
      timer.unref();

      const onUpdate = (record: DispatchTaskRecord) => {
        if (!TERMINAL_STATUSES.has(record.status)) return;
        clearTimeout(timer);
        this.removeListener(requestId, onUpdate);
        resolve(record);
      };

      this.addListener(requestId, onUpdate);
    });
  }

  private update(
    requestId: string,
    patch: Partial<Pick<DispatchTaskRecord, 'status' | 'phase' | 'responseText' | 'errorCode' | 'message'>>,
  ): DispatchTaskRecord {
    const current = this.records.get(requestId);
    if (!current) {
      throw new Error(`Dispatch task not found: ${requestId}`);
    }

    const next: DispatchTaskRecord = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };

    this.records.set(requestId, next);
    this.listeners.get(requestId)?.forEach((listener) => listener(next));
    return next;
  }

  private addListener(requestId: string, listener: (record: DispatchTaskRecord) => void): void {
    const listeners = this.listeners.get(requestId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(requestId, listeners);
  }

  private removeListener(requestId: string, listener: (record: DispatchTaskRecord) => void): void {
    const listeners = this.listeners.get(requestId);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(requestId);
    }
  }
}
