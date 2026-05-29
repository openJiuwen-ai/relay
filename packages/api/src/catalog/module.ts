/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CatalogProvider } from '@openjiuwen/relay-api-server-contracts';
import { CatalogProviderRegistry } from '../config/catalog-provider-registry.js';
import { FileCatalogProvider } from '../config/catalog-file-provider.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';

export interface CatalogModule {
  activeProviderId: string;
  providerRegistry: CatalogProviderRegistry;
  getActiveProvider(): CatalogProvider;
}

export interface CreateCatalogModuleOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  moduleLoader?: (specifier: string) => Promise<unknown>;
  providers?: CatalogProvider[];
}

function parseModuleSpecifiers(env: NodeJS.ProcessEnv): string[] {
  const raw = env.OFFICE_CLAW_CATALOG_PROVIDER_MODULES?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveActiveProviderId(env: NodeJS.ProcessEnv): string {
  const explicit = env.OFFICE_CLAW_CATALOG_PROVIDER?.trim();
  if (explicit) return explicit;
  return 'file';
}

export async function createCatalogModule(options: CreateCatalogModuleOptions = {}): Promise<CatalogModule> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const moduleLoader = options.moduleLoader ?? ((specifier: string) => import(specifier));
  const providerRegistry = new CatalogProviderRegistry();

  // Register built-in file provider
  const projectRoot = resolveActiveProjectRoot(cwd);
  providerRegistry.register(new FileCatalogProvider(projectRoot));

  // Register explicitly passed providers
  for (const provider of options.providers ?? []) {
    providerRegistry.register(provider);
  }

  // Load external provider modules from env
  for (const moduleSpecifier of parseModuleSpecifiers(env)) {
    await providerRegistry.registerModule(moduleSpecifier, moduleLoader);
  }

  const activeProviderId = resolveActiveProviderId(env);
  providerRegistry.setActive(activeProviderId);
  const activeProvider = providerRegistry.getActive();

  await activeProvider.bootstrap?.();

  return {
    activeProviderId,
    providerRegistry,
    getActiveProvider() {
      return activeProvider;
    },
  };
}