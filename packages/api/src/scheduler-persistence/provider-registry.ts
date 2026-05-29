/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { SchedulerProvider } from '@openjiuwen/relay-api-server-contracts/scheduler';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSchedulerProvider(value: unknown): value is SchedulerProvider {
  return isRecord(value) && typeof value.id === 'string' && typeof value.createSchedulerPersistence === 'function';
}

function collectModuleProviders(namespace: unknown): SchedulerProvider[] {
  if (!isRecord(namespace)) return [];
  const providers: SchedulerProvider[] = [];

  const push = (provider: SchedulerProvider): void => {
    if (!providers.some((item) => item.id === provider.id)) providers.push(provider);
  };

  if (isSchedulerProvider(namespace.default)) push(namespace.default);
  if (isSchedulerProvider(namespace.schedulerProvider)) push(namespace.schedulerProvider);

  const candidates = namespace.schedulerProviders;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (isSchedulerProvider(candidate)) push(candidate);
    }
  }

  return providers;
}

export class SchedulerProviderRegistry {
  private readonly providers = new Map<string, SchedulerProvider>();

  register(provider: SchedulerProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Scheduler provider '${provider.id}' already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): SchedulerProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Scheduler provider '${id}' not found. Registered: [${this.listIds().join(', ')}]`);
    }
    return provider;
  }

  listIds(): string[] {
    return [...this.providers.keys()];
  }

  async registerModule(specifier: string, moduleLoader: (specifier: string) => Promise<unknown>): Promise<void> {
    const namespace = await moduleLoader(specifier);
    const providers = collectModuleProviders(namespace);
    if (providers.length === 0) {
      throw new Error(`Scheduler provider module '${specifier}' exported no scheduler providers`);
    }
    for (const provider of providers) {
      this.register(provider);
    }
  }
}
