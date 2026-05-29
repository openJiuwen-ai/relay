/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type PermissionDecision = 'allow' | 'ask';

export interface ToolPermissionRule {
  '*': PermissionDecision;
  patterns?: Record<string, PermissionDecision>;
}

export interface PermissionsConfig {
  enabled?: boolean;
  rw_enabled?: boolean;
  tools?: Record<string, PermissionDecision | ToolPermissionRule>;
}

export interface SecurityPolicyItem {
  id: string;
  action: string;
  approvalRequired: boolean;
}

export interface ApprovalRecord {
  id: string;
  threadId?: string;
  threadTitle?: string | null;
  action: string;
  approvalLabel: string;
  decidedAt?: number | null;
}

export interface ApprovalRecordsResponse {
  records: ApprovalRecord[];
  pageInfo: {
    hasMore: boolean;
    nextOffset?: number;
  };
  totalCount: number;
  retention?: {
    autoCleanupEnabled: boolean;
    retentionDays: number | null;
  };
  error?: string;
}

export interface ApprovalRecordSettingsResponse {
  autoCleanupEnabled?: boolean;
  retentionDays?: number;
  error?: string;
}
