/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { OfficeClawStorageProvider } from '@openjiuwen/relay-api-server-contracts/storage';
import { isPartialStorageProvider, wrapPartialProvider } from './providers/partial-storage-provider.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStorageProvider(value: unknown): value is OfficeClawStorageProvider {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.createMessageStore === 'function' &&
    typeof value.createThreadStore === 'function' &&
    typeof value.createTaskStore === 'function' &&
    typeof value.createBacklogStore === 'function' &&
    typeof value.createMemoryStore === 'function' &&
    typeof value.createDraftStore === 'function' &&
    typeof value.createSessionChainStore === 'function' &&
    typeof value.createInvocationRecordStore === 'function' &&
    typeof value.createPendingRequestStore === 'function' &&
    typeof value.createAuthorizationRuleStore === 'function' &&
    typeof value.createAuthorizationAuditStore === 'function' &&
    typeof value.createPushSubscriptionStore === 'function' &&
    typeof value.createReadStateStore === 'function' &&
    typeof value.createWorkflowSopStore === 'function'
  );
}

function collectCandidate(value: unknown): 'full' | 'partial' | 'skip' {
  if (isStorageProvider(value)) return 'full';
  if (isPartialStorageProvider(value)) return 'partial';
  return 'skip';
}

interface CollectedProviders {
  full: OfficeClawStorageProvider[];
  partial: (Record<string, unknown> & { id: string })[];
}

function collectModuleProviders(namespace: unknown): CollectedProviders {
  const result: CollectedProviders = { full: [], partial: [] };
  if (!isRecord(namespace)) return result;

  for (const candidate of [namespace.default, namespace.storageProvider]) {
    const kind = collectCandidate(candidate);
    if (kind === 'full') result.full.push(candidate as OfficeClawStorageProvider);
    else if (kind === 'partial') result.partial.push(candidate as Record<string, unknown> & { id: string });
  }

  const namedArray = namespace.storageProviders;
  if (Array.isArray(namedArray)) {
    for (const candidate of namedArray) {
      const kind = collectCandidate(candidate);
      if (kind === 'full') result.full.push(candidate as OfficeClawStorageProvider);
      else if (kind === 'partial') result.partial.push(candidate as Record<string, unknown> & { id: string });
    }
  }

  return result;
}

export class StorageProviderRegistry {
  private readonly providers = new Map<string, OfficeClawStorageProvider>();

  register(provider: OfficeClawStorageProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Storage provider '${provider.id}' already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  get(id: string): OfficeClawStorageProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Storage provider '${id}' not found. Registered: [${this.listIds().join(', ')}]`);
    }
    return provider;
  }

  listIds(): string[] {
    return [...this.providers.keys()];
  }

  async registerModule(
    specifier: string,
    moduleLoader: (specifier: string) => Promise<unknown>,
    defaults?: OfficeClawStorageProvider,
  ): Promise<void> {
    const namespace = await moduleLoader(specifier);
    const { full, partial } = collectModuleProviders(namespace);

    for (const provider of full) {
      this.register(provider);
    }

    for (const raw of partial) {
      if (!defaults) {
        throw new Error(
          `Storage provider module '${specifier}' exported partial provider '${raw.id}' ` +
            'but no default provider is available to fill missing stores',
        );
      }
      this.register(wrapPartialProvider(raw, defaults));
    }

    if (full.length === 0 && partial.length === 0) {
      throw new Error(`Storage provider module '${specifier}' exported no storage providers`);
    }
  }
}
