/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { OfficeClawStorageProvider } from '@openjiuwen/relay-api-server-contracts/storage';
import { createSqliteApprovalRecordStore } from './authorization/index.js';

export { evidenceProvider } from './evidence/sqlite.js';
export { schedulerProvider } from './scheduler/sqlite.js';
export {
  createSqliteApprovalRecordStore,
  SqliteApprovalRecordStore,
  type ApprovalDecision,
  type ApprovalRecordInput,
  type ApprovalScope,
  type ApprovalSource,
  type ListApprovalRecordsQuery,
  type SecurityApprovalRecord,
  type SecurityApprovalRecordsResponse,
  type SecurityApprovalRecordSettings,
} from './authorization/index.js';

export const approvalRecordStorageProvider: Pick<OfficeClawStorageProvider, 'id' | 'displayName' | 'createApprovalRecordStore'> = {
  id: 'sqlite-approval-records',
  displayName: 'SQLite Approval Records',
  createApprovalRecordStore(options) {
    return createSqliteApprovalRecordStore(options?.storagePath ?? 'security-approval-records.sqlite');
  },
};

export const storageProvider = approvalRecordStorageProvider;
