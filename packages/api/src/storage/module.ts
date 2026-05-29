/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { OfficeClawStorageProvider } from '@openjiuwen/relay-api-server-contracts/storage';
import type { Redis as RedisClient } from 'ioredis';
import { memoryStorageProvider } from './providers/memory-storage-provider.js';
import { createRedisStorageProvider } from './providers/redis-storage-provider.js';
import { StorageProviderRegistry } from './storage-provider-registry.js';

export interface StorageModule {
  activeProviderId: string;
  providerRegistry: StorageProviderRegistry;
  getActiveProvider(): OfficeClawStorageProvider;
}

export interface CreateStorageModuleOptions {
  env?: NodeJS.ProcessEnv;
  redis?: RedisClient;
  moduleLoader?: (specifier: string) => Promise<unknown>;
  providers?: OfficeClawStorageProvider[];
}

function parseModuleSpecifiers(env: NodeJS.ProcessEnv): string[] {
  const raw = env.OFFICE_CLAW_STORAGE_PROVIDER_MODULES?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Resolve the active storage provider ID.
 *
 * When OFFICE_CLAW_STORAGE_PROVIDER is set, that value is used (fast-fail if unavailable).
 * When not set, falls back to legacy behavior:
 *   - redis client available → 'redis'
 *   - MEMORY_STORE=1 → 'memory'
 *   - else → throw (fail-closed, same as existing assertStorageReady)
 */
function resolveActiveProviderId(env: NodeJS.ProcessEnv, redis?: RedisClient): string {
  const explicit = env.OFFICE_CLAW_STORAGE_PROVIDER?.trim();
  if (explicit) return explicit;

  if (redis) return 'redis';
  if (env.MEMORY_STORE === '1') return 'memory';

  throw new Error(
    '[storage] No storage provider configured. ' +
      'Set OFFICE_CLAW_STORAGE_PROVIDER=redis|memory|<external>, ' +
      'or provide REDIS_URL, or set MEMORY_STORE=1.',
  );
}

export async function createStorageModule(options: CreateStorageModuleOptions = {}): Promise<StorageModule> {
  const env = options.env ?? process.env;
  const moduleLoader = options.moduleLoader ?? ((specifier: string) => import(specifier));
  const providerRegistry = new StorageProviderRegistry();

  providerRegistry.register(memoryStorageProvider);

  if (options.redis) {
    providerRegistry.register(createRedisStorageProvider(options.redis));
  }

  for (const provider of options.providers ?? []) {
    providerRegistry.register(provider);
  }

  for (const moduleSpecifier of parseModuleSpecifiers(env)) {
    await providerRegistry.registerModule(moduleSpecifier, moduleLoader, memoryStorageProvider);
  }

  const activeProviderId = resolveActiveProviderId(env, options.redis);
  const activeProvider = providerRegistry.get(activeProviderId);

  await activeProvider.bootstrap?.();

  return {
    activeProviderId,
    providerRegistry,
    getActiveProvider() {
      return activeProvider;
    },
  };
}
