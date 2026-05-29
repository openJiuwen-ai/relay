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
import type { Redis as RedisClient } from 'ioredis';
import { RedisAuthorizationAuditStore } from '../../domains/agents/services/stores/redis/RedisAuthorizationAuditStore.js';
import { RedisAuthorizationRuleStore } from '../../domains/agents/services/stores/redis/RedisAuthorizationRuleStore.js';
import { RedisBacklogStore } from '../../domains/agents/services/stores/redis/RedisBacklogStore.js';
import { RedisDraftStore } from '../../domains/agents/services/stores/redis/RedisDraftStore.js';
import { RedisInvocationRecordStore } from '../../domains/agents/services/stores/redis/RedisInvocationRecordStore.js';
import { RedisMemoryStore } from '../../domains/agents/services/stores/redis/RedisMemoryStore.js';
import { RedisMessageStore } from '../../domains/agents/services/stores/redis/RedisMessageStore.js';
import { RedisPendingRequestStore } from '../../domains/agents/services/stores/redis/RedisPendingRequestStore.js';
import { RedisPushSubscriptionStore } from '../../domains/agents/services/stores/redis/RedisPushSubscriptionStore.js';
import { RedisSessionChainStore } from '../../domains/agents/services/stores/redis/RedisSessionChainStore.js';
import { RedisTaskStore } from '../../domains/agents/services/stores/redis/RedisTaskStore.js';
import { RedisThreadReadStateStore } from '../../domains/agents/services/stores/redis/RedisThreadReadStateStore.js';
import { RedisThreadStore } from '../../domains/agents/services/stores/redis/RedisThreadStore.js';
import { RedisWorkflowSopStore } from '../../domains/agents/services/stores/redis/RedisWorkflowSopStore.js';

function ttlOpts(options?: CreateStoreOptions): { ttlSeconds: number } | undefined {
  return options?.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : undefined;
}

export function createRedisStorageProvider(redis: RedisClient): OfficeClawStorageProvider {
  return {
    id: 'redis',
    displayName: 'Redis Storage',

    createMessageStore(options?: CreateMessageStoreOptions) {
      return new RedisMessageStore(redis, {
        ...(options?.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : {}),
        onAppend: options?.onAppend,
      });
    },

    createThreadStore(options?: CreateThreadStoreOptions) {
      return new RedisThreadStore(
        redis,
        options?.ttlSeconds !== undefined ? { ttlSeconds: options.ttlSeconds } : undefined,
      );
    },

    createTaskStore(options?: CreateStoreOptions) {
      return new RedisTaskStore(redis, ttlOpts(options));
    },

    createBacklogStore(options?: CreateStoreOptions) {
      return new RedisBacklogStore(redis, ttlOpts(options));
    },


    createMemoryStore(_options?: CreateStoreOptions) {
      return new RedisMemoryStore(redis);
    },

    createDraftStore(options?: CreateStoreOptions) {
      // Explicit { ttlSeconds: 0 } disables TTL. Without it, RedisDraftStore's
      // DEFAULT_TTL (0 as number) would trigger EXPIRE 0 = immediate key deletion.
      return new RedisDraftStore(redis, ttlOpts(options) ?? { ttlSeconds: 0 });
    },

    createSessionChainStore(_options?: CreateStoreOptions) {
      return new RedisSessionChainStore(redis);
    },

    createInvocationRecordStore(_options?: CreateStoreOptions) {
      return new RedisInvocationRecordStore(redis);
    },

    createPendingRequestStore(options?: CreateStoreOptions) {
      return new RedisPendingRequestStore(redis, ttlOpts(options));
    },

    createAuthorizationRuleStore(options?: CreateStoreOptions) {
      return new RedisAuthorizationRuleStore(redis, ttlOpts(options));
    },

    createAuthorizationAuditStore(options?: CreateStoreOptions) {
      return new RedisAuthorizationAuditStore(redis, ttlOpts(options));
    },

    createPushSubscriptionStore(options?: CreateStoreOptions) {
      return new RedisPushSubscriptionStore(redis, ttlOpts(options));
    },

    createReadStateStore(_options?: CreateStoreOptions) {
      return new RedisThreadReadStateStore(redis);
    },

    createWorkflowSopStore(options?: CreateStoreOptions) {
      return new RedisWorkflowSopStore(redis, ttlOpts(options));
    },

    async bootstrap() {
      await redis.ping();
    },
  };
}
