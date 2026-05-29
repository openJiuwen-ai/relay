/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId, SessionRecord } from '@openjiuwen/relay-shared';

export type { SessionRecord };

export interface CreateSessionInput {
  cliSessionId: string;
  threadId: string;
  agentId: AgentId;
  userId: string;
}

export type SessionRecordPatch = Partial<
  Pick<
    SessionRecord,
    | 'cliSessionId'
    | 'status'
    | 'contextHealth'
    | 'lastUsage'
    | 'messageCount'
    | 'sealReason'
    | 'sealedAt'
    | 'updatedAt'
    | 'compressionCount'
    | 'consecutiveRestoreFailures'
  >
>;

export interface ISessionChainStore {
  create(input: CreateSessionInput): SessionRecord | Promise<SessionRecord>;
  get(id: string): SessionRecord | null | Promise<SessionRecord | null>;
  getActive(agentId: AgentId, threadId: string): SessionRecord | null | Promise<SessionRecord | null>;
  getChain(agentId: AgentId, threadId: string): SessionRecord[] | Promise<SessionRecord[]>;
  getChainByThread(threadId: string): SessionRecord[] | Promise<SessionRecord[]>;
  update(id: string, patch: SessionRecordPatch): SessionRecord | null | Promise<SessionRecord | null>;
  getByCliSessionId(cliSessionId: string): SessionRecord | null | Promise<SessionRecord | null>;
  incrementCompressionCount(id: string): number | null | Promise<number | null>;
  listSealingSessions(): string[] | Promise<string[]>;
}
