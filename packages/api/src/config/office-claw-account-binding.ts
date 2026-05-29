/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveEmbeddedRuntimeKind, type OfficeClawConfigEntry } from '@openjiuwen/relay-shared';
import { loadAgentConfig, toAllAgentConfigs } from './office-claw-config-loader.js';
import { resolveProjectTemplatePath } from './project-template-path.js';
import { resolveBuiltinClientForProvider } from './provider-binding-compat.js';
import { builtinAccountIdForClient } from './provider-profiles.js';

type LegacyAwareAgentConfig = OfficeClawConfigEntry & { providerProfileId?: string };

function trimBinding(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isSeedCat(projectRoot: string, agentId: string): boolean {
  try {
    const seedCats = toAllAgentConfigs(loadAgentConfig(resolveProjectTemplatePath(projectRoot)));
    return Object.hasOwn(seedCats, agentId);
  } catch {
    return false;
  }
}

export function resolveBoundAccountRefForCat(
  projectRoot: string,
  agentId: string,
  agentConfig: LegacyAwareAgentConfig | null | undefined,
): string | undefined {
  if (!agentConfig) return undefined;

  const source = isSeedCat(projectRoot, agentId) ? 'seed' : 'runtime';
  if (resolveEmbeddedRuntimeKind({ id: agentId, provider: agentConfig.provider, source }) === 'agentteams_acp') {
    return trimBinding(agentConfig.accountRef);
  }

  const explicitProviderProfileId = trimBinding(agentConfig.providerProfileId);
  if (explicitProviderProfileId) return explicitProviderProfileId;

  const explicitAccountRef = trimBinding(agentConfig.accountRef);
  if (!explicitAccountRef) return undefined;

  const builtinClient = resolveBuiltinClientForProvider(agentConfig.provider);
  const runtimeCatalogExists = existsSync(resolve(projectRoot, '.office-claw', 'office-claw-catalog.json'));
  const builtinDefaultAccountRef = builtinClient ? builtinAccountIdForClient(builtinClient) : null;
  const inheritedTemplateDefaultBinding =
    !runtimeCatalogExists && !!builtinDefaultAccountRef && explicitAccountRef === builtinDefaultAccountRef;
  const inheritedSeedBootstrapBinding =
    runtimeCatalogExists && isSeedCat(projectRoot, agentId) && !!builtinDefaultAccountRef && explicitAccountRef === builtinDefaultAccountRef;

  if (inheritedTemplateDefaultBinding || inheritedSeedBootstrapBinding) {
    return undefined;
  }

  return explicitAccountRef;
}
