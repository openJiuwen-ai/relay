/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { SchedulerPersistence, SchedulerProvider } from '@openjiuwen/relay-api-server-contracts/scheduler';
import { createNoopSchedulerProvider } from './providers/noop.js';
import { SchedulerProviderRegistry } from './provider-registry.js';

export interface SchedulerModule {
  activeProviderId: string;
  providerRegistry: SchedulerProviderRegistry;
  persistence: SchedulerPersistence;
  getActiveProvider(): SchedulerProvider;
}

export interface CreateSchedulerModuleOptions {
  env?: NodeJS.ProcessEnv;
  moduleLoader?: (specifier: string) => Promise<unknown>;
  providers?: SchedulerProvider[];
  input?: Parameters<SchedulerProvider['createSchedulerPersistence']>[0];
}

function parseModuleSpecifiers(env: NodeJS.ProcessEnv): string[] {
  const raw = env.OFFICE_CLAW_SCHEDULER_PROVIDER_MODULES?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveConfiguredSchedulerProviderId(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OFFICE_CLAW_SCHEDULER_PROVIDER?.trim();
  if (explicit) return explicit;
  return 'noop';
}

export async function createSchedulerModule(options: CreateSchedulerModuleOptions = {}): Promise<SchedulerModule> {
  const env = options.env ?? process.env;
  const moduleLoader = options.moduleLoader ?? ((specifier: string) => import(specifier));
  const providerRegistry = new SchedulerProviderRegistry();

  providerRegistry.register(createNoopSchedulerProvider());
  for (const provider of options.providers ?? []) {
    providerRegistry.register(provider);
  }
  for (const moduleSpecifier of parseModuleSpecifiers(env)) {
    await providerRegistry.registerModule(moduleSpecifier, moduleLoader);
  }

  const activeProviderId = resolveConfiguredSchedulerProviderId(env);
  const activeProvider = providerRegistry.get(activeProviderId);
  await activeProvider.bootstrap?.();
  const persistence = await activeProvider.createSchedulerPersistence(options.input ?? {});

  return {
    activeProviderId,
    providerRegistry,
    persistence,
    getActiveProvider() {
      return activeProvider;
    },
  };
}
