/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import type { TokenUsage } from './message-types.js';

export type InvocationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface InvocationRecord {
  id: string;
  threadId: string;
  userId: string;
  userMessageId: string | null;
  targetAgents: AgentId[];
  intent: 'execute' | 'ideate';
  status: InvocationStatus;
  idempotencyKey: string;
  error?: string;
  usageByCat?: Record<string, TokenUsage>;
  usageRecordedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateInvocationInput {
  threadId: string;
  userId: string;
  targetAgents: AgentId[];
  intent: 'execute' | 'ideate';
  idempotencyKey: string;
}

export interface CreateResult {
  outcome: 'created' | 'duplicate';
  invocationId: string;
}

export interface UpdateInvocationInput {
  status?: InvocationStatus;
  userMessageId?: string | null;
  error?: string;
  expectedStatus?: InvocationStatus;
  usageByCat?: Record<string, TokenUsage>;
}

export interface IInvocationRecordStore {
  create(input: CreateInvocationInput): CreateResult | Promise<CreateResult>;
  get(id: string): InvocationRecord | null | Promise<InvocationRecord | null>;
  update(id: string, input: UpdateInvocationInput): InvocationRecord | null | Promise<InvocationRecord | null>;
  getByIdempotencyKey(
    threadId: string,
    userId: string,
    key: string,
  ): InvocationRecord | null | Promise<InvocationRecord | null>;
  scanAll?(): Promise<InvocationRecord[]>;
}
