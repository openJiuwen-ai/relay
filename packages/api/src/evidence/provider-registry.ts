/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { EvidenceProvider } from '@openjiuwen/relay-api-server-contracts/evidence';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEvidenceProvider(value: unknown): value is EvidenceProvider {
  return isRecord(value) && typeof value.id === 'string' && typeof value.createEvidenceServices === 'function';
}

function collectModuleProviders(namespace: unknown): EvidenceProvider[] {
  if (!isRecord(namespace)) return [];
  const providers: EvidenceProvider[] = [];

  const push = (provider: EvidenceProvider): void => {
    if (!providers.some((item) => item.id === provider.id)) providers.push(provider);
  };

  if (isEvidenceProvider(namespace.default)) push(namespace.default);
  if (isEvidenceProvider(namespace.evidenceProvider)) push(namespace.evidenceProvider);

  const candidates = namespace.evidenceProviders;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (isEvidenceProvider(candidate)) push(candidate);
    }
  }

  return providers;
}

export class EvidenceProviderRegistry {
  private readonly providers = new Map<string, EvidenceProvider>();

  register(provider: EvidenceProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Evidence provider '${provider.id}' already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): EvidenceProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Evidence provider '${id}' not found. Registered: [${this.listIds().join(', ')}]`);
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
      throw new Error(`Evidence provider module '${specifier}' exported no evidence providers`);
    }
    for (const provider of providers) {
      this.register(provider);
    }
  }
}
