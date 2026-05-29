/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AuthProvider } from '@openjiuwen/relay-api-server-contracts/auth';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Duck-type check — the TS equivalent of Java's instanceof for interfaces. */
function isAuthProvider(value: unknown): value is AuthProvider {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.displayName === 'string' &&
    isRecord(value.presentation) &&
    typeof value.authenticate === 'function'
  );
}

/** Collect providers from an ESM module's exports. */
function collectModuleProviders(namespace: unknown): AuthProvider[] {
  if (!isRecord(namespace)) return [];

  const providers: AuthProvider[] = [];
  const defaultExport = namespace.default;
  if (isAuthProvider(defaultExport)) providers.push(defaultExport);

  const namedProvider = namespace.authProvider;
  if (isAuthProvider(namedProvider)) providers.push(namedProvider);

  const namedProviders = namespace.authProviders;
  if (Array.isArray(namedProviders)) {
    for (const candidate of namedProviders) {
      if (isAuthProvider(candidate)) providers.push(candidate);
    }
  }

  return providers;
}

export class AuthProviderRegistry {
  private readonly providers = new Map<string, AuthProvider>();

  register(provider: AuthProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Auth provider '${provider.id}' already registered`);
    }
    this.providers.set(provider.id, provider);
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  get(id: string): AuthProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Auth provider '${id}' not found. Registered: [${this.listIds().join(', ')}]`);
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
      throw new Error(`Auth provider module '${specifier}' exported no auth providers`);
    }
    for (const provider of providers) {
      this.register(provider);
    }
  }
}
