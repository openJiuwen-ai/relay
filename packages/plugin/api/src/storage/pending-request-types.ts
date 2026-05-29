/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId, PendingRequestRecord, RespondScope } from '@openjiuwen/relay-shared';

export type { PendingRequestRecord, RespondScope };

export interface CreatePendingInput {
  readonly invocationId: string;
  readonly agentId: AgentId;
  readonly threadId: string;
  readonly action: string;
  readonly reason: string;
  readonly context?: string;
}

export interface IPendingRequestStore {
  create(input: CreatePendingInput): PendingRequestRecord | Promise<PendingRequestRecord>;
  get(requestId: string): PendingRequestRecord | null | Promise<PendingRequestRecord | null>;
  respond(
    requestId: string,
    decision: 'granted' | 'denied',
    scope: RespondScope,
    reason?: string,
  ): PendingRequestRecord | null | Promise<PendingRequestRecord | null>;
  listWaiting(threadId?: string): PendingRequestRecord[] | Promise<PendingRequestRecord[]>;
}
