/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AgentBreed,
  AgentCreationSource,
  OfficeClawConfig,
  AgentColor,
  EmbeddedAcpConfig,
  AgentProvider,
  AgentVariant,
  CliConfig,
  CoCreatorConfig,
  ContextBudget,
} from '@openjiuwen/relay-shared';
import { OFFICE_CLAW_CONFIGS, createAgentId } from '@openjiuwen/relay-shared';
import { clearBudgetCache } from './office-claw-budgets.js';
import { bootstrapAgentCatalog, readAgentCatalog, resolveAgentCatalogPath } from './office-claw-catalog-store.js';
import { _resetCachedConfig, loadAgentConfig, toAllAgentConfigs } from './office-claw-config-loader.js';
import { clearVoiceCache } from './office-claw-voices.js';
import { resolveProjectTemplatePath } from './project-template-path.js';

export interface RuntimeAgentInput {
  agentId: string;
  breedId?: string;
  name: string;
  displayName: string;
  nickname?: string;
  avatar: string;
  color: AgentColor;
  mentionPatterns: string[];
  accountRef?: string;
  roleDescription: string;
  personality?: string;
  teamStrengths?: string;
  caution?: string | null;
  strengths?: string[];
  sessionChain?: boolean;
  provider: AgentProvider;
  defaultModel: string;
  mcpSupport: boolean;
  cli: CliConfig;
  commandArgs?: string[];
  cliConfigArgs?: string[];
  contextBudget?: ContextBudget;
  ocProviderName?: string;
  embeddedAcpExecutablePath?: string;
  embeddedAcpConfig?: EmbeddedAcpConfig;
  /** Optional creation provenance for runtime-created agents. */
  creationSource?: AgentCreationSource;
  extend?: Record<string, unknown>;
  skills?: readonly string[];
}

export interface RuntimeAgentUpdate {
  name?: string;
  displayName?: string;
  nickname?: string;
  avatar?: string;
  color?: AgentColor;
  mentionPatterns?: string[];
  accountRef?: string | null;
  roleDescription?: string;
  personality?: string;
  teamStrengths?: string;
  caution?: string | null;
  strengths?: string[];
  sessionChain?: boolean;
  provider?: AgentProvider;
  defaultModel?: string;
  mcpSupport?: boolean;
  cli?: CliConfig;
  commandArgs?: string[];
  cliConfigArgs?: string[];
  contextBudget?: ContextBudget | null;
  ocProviderName?: string | null;
  embeddedAcpExecutablePath?: string | null;
  embeddedAcpConfig?: EmbeddedAcpConfig | null;
  extend?: Record<string, unknown> | null;
  available?: boolean;
  skills?: readonly string[] | null;
}

export interface RuntimeCoCreatorUpdate {
  name?: string;
  aliases?: string[];
  mentionPatterns?: string[];
  avatar?: string | null;
  color?: AgentColor | null;
}

interface BreedVariantLocation {
  breedIndex: number;
  variantIndex: number;
  breed: AgentBreed;
  variant: AgentVariant;
  resolvedAgentId: string;
  isDefaultVariant: boolean;
}

function normalizeMentionPatterns(_agentId: string, mentionPatterns: readonly string[]): string[] {
  const values = mentionPatterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0)
    .map((pattern) => (pattern.startsWith('@') ? pattern : `@${pattern}`));
  return Array.from(new Set(values));
}

function normalizeCoCreatorMentionPatterns(mentionPatterns: readonly string[]): string[] {
  const values = mentionPatterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0)
    .map((pattern) => (pattern.startsWith('@') ? pattern : `@${pattern}`));
  return Array.from(new Set(values));
}

function resolveEmbeddedAcpExecutablePath(
  executablePath?: string | null,
  embeddedAcpConfig?: EmbeddedAcpConfig | null,
): string | undefined {
  const direct = executablePath?.trim();
  if (direct) return direct;
  const fromConfig = embeddedAcpConfig?.executablePath?.trim();
  return fromConfig || undefined;
}

