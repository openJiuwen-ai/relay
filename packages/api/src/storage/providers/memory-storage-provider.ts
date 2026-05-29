/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  CreateMessageStoreOptions,
  CreateStoreOptions,
  CreateThreadStoreOptions,
  OfficeClawStorageProvider,
} from '@openjiuwen/relay-api-server-contracts/storage';
import { AuthorizationAuditStore } from '../../domains/agents/services/stores/ports/AuthorizationAuditStore.js';
import { AuthorizationRuleStore } from '../../domains/agents/services/stores/ports/AuthorizationRuleStore.js';
import { BacklogStore } from '../../domains/agents/services/stores/ports/BacklogStore.js';
import { DraftStore } from '../../domains/agents/services/stores/ports/DraftStore.js';
import { InvocationRecordStore } from '../../domains/agents/services/stores/ports/InvocationRecordStore.js';
import { MemoryStore } from '../../domains/agents/services/stores/ports/MemoryStore.js';
import { MessageStore } from '../../domains/agents/services/stores/ports/MessageStore.js';
import { PendingRequestStore } from '../../domains/agents/services/stores/ports/PendingRequestStore.js';
import { PushSubscriptionStore } from '../../domains/agents/services/stores/ports/PushSubscriptionStore.js';
import { SessionChainStore } from '../../domains/agents/services/stores/ports/SessionChainStore.js';
import { TaskStore } from '../../domains/agents/services/stores/ports/TaskStore.js';
import { ThreadReadStateStore } from '../../domains/agents/services/stores/ports/ThreadReadStateStore.js';
import { ThreadStore } from '../../domains/agents/services/stores/ports/ThreadStore.js';
import { WorkflowSopStore } from '../../domains/agents/services/stores/ports/WorkflowSopStore.js';

export const memoryStorageProvider: OfficeClawStorageProvider = {
  id: 'memory',
  displayName: 'In-Memory Storage',

  createMessageStore(options?: CreateMessageStoreOptions) {
    return new MessageStore({ onAppend: options?.onAppend });
  },

  createThreadStore(_options?: CreateThreadStoreOptions) {
    return new ThreadStore();
  },

  createTaskStore(_options?: CreateStoreOptions) {
    return new TaskStore();
  },

  createBacklogStore(_options?: CreateStoreOptions) {
    return new BacklogStore();
  },


  createMemoryStore(_options?: CreateStoreOptions) {
    return new MemoryStore();
  },

  createDraftStore(_options?: CreateStoreOptions) {
    return new DraftStore();
  },

  createSessionChainStore(_options?: CreateStoreOptions) {
    return new SessionChainStore();
  },

  createInvocationRecordStore(_options?: CreateStoreOptions) {
    return new InvocationRecordStore();
  },

  createPendingRequestStore(_options?: CreateStoreOptions) {
    return new PendingRequestStore();
  },

  createAuthorizationRuleStore(_options?: CreateStoreOptions) {
    return new AuthorizationRuleStore();
  },

  createAuthorizationAuditStore(_options?: CreateStoreOptions) {
    return new AuthorizationAuditStore();
  },

  createPushSubscriptionStore(_options?: CreateStoreOptions) {
    return new PushSubscriptionStore();
  },

  createReadStateStore(_options?: CreateStoreOptions) {
    return new ThreadReadStateStore();
  },

  createWorkflowSopStore(_options?: CreateStoreOptions) {
    return new WorkflowSopStore();
  },
};
