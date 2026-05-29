/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { EvidenceProvider, EvidenceServices } from '@openjiuwen/relay-api-server-contracts/evidence';
import { createNoopEvidenceProvider } from './providers/noop.js';
import { EvidenceProviderRegistry } from './provider-registry.js';

export interface EvidenceModule {
  activeProviderId: string;
  providerRegistry: EvidenceProviderRegistry;
  services: EvidenceServices;
  getActiveProvider(): EvidenceProvider;
}

export interface CreateEvidenceModuleOptions {
  env?: NodeJS.ProcessEnv;
  moduleLoader?: (specifier: string) => Promise<unknown>;
  providers?: EvidenceProvider[];
  input?: Parameters<EvidenceProvider['createEvidenceServices']>[0];
}

function parseModuleSpecifiers(env: NodeJS.ProcessEnv): string[] {
  const raw = env.OFFICE_CLAW_EVIDENCE_PROVIDER_MODULES?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function resolveConfiguredEvidenceProviderId(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.OFFICE_CLAW_EVIDENCE_PROVIDER?.trim();
  if (explicit) return explicit;
  return 'noop';
}

export async function createEvidenceModule(options: CreateEvidenceModuleOptions = {}): Promise<EvidenceModule> {
  const env = options.env ?? process.env;
  const moduleLoader = options.moduleLoader ?? ((specifier: string) => import(specifier));
  const providerRegistry = new EvidenceProviderRegistry();

  providerRegistry.register(createNoopEvidenceProvider());
  for (const provider of options.providers ?? []) {
    providerRegistry.register(provider);
  }
  for (const moduleSpecifier of parseModuleSpecifiers(env)) {
    await providerRegistry.registerModule(moduleSpecifier, moduleLoader);
  }

  const activeProviderId = resolveConfiguredEvidenceProviderId(env);
  const activeProvider = providerRegistry.get(activeProviderId);
  await activeProvider.bootstrap?.();
  const services = await activeProvider.createEvidenceServices(options.input ?? {});

  return {
    activeProviderId,
    providerRegistry,
    services,
    getActiveProvider() {
      return activeProvider;
    },
  };
}