function readOrBootstrapCatalog(projectRoot: string): OfficeClawConfig {
  const templatePath = resolveProjectTemplatePath(projectRoot);
  bootstrapAgentCatalog(projectRoot, templatePath);
  const catalog = readAgentCatalog(projectRoot);
  if (!catalog) {
    throw new Error(`Runtime agent catalog missing at ${projectRoot}`);
  }
  return catalog;
}

function isSeedCat(projectRoot: string, agentId: string): boolean {
  try {
    const templatePath = resolveProjectTemplatePath(projectRoot);
    const seedCats = toAllAgentConfigs(loadAgentConfig(templatePath));
    return Object.hasOwn(seedCats, agentId);
  } catch {
    return Object.hasOwn(OFFICE_CLAW_CONFIGS, agentId);
  }
}

function invalidateRuntimeCatalogCaches(): void {
  _resetCachedConfig();
  clearBudgetCache();
  clearVoiceCache();
}

function validatePersistedCatalog(projectRoot: string): OfficeClawConfig {
  invalidateRuntimeCatalogCaches();
  return loadAgentConfig(join(projectRoot, '.office-claw', 'office-claw-catalog.json'));
}

function assertUniqueMentionAliases(catalog: OfficeClawConfig): void {
  const aliasHolders = new Map<string, string>();
  for (const [agentId, config] of Object.entries(toAllAgentConfigs(catalog))) {
    for (const mentionPattern of config.mentionPatterns) {
      const trimmed = mentionPattern.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const holder = aliasHolders.get(key);
      if (holder && holder !== agentId) {
        throw new Error(`mention alias "${trimmed}" is already used by agent "${holder}"`);
      }
      aliasHolders.set(key, agentId);
    }
  }

  const coCreatorMentionPatterns = catalog.version === 2 ? (catalog.coCreator?.mentionPatterns ?? []) : [];
  for (const mentionPattern of coCreatorMentionPatterns) {
    const trimmed = mentionPattern.trim();
    if (!trimmed) continue;
    const holder = aliasHolders.get(trimmed.toLowerCase());
    if (holder) {
      throw new Error(`co-creator mention alias "${trimmed}" conflicts with agent "${holder}"`);
    }
  }
}

