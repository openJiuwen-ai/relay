/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  DynamicTaskDef,
  SchedulerPersistence,
  SchedulerProvider,
  SchedulerProviderInput,
} from '@openjiuwen/relay-api-server-contracts/scheduler';

function unavailable(): never {
  throw new Error('scheduler_provider_noop');
}

export function createNoopSchedulerProvider(): SchedulerProvider {
  return {
    id: 'noop',
    displayName: 'No-op Scheduler Persistence',
    createSchedulerPersistence(_input: SchedulerProviderInput): SchedulerPersistence {
      return {
        ledger: {
          record: () => {},
          query: () => [],
          queryBySubject: () => [],
          queryAll: () => [],
          getById: () => null,
          deleteById: () => false,
          stats: () => ({ total: 0, delivered: 0, failed: 0, skipped: 0 }),
        },
        globalControlStore: {
          getGlobalEnabled: () => true,
          getGlobalState: () => ({ enabled: true, reason: null, updatedBy: 'system', updatedAt: new Date().toISOString() }),
          setGlobalEnabled: () => unavailable(),
          getTaskOverride: () => null,
          setTaskOverride: () => unavailable(),
          removeTaskOverride: () => false,
          listOverrides: () => [],
        },
        emissionStore: {
          record: () => {},
          isSuppressed: () => false,
          cleanup: () => 0,
          listActive: () => [],
        },
        packTemplateStore: {
          install: () => unavailable(),
          get: () => null,
          uninstall: () => false,
          listByPack: () => [],
          listAll: () => [],
        },
        dynamicTaskStore: {
          insert: (_def: DynamicTaskDef) => unavailable(),
          getAll: () => [],
          getById: () => null,
          remove: () => false,
          setEnabled: () => false,
          update: () => false,
          removeByThreadId: () => [],
        },
      };
    },
  };
}
