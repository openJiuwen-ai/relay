/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AuthProvider } from '@openjiuwen/relay-api-server-contracts/auth';
import { AuthProviderRegistry } from './provider-registry.js';
import { createNoAuthProvider } from './providers/no-auth.js';

export interface AuthModule {
  activeProviderId: string;
  providerRegistry: AuthProviderRegistry;
  getActiveProvider(): AuthProvider;
}

export interface CreateAuthModuleOptions {
  env?: NodeJS.ProcessEnv;
  moduleLoader?: (specifier: string) => Promise<unknown>;
  providers?: AuthProvider[];
  fetchImpl?: typeof fetch;
}

function parseModuleSpecifiers(env: NodeJS.ProcessEnv): string[] {
  const raw = env.OFFICE_CLAW_AUTH_PROVIDER_MODULES?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveConfiguredAuthProviderId(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OFFICE_CLAW_AUTH_PROVIDER?.trim();
  if (explicit) return explicit;
  return 'no-auth';
}

export async function createAuthModule(options: CreateAuthModuleOptions = {}): Promise<AuthModule> {
  const env = options.env ?? process.env;
  const moduleLoader = options.moduleLoader ?? ((specifier: string) => import(specifier));
  const providerRegistry = new AuthProviderRegistry();

  // Register built-in providers
  providerRegistry.register(createNoAuthProvider(env));

  // Register explicitly passed providers (used by tests)
  for (const provider of options.providers ?? []) {
    providerRegistry.register(provider);
  }

  // Load external provider modules from env
  for (const moduleSpecifier of parseModuleSpecifiers(env)) {
    await providerRegistry.registerModule(moduleSpecifier, moduleLoader);
  }

  const activeProviderId = resolveConfiguredAuthProviderId(env);
  const activeProvider = providerRegistry.get(activeProviderId);

  // Call bootstrap if the provider defines it
  await activeProvider.bootstrap?.();

  return {
    activeProviderId,
    providerRegistry,
    getActiveProvider() {
      return activeProvider;
    },
  };
}