export function writeAndValidateCatalog(projectRoot: string, catalog: unknown): OfficeClawConfig {
  const candidate = catalog as OfficeClawConfig;
  assertUniqueMentionAliases(candidate);
  const catalogPath = resolveAgentCatalogPath(projectRoot);
  const tempPath = `${catalogPath}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(tempPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf-8');
  try {
    loadAgentConfig(tempPath);
    renameSync(tempPath, catalogPath);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
  return validatePersistedCatalog(projectRoot);
}

function findBreedVariant(catalog: OfficeClawConfig, agentId: string): BreedVariantLocation | null {
  for (const [breedIndex, breed] of catalog.breeds.entries()) {
    for (const [variantIndex, variant] of breed.variants.entries()) {
      const resolvedAgentId = variant.agentId ?? breed.agentId;
      if (resolvedAgentId !== agentId) continue;
      return {
        breedIndex,
        variantIndex,
        breed,
        variant,
        resolvedAgentId,
        isDefaultVariant: variant.id === breed.defaultVariantId,
      };
    }
  }
  return null;
}

function createBreedFromInput(input: RuntimeAgentInput): AgentBreed {
  const variantId = `${input.agentId}-default`;
  const embeddedAcpExecutablePath = resolveEmbeddedAcpExecutablePath(
    input.embeddedAcpExecutablePath,
    input.embeddedAcpConfig,
  );
  return {
    id: input.breedId?.trim() || input.agentId,
    agentId: createAgentId(input.agentId),
    name: input.name,
    displayName: input.displayName,
    ...(input.nickname != null && input.nickname.trim().length > 0 ? { nickname: input.nickname.trim() } : {}),
    avatar: input.avatar,
    color: input.color,
    mentionPatterns: normalizeMentionPatterns(input.agentId, input.mentionPatterns),
    roleDescription: input.roleDescription,
    defaultVariantId: variantId,
    ...(input.sessionChain !== undefined ? { features: { sessionChain: input.sessionChain } } : {}),
    ...(input.creationSource ? { creationSource: input.creationSource } : {}),
    variants: [
      {
        id: variantId,
        provider: input.provider,
        defaultModel: input.defaultModel,
        mcpSupport: input.mcpSupport,
        cli: input.cli,
        ...(input.accountRef != null && input.accountRef.trim().length > 0
          ? { accountRef: input.accountRef.trim(), providerProfileId: input.accountRef.trim() }
          : {}),
        ...(input.commandArgs && input.commandArgs.length > 0 ? { commandArgs: input.commandArgs } : {}),
        ...(input.cliConfigArgs && input.cliConfigArgs.length > 0 ? { cliConfigArgs: input.cliConfigArgs } : {}),
        ...(input.contextBudget ? { contextBudget: input.contextBudget } : {}),
        ...(input.ocProviderName ? { ocProviderName: input.ocProviderName } : {}),
        ...(embeddedAcpExecutablePath ? { embeddedAcpExecutablePath } : {}),
        ...(input.embeddedAcpConfig ? { embeddedAcpConfig: input.embeddedAcpConfig } : {}),
        ...(input.extend ? { extend: input.extend } : {}),
        ...(input.personality != null && input.personality.trim().length > 0 ? { personality: input.personality } : {}),
        ...(input.skills ? { skills: input.skills } : {}),
        ...(input.teamStrengths != null && input.teamStrengths.trim().length > 0
          ? { teamStrengths: input.teamStrengths.trim() }
          : {}),
        ...(input.caution !== undefined
          ? { caution: input.caution && input.caution.trim().length > 0 ? input.caution.trim() : null }
          : {}),
        ...(input.strengths ? { strengths: input.strengths } : {}),
      },
    ],
  } as unknown as AgentBreed;
}

function cloneCatalog(catalog: OfficeClawConfig): Record<string, any> {
  return structuredClone(catalog) as Record<string, any>;
}

function buildDefaultRuntimeRosterEntry(
  agentId: string,
  family: string,
  displayName: string,
  available: boolean,
): { family: string; roles: string[]; lead: false; available: boolean; evaluation: string } {
  return {
    family,
    roles: ['assistant'],
    lead: false,
    available,
    evaluation: `${displayName} runtime member`,
  };
}

export function readRuntimeAgentCatalog(projectRoot: string): OfficeClawConfig {
  return readOrBootstrapCatalog(projectRoot);
}

export function createRuntimeCatInCatalog(catalog: OfficeClawConfig, input: RuntimeAgentInput): OfficeClawConfig {
  const nextCatalog = cloneCatalog(catalog);
  if (findBreedVariant(nextCatalog as unknown as OfficeClawConfig, input.agentId)) {
    throw new Error(`Cat "${input.agentId}" already exists in runtime catalog`);
  }
  const nextBreed = createBreedFromInput(input) as unknown as Record<string, any>;
  nextCatalog.breeds = [...nextCatalog.breeds, nextBreed];
  if (nextCatalog.version === 2) {
    nextCatalog.roster = {
      ...nextCatalog.roster,
      [input.agentId]: buildDefaultRuntimeRosterEntry(
        input.agentId,
        String(nextBreed.id ?? input.agentId),
        String(nextBreed.displayName ?? nextBreed.name ?? input.agentId),
        true,
      ),
    };
  }
  return nextCatalog as OfficeClawConfig;
}

export function createRuntimeCat(projectRoot: string, input: RuntimeAgentInput): OfficeClawConfig {
  const nextCatalog = createRuntimeCatInCatalog(readOrBootstrapCatalog(projectRoot), input);
  return writeAndValidateCatalog(projectRoot, nextCatalog);
}

export function updateRuntimeCatInCatalog(
  catalog: OfficeClawConfig,
  agentId: string,
  patch: RuntimeAgentUpdate,
): OfficeClawConfig {
  const nextCatalog = cloneCatalog(catalog);
  const located = findBreedVariant(nextCatalog as unknown as OfficeClawConfig, agentId);
  if (!located) {
    throw new Error(`Cat "${agentId}" not found in runtime catalog`);
  }

  const breed = nextCatalog.breeds[located.breedIndex] as Record<string, any>;
  const variant = breed.variants[located.variantIndex] as Record<string, any>;

  if (patch.name !== undefined) breed.name = patch.name;
  if (patch.nickname !== undefined) {
    if (patch.nickname && patch.nickname.trim().length > 0) {
      breed.nickname = patch.nickname.trim();
    } else {
      delete breed.nickname;
    }
  }
  if (patch.roleDescription !== undefined) {
    if (located.isDefaultVariant) {
      variant.roleDescription = patch.roleDescription;
    } else {
      variant.roleDescription = patch.roleDescription;
    }
  }

  if (patch.displayName !== undefined) {
    // Capture old displayName before mutation so we can update mentionPatterns
    const oldDisplayName = located.isDefaultVariant
      ? breed.displayName
      : (variant.displayName ?? breed.displayName);

    if (located.isDefaultVariant) {
      breed.displayName = patch.displayName;
      delete variant.displayName;
    } else {
      variant.displayName = patch.displayName;
    }

    // Auto-sync mentionPatterns when displayName changes (unless caller
    // is also explicitly setting mentionPatterns in the same patch).
    if (patch.mentionPatterns === undefined && oldDisplayName !== patch.displayName) {
      let patterns: string[];
      if (located.isDefaultVariant) {
        patterns = breed.mentionPatterns;
      } else {
        // Non-default variant with same displayName as breed → skip sync
        // because the breed-level patterns already cover this displayName.
        // The runtime fallback in toAllAgentConfigs() will handle it.
        if (patch.displayName === breed.displayName) {
          // no-op: breed already owns this displayName pattern
        } else {
          // Materialize variant-level patterns to avoid mutating breed's array.
          // Fallback mirrors toAllAgentConfigs() logic.
          if (!variant.mentionPatterns || variant.mentionPatterns.length === 0) {
            variant.mentionPatterns = [`@${agentId}`];
          }
          patterns = variant.mentionPatterns;
        }
      }
      if (patterns!) {
        const oldPattern = `@${oldDisplayName}`.toLowerCase();
        const newPattern = `@${patch.displayName}`;
        const idx = patterns.findIndex((p: string) => p.toLowerCase() === oldPattern);
        if (idx >= 0) {
          patterns[idx] = newPattern;
        } else if (!patterns.some((p: string) => p.toLowerCase() === newPattern.toLowerCase())) {
          patterns.push(newPattern);
        }
      }
    }
  }

  if (patch.avatar !== undefined) {
    if (located.isDefaultVariant) {
      breed.avatar = patch.avatar;
      delete variant.avatar;
    } else {
      variant.avatar = patch.avatar;
    }
  }

  if (patch.color !== undefined) {
    if (located.isDefaultVariant) {
      breed.color = patch.color;
      delete variant.color;
    } else {
      variant.color = patch.color;
    }
  }

  if (patch.mentionPatterns !== undefined) {
    const normalized = normalizeMentionPatterns(agentId, patch.mentionPatterns);
    if (located.isDefaultVariant) {
      breed.mentionPatterns = normalized;
      delete variant.mentionPatterns;
    } else {
      variant.mentionPatterns = normalized;
    }
  }

  if (patch.accountRef !== undefined) {
    if (patch.accountRef && patch.accountRef.trim().length > 0) {
      const normalizedAccountRef = patch.accountRef.trim();
      variant.accountRef = normalizedAccountRef;
      variant.providerProfileId = normalizedAccountRef;
    } else {
      delete variant.accountRef;
      delete variant.providerProfileId;
    }
  }
  if (patch.personality !== undefined) {
    if (patch.personality && patch.personality.trim().length > 0) {
      variant.personality = patch.personality;
    } else {
      delete variant.personality;
    }
  }
  if (patch.teamStrengths !== undefined) {
    if (patch.teamStrengths && patch.teamStrengths.trim().length > 0) {
      variant.teamStrengths = patch.teamStrengths.trim();
    } else {
      delete variant.teamStrengths;
    }
  }
  if (patch.caution !== undefined) {
    variant.caution = patch.caution && patch.caution.trim().length > 0 ? patch.caution.trim() : null;
  }
  if (patch.strengths !== undefined) {
    if (patch.strengths.length > 0) {
      variant.strengths = patch.strengths;
    } else {
      delete variant.strengths;
    }
  }
  if (patch.sessionChain !== undefined) {
    if (located.isDefaultVariant) {
      variant.sessionChain = patch.sessionChain;
    } else {
      variant.sessionChain = patch.sessionChain;
    }
  }
  if (patch.provider !== undefined) variant.provider = patch.provider;
  if (patch.defaultModel !== undefined) variant.defaultModel = patch.defaultModel;
  if (patch.mcpSupport !== undefined) variant.mcpSupport = patch.mcpSupport;
  if (patch.cli !== undefined) variant.cli = patch.cli;
  if (patch.contextBudget !== undefined) {
    if (patch.contextBudget) {
      variant.contextBudget = patch.contextBudget;
    } else {
      delete variant.contextBudget;
    }
  }
  if (patch.commandArgs !== undefined) {
    if (patch.commandArgs.length > 0) {
      variant.commandArgs = patch.commandArgs;
    } else {
      delete variant.commandArgs;
    }
  }
  if (patch.cliConfigArgs !== undefined) {
    if (patch.cliConfigArgs.length > 0) {
      variant.cliConfigArgs = patch.cliConfigArgs;
    } else {
      delete variant.cliConfigArgs;
    }
  }
  if (patch.ocProviderName !== undefined) {
    if (patch.ocProviderName) {
      variant.ocProviderName = patch.ocProviderName;
    } else {
      delete variant.ocProviderName;
    }
  }
  if (patch.embeddedAcpExecutablePath !== undefined) {
    const nextExecutablePath = resolveEmbeddedAcpExecutablePath(patch.embeddedAcpExecutablePath, patch.embeddedAcpConfig);
    if (nextExecutablePath) {
      variant.embeddedAcpExecutablePath = nextExecutablePath;
    } else {
      delete variant.embeddedAcpExecutablePath;
    }
  }
  if (patch.embeddedAcpConfig !== undefined) {
    if (patch.embeddedAcpConfig) {
      variant.embeddedAcpConfig = patch.embeddedAcpConfig;
      const nextExecutablePath = resolveEmbeddedAcpExecutablePath(patch.embeddedAcpExecutablePath, patch.embeddedAcpConfig);
      if (nextExecutablePath) variant.embeddedAcpExecutablePath = nextExecutablePath;
      else if (patch.embeddedAcpExecutablePath === null) delete variant.embeddedAcpExecutablePath;
    } else {
      delete variant.embeddedAcpConfig;
      if (patch.embeddedAcpExecutablePath === null) delete variant.embeddedAcpExecutablePath;
    }
  }
  if (patch.extend !== undefined) {
    if (patch.extend && Object.keys(patch.extend).length > 0) {
      variant.extend = patch.extend;
    } else {
      delete variant.extend;
    }
  }
  if (patch.skills !== undefined) {
    if (patch.skills && patch.skills.length > 0) {
      variant.skills = patch.skills;
    } else {
      delete variant.skills;
    }
  }
  if (patch.available !== undefined && nextCatalog.version === 2) {
    const existingEntry = nextCatalog.roster[agentId];
    nextCatalog.roster = {
      ...nextCatalog.roster,
      [agentId]: existingEntry
        ? { ...existingEntry, available: patch.available }
        : buildDefaultRuntimeRosterEntry(
            agentId,
            String(breed.id ?? agentId),
            String(breed.displayName ?? breed.name ?? agentId),
            patch.available,
          ),
    };
  }

  return nextCatalog as OfficeClawConfig;
}

export function updateRuntimeCat(projectRoot: string, agentId: string, patch: RuntimeAgentUpdate): OfficeClawConfig {
  const nextCatalog = updateRuntimeCatInCatalog(readOrBootstrapCatalog(projectRoot), agentId, patch);
  return writeAndValidateCatalog(projectRoot, nextCatalog);
}

export function updateRuntimeCoCreator(projectRoot: string, patch: RuntimeCoCreatorUpdate): OfficeClawConfig {
  const catalog = cloneCatalog(readOrBootstrapCatalog(projectRoot));
  if (catalog.version !== 2) {
    throw new Error('Owner config requires a version 2 runtime catalog');
  }

  const currentOwner = (catalog.coCreator ?? {
    name: '用户',
    aliases: [],
    mentionPatterns: ['@co-creator', '@用户'],
  }) as CoCreatorConfig;

  const nextOwner: Record<string, unknown> = {
    ...currentOwner,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.aliases !== undefined
      ? {
          aliases: Array.from(new Set(patch.aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0))),
        }
      : {}),
    ...(patch.mentionPatterns !== undefined
      ? {
          mentionPatterns: normalizeCoCreatorMentionPatterns(patch.mentionPatterns),
        }
      : {}),
  };

  if (patch.avatar !== undefined) {
    if (patch.avatar && patch.avatar.trim().length > 0) {
      nextOwner.avatar = patch.avatar.trim();
    } else {
      delete nextOwner.avatar;
    }
  }

  if (patch.color !== undefined) {
    if (patch.color) {
      nextOwner.color = patch.color;
    } else {
      delete nextOwner.color;
    }
  }

  const normalizedOwner: CoCreatorConfig = {
    name: String(nextOwner.name ?? currentOwner.name),
    aliases: Array.isArray(nextOwner.aliases) ? (nextOwner.aliases as string[]) : [...currentOwner.aliases],
    mentionPatterns: Array.isArray(nextOwner.mentionPatterns)
      ? (nextOwner.mentionPatterns as string[])
      : [...currentOwner.mentionPatterns],
    ...(typeof nextOwner.avatar === 'string' ? { avatar: nextOwner.avatar } : {}),
    ...(nextOwner.color ? { color: nextOwner.color as AgentColor } : {}),
  };

  catalog.coCreator = normalizedOwner;
  return writeAndValidateCatalog(projectRoot, catalog);
}

export function deleteRuntimeCatInCatalog(catalog: OfficeClawConfig, agentId: string): OfficeClawConfig {
  const nextCatalog = cloneCatalog(catalog);
  const located = findBreedVariant(nextCatalog as unknown as OfficeClawConfig, agentId);
  if (!located) {
    throw new Error(`Cat "${agentId}" not found in runtime catalog`);
  }

  const breed = nextCatalog.breeds[located.breedIndex] as Record<string, any>;
  if (breed.variants.length === 1) {
    nextCatalog.breeds = nextCatalog.breeds.filter((_: unknown, index: number) => index !== located.breedIndex);
  } else {
    breed.variants = breed.variants.filter((_: unknown, index: number) => index !== located.variantIndex);
    if (located.isDefaultVariant) {
      breed.defaultVariantId = breed.variants[0]?.id ?? breed.defaultVariantId;
    }
  }

  if (nextCatalog.version === 2 && agentId in nextCatalog.roster) {
    const nextRoster = { ...nextCatalog.roster };
    delete nextRoster[agentId];
    nextCatalog.roster = nextRoster;
  }

  return nextCatalog as OfficeClawConfig;
}

export function deleteRuntimeCat(projectRoot: string, agentId: string): OfficeClawConfig {
  if (isSeedCat(projectRoot, agentId)) {
    throw new Error(`Cannot delete seed agent "${agentId}" from runtime catalog`);
  }
  const nextCatalog = deleteRuntimeCatInCatalog(readOrBootstrapCatalog(projectRoot), agentId);
  return writeAndValidateCatalog(projectRoot, nextCatalog);
}

export function refreshRuntimeAgentCatalogCaches(): void {
  invalidateRuntimeCatalogCaches();
}
