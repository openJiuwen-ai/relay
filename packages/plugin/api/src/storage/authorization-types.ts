/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId, AuthorizationAuditEntry, AuthorizationRule, RespondScope } from '@openjiuwen/relay-shared';

export type { AuthorizationAuditEntry, AuthorizationRule };

export interface CreateAuditInput {
  readonly requestId: string;
  readonly invocationId: string;
  readonly agentId: AgentId;
  readonly threadId: string;
  readonly action: string;
  readonly reason: string;
  readonly decision: 'allow' | 'deny' | 'pending';
  readonly scope?: RespondScope;
  readonly decidedBy?: string;
  readonly matchedRuleId?: string;
}

export interface IAuthorizationAuditStore {
  append(input: CreateAuditInput): AuthorizationAuditEntry | Promise<AuthorizationAuditEntry>;
  list(filter?: {
    agentId?: AgentId;
    threadId?: string;
    limit?: number;
  }): AuthorizationAuditEntry[] | Promise<AuthorizationAuditEntry[]>;
}

export interface IAuthorizationRuleStore {
  add(rule: Omit<AuthorizationRule, 'id' | 'createdAt'>): AuthorizationRule | Promise<AuthorizationRule>;
  remove(ruleId: string): boolean | Promise<boolean>;
  match(
    agentId: AgentId,
    action: string,
    threadId: string,
  ): AuthorizationRule | null | Promise<AuthorizationRule | null>;
  list(filter?: { agentId?: AgentId; threadId?: string }): AuthorizationRule[] | Promise<AuthorizationRule[]>;
}

export type ApprovalDecision = 'allow' | 'deny' | 'pending';
export type ApprovalScope = 'once' | 'thread' | 'global';
export type ApprovalSource = 'user' | 'rule';

export interface ApprovalRecordInput {
  requestId: string;
  invocationId: string;
  agentId: AgentId;
  threadId: string;
  threadTitle?: string | null;
  action: string;
  operationSummary?: string | null;
  decision: ApprovalDecision;
  approvalSource: ApprovalSource;
  requestedAt: number;
  decidedAt?: number | null;
  scope?: ApprovalScope | null;
  decidedBy?: string | null;
  matchedRuleId?: string | null;
}

export interface SecurityApprovalRecord extends ApprovalRecordInput {
  id: string;
  approvalLabel: string;
}

export interface SecurityApprovalRecordSettings {
  autoCleanupEnabled: boolean;
  retentionDays: number;
}

export interface ListApprovalRecordsQuery {
  limit?: number;
  offset?: number;
  threadQuery?: string;
  includeRuleMatched?: boolean;
}

export interface SecurityApprovalRecordsResponse {
  records: SecurityApprovalRecord[];
  pageInfo: {
    hasMore: boolean;
    nextOffset?: number;
  };
  totalCount: number;
  retention: {
    autoCleanupEnabled: boolean;
    retentionDays: number | null;
  };
}

export interface IApprovalRecordStore {
  record(input: ApprovalRecordInput): SecurityApprovalRecord | Promise<SecurityApprovalRecord>;
  list(query?: ListApprovalRecordsQuery): SecurityApprovalRecordsResponse | Promise<SecurityApprovalRecordsResponse>;
  getSettings(): SecurityApprovalRecordSettings | Promise<SecurityApprovalRecordSettings>;
  updateSettings(input: { autoCleanupEnabled: boolean }): SecurityApprovalRecordSettings | Promise<SecurityApprovalRecordSettings>;
  close(): void;
}
