/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CatalogProvider } from '@openjiuwen/relay-api-server-contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCatalogProvider(value: unknown): value is CatalogProvider {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.readCatalog === 'function' &&
    typeof value.writeCatalog === 'function'
  );
}

function collectModuleProviders(namespace: unknown): CatalogProvider[] {
  if (!isRecord(namespace)) return [];

  const providers: CatalogProvider[] = [];
  const seenObjects = new Set<CatalogProvider>();
  const seenIds = new Set<string>();
  const pushProvider = (candidate: unknown): void => {
    if (!isCatalogProvider(candidate)) return;
    if (seenObjects.has(candidate) || seenIds.has(candidate.id)) return;
    seenObjects.add(candidate);
    seenIds.add(candidate.id);
    providers.push(candidate);
  };

  for (const candidate of [namespace.default, namespace.catalogProvider]) {
    pushProvider(candidate);
  }

  if (Array.isArray(namespace.catalogProviders)) {
    for (const candidate of namespace.catalogProviders) {
      pushProvider(candidate);
    }
  }

  return providers;
}

export class CatalogProviderRegistry {
  private readonly providers = new Map<string, CatalogProvider>();
  private activeId: string | null = null;

  register(provider: CatalogProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Catalog provider '${provider.id}' already registered`);
    }
    this.providers.set(provider.id, provider);
    if (!this.activeId) this.activeId = provider.id;
  }

  setActive(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Catalog provider '${id}' not found. Registered: [${this.listIds().join(', ')}]`);
    }
    this.activeId = id;
  }

  get(id: string): CatalogProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Catalog provider '${id}' not found. Registered: [${this.listIds().join(', ')}]`);
    }
    return provider;
  }

  getActive(): CatalogProvider {
    if (!this.activeId) {
      throw new Error('No active catalog provider registered');
    }
    return this.get(this.activeId);
  }

  listIds(): string[] {
    return [...this.providers.keys()];
  }

  async registerModule(
    specifier: string,
    moduleLoader: (specifier: string) => Promise<unknown> = (value) => import(value),
  ): Promise<void> {
    const namespace = await moduleLoader(specifier);
    const providers = collectModuleProviders(namespace);
    if (providers.length === 0) {
      throw new Error(`Catalog provider module '${specifier}' exported no catalog providers`);
    }
    for (const provider of providers) {
      this.register(provider);
    }
  }
}
