/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import type { OfficeClawConfig, Roster } from '@openjiuwen/relay-shared';
import { migrateAgentIdFields } from '../compat/agentid-field-migration.js';
import { createModuleLogger } from '../infrastructure/logger.js';
import { resolveProjectTemplatePath } from './project-template-path.js';
import { builtinAccountIdForClient, readBootstrapBindingsSync } from './provider-profiles.js';
import type { BootstrapBinding, BuiltinAccountClient } from './provider-profiles.types.js';
import { resolveProviderProfilesRootSync } from './provider-profiles-root.js';

const OFFICE_CLAW_DIR = '.office-claw';
const META_FILENAME = 'provider-profiles.json';
const CAT_CATALOG_FILENAME = 'office-claw-catalog.json';
const log = createModuleLogger('office-claw-catalog-store');

function safePath(projectRoot: string, ...segments: string[]): string {
  const root = resolve(projectRoot);
  const normalized = resolve(root, ...segments);
  const rel = relative(root, normalized);
  if (rel.startsWith(`..${sep}`) || rel === '..') {
    throw new Error(`Path escapes project root: ${normalized}`);
  }
  return normalized;
}

function writeFileAtomic(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failures.
    }
    throw error;
  }
}

function providerToBootstrapClient(provider: unknown): BuiltinAccountClient | null {
  switch (provider) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
    case 'relayclaw':
      return 'openai';
    case 'google':
      return 'google';
    case 'dare':
      return 'dare';
    case 'opencode':
      return 'opencode';
    default:
      return null;
  }
}

function trimBinding(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveExplicitVariantAccountRef(variant: Record<string, unknown>): string | null {
  return trimBinding(variant.providerProfileId) ?? trimBinding(variant.accountRef);
}

function readProfileModelsSync(projectRoot: string, accountRef: string): string[] | null {
  try {
    const storageRoot = resolveProviderProfilesRootSync(projectRoot);
    const metaPath = resolve(storageRoot, OFFICE_CLAW_DIR, META_FILENAME);
    if (!existsSync(metaPath)) return null;
    const raw = JSON.parse(readFileSync(metaPath, 'utf-8'));
    const providers = raw?.providers ?? raw?.profiles ?? [];
    const profile = (providers as Array<{ id?: string; models?: string[] }>).find((p) => p.id === accountRef);
    return profile?.models ?? null;
  } catch {
    return null;
  }
}

function cloneWithAccountRef(
  variant: Record<string, unknown>,
  accountRef: string,
  options?: { explicit?: boolean; profileModels?: string[] | null },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...variant, accountRef };
  if (options?.explicit) {
    next.providerProfileId = accountRef;
  } else {
    delete (next as { providerProfileId?: unknown }).providerProfileId;
  }
  // If the variant's defaultModel is not in the bound profile's model list,
  // fall back to the first available model from the profile.
  // Compare ignoring context window suffix (e.g. "[1m]") — the suffix is a
  // CLI hint, not part of the canonical model ID, so profile lists won't include it.
  const models = options?.profileModels;
  if (models && models.length > 0) {
    const currentModel = typeof next.defaultModel === 'string' ? next.defaultModel.trim() : '';
    const baseModel = currentModel.replace(/\[.*\]$/, '');
    if (!currentModel || (!models.includes(currentModel) && !models.includes(baseModel))) {
      next.defaultModel = models[0];
    }
  }
  return next;
}

function resolveSelectedVariants(
  breed: Record<string, unknown>,
  binding: BootstrapBinding | undefined,
  projectRoot: string,
): Record<string, unknown>[] {
  if (!binding || binding.mode === 'skip' || binding.enabled === false) return [];
  const variants = Array.isArray(breed.variants) ? (breed.variants as Record<string, unknown>[]) : [];
  const defaultVariantId = typeof breed.defaultVariantId === 'string' ? breed.defaultVariantId : undefined;
  const accountRef = binding.accountRef?.trim();
  if (!accountRef) return [];

  if (binding.mode === 'api_key') {
    const selected =
      variants.find((variant) => variant.id === defaultVariantId) ??
      variants.find((variant) => providerToBootstrapClient(variant.provider) != null);
    if (!selected) return [];
    const explicitAccountRef = resolveExplicitVariantAccountRef(selected);
    const effectiveRef = explicitAccountRef ?? accountRef;
    const profileModels = readProfileModelsSync(projectRoot, effectiveRef);
    return [
      cloneWithAccountRef(selected, effectiveRef, {
        explicit: explicitAccountRef != null,
        profileModels,
      }),
    ];
  }

  return variants.map((variant) => {
    const explicitAccountRef = resolveExplicitVariantAccountRef(variant);
    return cloneWithAccountRef(variant, explicitAccountRef ?? accountRef, {
      explicit: explicitAccountRef != null,
    });
  });
}

function collectBreedAgentIds(breed: Record<string, unknown>): string[] {
  const breedAgentId = typeof breed.agentId === 'string' ? breed.agentId : null;
  const variants = Array.isArray(breed.variants) ? (breed.variants as Record<string, unknown>[]) : [];
  const collected = new Set<string>();
  for (const variant of variants) {
    const agentId = typeof variant.agentId === 'string' ? variant.agentId : breedAgentId;
    if (agentId) collected.add(agentId);
  }
  return [...collected];
}

function fallbackAccountRefForClient(client: BuiltinAccountClient, binding: BootstrapBinding | undefined): string {
  return binding?.accountRef?.trim() || builtinAccountIdForClient(client);
}

function readSeedMetadata(projectRoot: string): {
  explicitSeedAccountRefs: Map<string, string>;
  seedAgentIdsByClient: Map<BuiltinAccountClient, Set<string>>;
} {
  const explicitSeedAccountRefs = new Map<string, string>();
  const seedAgentIdsByClient = new Map<BuiltinAccountClient, Set<string>>();

  try {
    const template = JSON.parse(readFileSync(resolveProjectTemplatePath(projectRoot), 'utf-8')) as OfficeClawConfig;
    for (const breed of template.breeds as unknown as Record<string, unknown>[]) {
      const variants = Array.isArray(breed.variants) ? (breed.variants as Record<string, unknown>[]) : [];
      for (const variant of variants) {
        const client = providerToBootstrapClient(variant.provider);
        if (!client) continue;
        const agentId =
          typeof variant.agentId === 'string' ? variant.agentId : typeof breed.agentId === 'string' ? breed.agentId : null;
        if (!agentId) continue;
        const clientSeedAgentIds = seedAgentIdsByClient.get(client) ?? new Set<string>();
        clientSeedAgentIds.add(agentId);
        seedAgentIdsByClient.set(client, clientSeedAgentIds);

        const explicitAccountRef = resolveExplicitVariantAccountRef(variant);
        if (explicitAccountRef) explicitSeedAccountRefs.set(agentId, explicitAccountRef);
      }
    }
  } catch {
    // Keep migration best-effort when the template is unavailable.
  }

  return { explicitSeedAccountRefs, seedAgentIdsByClient };
}

function resolveLegacySeedBindingBackfill(
  projectRoot: string,
  catalog: OfficeClawConfig,
  _bootstrapBindings: Record<string, BootstrapBinding | undefined>,
): Map<string, string> {
  const { explicitSeedAccountRefs, seedAgentIdsByClient } = readSeedMetadata(projectRoot);
  const backfill = new Map<string, string>();
  const observedSeedBindings = new Map<BuiltinAccountClient, Array<{ agentId: string; accountRef: string }>>();

  for (const breed of catalog.breeds as unknown as Record<string, unknown>[]) {
    const variants = Array.isArray(breed.variants) ? (breed.variants as Record<string, unknown>[]) : [];
    for (const variant of variants) {
      const client = providerToBootstrapClient(variant.provider);
      if (!client) continue;

      const agentId =
        typeof variant.agentId === 'string' ? variant.agentId : typeof breed.agentId === 'string' ? breed.agentId : null;
      if (!agentId) continue;

      const providerProfileId = trimBinding(variant.providerProfileId);
      const accountRef = trimBinding(variant.accountRef);
      if (providerProfileId || !accountRef) continue;

      const templateExplicitAccountRef = explicitSeedAccountRefs.get(agentId);
      if (templateExplicitAccountRef && templateExplicitAccountRef === accountRef) {
        backfill.set(agentId, accountRef);
        continue;
      }

      if (!seedAgentIdsByClient.get(client)?.has(agentId)) continue;
      const bindings = observedSeedBindings.get(client) ?? [];
      bindings.push({ agentId, accountRef });
      observedSeedBindings.set(client, bindings);
    }
  }

  for (const [client, bindings] of observedSeedBindings) {
    if (bindings.length < 2) continue;
    const uniqueAccountRefs = new Set(bindings.map((binding) => binding.accountRef));
    if (uniqueAccountRefs.size <= 1) continue;

    const inheritedAccountRef = builtinAccountIdForClient(client);
    if (!uniqueAccountRefs.has(inheritedAccountRef)) continue;
    for (const binding of bindings) {
      if (binding.accountRef !== inheritedAccountRef) {
        backfill.set(binding.agentId, binding.accountRef);
      }
    }
  }

  return backfill;
}

function migrateExistingCatalogBindings(
  projectRoot: string,
  catalog: OfficeClawConfig,
): { catalog: OfficeClawConfig; dirty: boolean } {
  const bootstrapBindings = readBootstrapBindingsSync(projectRoot);
  const legacySeedBindingBackfill = resolveLegacySeedBindingBackfill(projectRoot, catalog, bootstrapBindings);
  let dirty = false;
  const nextCatalog = structuredClone(catalog) as OfficeClawConfig;

  for (const breed of nextCatalog.breeds as unknown as Record<string, unknown>[]) {
    const variants = Array.isArray(breed.variants) ? (breed.variants as Record<string, unknown>[]) : [];
    for (const variant of variants) {
      const client = providerToBootstrapClient(variant.provider);
      if (!client) continue;
      const agentId =
        typeof variant.agentId === 'string' ? variant.agentId : typeof breed.agentId === 'string' ? breed.agentId : null;
      const explicitProviderProfileId = trimBinding(variant.providerProfileId);
      const existingAccountRef = typeof variant.accountRef === 'string' ? variant.accountRef.trim() : '';
      const legacyExplicitAccountRef = agentId ? legacySeedBindingBackfill.get(agentId) : undefined;
      if (!explicitProviderProfileId && existingAccountRef && legacyExplicitAccountRef === existingAccountRef) {
        variant.providerProfileId = existingAccountRef;
        dirty = true;
        continue;
      }
      if (existingAccountRef) continue;
      if (explicitProviderProfileId) {
        variant.accountRef = explicitProviderProfileId;
        dirty = true;
        continue;
      }
      const nextAccountRef = fallbackAccountRefForClient(client, bootstrapBindings[client]);
      if (!nextAccountRef) continue;
      variant.accountRef = nextAccountRef;
      dirty = true;
    }
  }

  return { catalog: nextCatalog, dirty };
}

function filterBootstrapCatalog(template: OfficeClawConfig, projectRoot: string): OfficeClawConfig {
  const bootstrapBindings = readBootstrapBindingsSync(projectRoot);
  const selectedBreeds: Record<string, unknown>[] = [];
  const selectedAgentIds = new Set<string>();

  for (const rawBreed of template.breeds as unknown as Record<string, unknown>[]) {
    const variants = Array.isArray(rawBreed.variants) ? (rawBreed.variants as Record<string, unknown>[]) : [];
    const firstClient = variants.map((variant) => providerToBootstrapClient(variant.provider)).find(Boolean) ?? null;
    if (!firstClient) {
      selectedBreeds.push(rawBreed);
      for (const agentId of collectBreedAgentIds(rawBreed)) selectedAgentIds.add(agentId);
      continue;
    }
    const binding = bootstrapBindings[firstClient];
    if (!binding || binding.mode === 'skip' || binding.enabled === false) {
      selectedBreeds.push(rawBreed);
      for (const agentId of collectBreedAgentIds(rawBreed)) selectedAgentIds.add(agentId);
      continue;
    }
    const selectedVariants = resolveSelectedVariants(rawBreed, binding, projectRoot);
    if (selectedVariants.length === 0) {
      selectedBreeds.push(rawBreed);
      for (const agentId of collectBreedAgentIds(rawBreed)) selectedAgentIds.add(agentId);
      continue;
    }
    const nextBreed: Record<string, unknown> = {
      ...rawBreed,
      variants: selectedVariants,
      defaultVariantId: selectedVariants.some((variant) => variant.id === rawBreed.defaultVariantId)
        ? rawBreed.defaultVariantId
        : selectedVariants[0]?.id,
    };
    selectedBreeds.push(nextBreed);
    for (const variant of selectedVariants) {
      const agentId = typeof variant.agentId === 'string' ? variant.agentId : rawBreed.agentId;
      if (typeof agentId === 'string' && agentId) selectedAgentIds.add(agentId);
    }
  }

  const templateRoster = 'roster' in template ? template.roster : {};
  const filteredRoster = Object.fromEntries(
    Object.entries((templateRoster ?? {}) as Record<string, unknown>).filter(([agentId]) => selectedAgentIds.has(agentId)),
  );

  if ('roster' in template) {
    return {
      ...template,
      breeds: selectedBreeds as unknown as typeof template.breeds,
      roster: filteredRoster as Roster,
    };
  }

  return {
    ...template,
    breeds: selectedBreeds as unknown as typeof template.breeds,
  };
}

function reconcileCatalogWithSourceCatalog(
  existingCatalog: OfficeClawConfig,
  sourceCatalog: OfficeClawConfig,
): { catalog: OfficeClawConfig; dirty: boolean } {
  const nextCatalog = structuredClone(existingCatalog) as OfficeClawConfig & { roster?: Roster };
  let dirty = false;

  const existingBreeds = nextCatalog.breeds as unknown as Array<Record<string, unknown>>;
  const existingBreedById = new Map(
    existingBreeds
      .filter((breed) => typeof breed.id === 'string' && breed.id.length > 0)
      .map((breed) => [breed.id as string, breed]),
  );

  for (const sourceBreed of sourceCatalog.breeds as unknown as Array<Record<string, unknown>>) {
    const sourceBreedId = typeof sourceBreed.id === 'string' ? sourceBreed.id : null;
    if (!sourceBreedId) continue;
    const existingBreed = existingBreedById.get(sourceBreedId);
    if (!existingBreed) {
      existingBreeds.push(structuredClone(sourceBreed));
      dirty = true;
      continue;
    }

    const existingVariants = Array.isArray(existingBreed.variants)
      ? (existingBreed.variants as Array<Record<string, unknown>>)
      : [];
    const existingVariantIds = new Set(
      existingVariants
        .map((variant) => (typeof variant.id === 'string' ? variant.id : null))
        .filter((id): id is string => id !== null),
    );
    const sourceVariants = Array.isArray(sourceBreed.variants)
      ? (sourceBreed.variants as Array<Record<string, unknown>>)
      : [];
    for (const sourceVariant of sourceVariants) {
      const sourceVariantId = typeof sourceVariant.id === 'string' ? sourceVariant.id : null;
      if (!sourceVariantId || existingVariantIds.has(sourceVariantId)) continue;
      existingVariants.push(structuredClone(sourceVariant));
      existingVariantIds.add(sourceVariantId);
      dirty = true;
    }
    if (existingVariants.length > 0) {
      existingBreed.variants = existingVariants;
    }
  }

  if ('roster' in sourceCatalog) {
    const nextRoster = { ...(('roster' in nextCatalog ? nextCatalog.roster : {}) ?? {}) } as Roster;
    for (const [agentId, rosterEntry] of Object.entries(sourceCatalog.roster ?? {})) {
      if (nextRoster[agentId]) continue;
      nextRoster[agentId] = structuredClone(rosterEntry as Roster[keyof Roster]);
      dirty = true;
    }
    if ('roster' in nextCatalog) {
      nextCatalog.roster = nextRoster;
    } else {
      nextCatalog.roster = nextRoster;
    }
  }

  return { catalog: nextCatalog as OfficeClawConfig, dirty };
}

export function resolveAgentCatalogPath(projectRoot: string): string {
  return safePath(projectRoot, OFFICE_CLAW_DIR, CAT_CATALOG_FILENAME);
}

export function readAgentCatalogRaw(projectRoot: string): string | null {
  const catalogPath = resolveAgentCatalogPath(projectRoot);
  if (!existsSync(catalogPath)) return null;
  const raw = readFileSync(catalogPath, 'utf-8');
  try {
    const parsed = JSON.parse(raw) as OfficeClawConfig;
    const migrated = migrateExistingCatalogBindings(projectRoot, parsed);
    if (migrated.dirty) {
      const nextRaw = `${JSON.stringify(migrated.catalog, null, 2)}\n`;
      writeFileAtomic(catalogPath, nextRaw);
      return nextRaw;
    }
  } catch {
    // Leave invalid JSON handling to the loader so callers see the original parse error.
  }
  return raw;
}

export function readAgentCatalog(projectRoot: string): OfficeClawConfig | null {
  const raw = readAgentCatalogRaw(projectRoot);
  if (raw === null) return null;
  const catalog = JSON.parse(raw) as OfficeClawConfig;
  migrateAgentIdFields(catalog as unknown as Record<string, unknown>);
  for (const breed of (catalog.breeds ?? []) as unknown as Record<string, unknown>[]) {
    migrateAgentIdFields(breed);
    for (const variant of (breed.variants ?? []) as unknown as Record<string, unknown>[]) {
      migrateAgentIdFields(variant);
    }
  }
  return catalog;
}

export function bootstrapAgentCatalog(projectRoot: string, templatePath: string): string {
  const catalogPath = resolveAgentCatalogPath(projectRoot);
  if (existsSync(catalogPath)) {
    try {
      const existingCatalog = JSON.parse(readFileSync(catalogPath, 'utf-8')) as OfficeClawConfig;
      // Skip reconciliation for preset-managed catalogs (e.g. ModelArts custom install).
      // These catalogs intentionally contain a subset of members; reconciling with the
      // full template would re-add members the preset explicitly removed.
      const isPresetCatalog = (existingCatalog as unknown as Record<string, unknown>).preset === true;
      if (!isPresetCatalog) {
        const sourcePath = existsSync(resolve(projectRoot, 'office-claw-config.json')) ? resolve(projectRoot, 'office-claw-config.json') : templatePath;
        const sourceCatalog = JSON.parse(readFileSync(sourcePath, 'utf-8')) as OfficeClawConfig;
        const reconciled = reconcileCatalogWithSourceCatalog(existingCatalog, sourceCatalog);
        if (reconciled.dirty) {
          writeFileAtomic(catalogPath, `${JSON.stringify(reconciled.catalog, null, 2)}\n`);
        }
      }
    } catch (err) {
      log.warn({ err, projectRoot, catalogPath }, 'catalog reconciliation failed');
    }
    readAgentCatalogRaw(projectRoot);
    return catalogPath;
  }

  // If a modelarts-preset.json exists at the project root, generate the catalog
  // from preset + template so the dev startup path matches the Windows installer path.
  // The breed-building logic here mirrors scripts/build-catalog.mjs — keep them in sync.
  const presetPath = resolve(projectRoot, 'modelarts-preset.json');
  if (existsSync(presetPath)) {
    const preset = JSON.parse(readFileSync(presetPath, 'utf-8'));
    const template = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const catalog = buildCatalogFromPreset(template, preset);
    mkdirSync(dirname(catalogPath), { recursive: true });
    writeFileAtomic(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    log.info({ projectRoot, catalogPath }, 'Bootstrapped agent catalog from modelarts-preset.json');
    return catalogPath;
  }

  // Prefer office-claw-config.json (real runtime config with owner data) over office-claw-template.json
  // for bootstrapping the catalog. The template is only used for fresh installations
  // where office-claw-config.json doesn't exist (e.g. new clones from the open-source repo).
  const legacyConfigPath = resolve(projectRoot, 'office-claw-config.json');
  const sourcePath = existsSync(legacyConfigPath) ? legacyConfigPath : templatePath;
  const template = JSON.parse(readFileSync(sourcePath, 'utf-8')) as OfficeClawConfig;
  const runtimeCatalog = filterBootstrapCatalog(template, projectRoot);
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileAtomic(catalogPath, `${JSON.stringify(runtimeCatalog, null, 2)}\n`);
  return catalogPath;
}

// Backward-compat aliases for historical cat-* naming in tests and older callers.
export const resolveCatCatalogPath = resolveAgentCatalogPath;
export const readCatCatalog = readAgentCatalog;
export const bootstrapCatCatalog = bootstrapAgentCatalog;

export function writeAgentCatalog(projectRoot: string, catalog: OfficeClawConfig): string {
  const catalogPath = resolveAgentCatalogPath(projectRoot);
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileAtomic(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalogPath;
}

// ── Preset-based catalog generation (mirrors scripts/build-catalog.mjs) ──
// Keep in sync with the canonical implementation in scripts/build-catalog.mjs.
// Duplicated here to avoid async dynamic import in this sync bootstrap path.

interface ModelArtsPreset {
  sharedAccount: { profileId: string; displayName: string; baseUrl: string; models: string[]; protocol: string };
  members: Array<{
    agentId: string;
    breedId: string;
    nickname?: string;
    displayName?: string;
    avatar?: string;
    color?: { primary: string; secondary: string };
    mentionPatterns?: string[];
    provider: string;
    defaultModel?: string;
    roleDescription?: string;
    personality?: string;
    teamStrengths?: string;
    strengths?: string[];
  }>;
}

function defaultCliForProvider(provider: string) {
  switch (provider) {
    case 'opencode':
      return { command: 'opencode', outputFormat: 'json', defaultArgs: ['run', '--format', 'json'] };
    case 'dare':
      return { command: 'dare', outputFormat: 'json' };
    case 'relayclaw':
      return { command: 'jiuwenclaw-app', outputFormat: 'json' };
    default:
      return { command: provider, outputFormat: 'json' };
  }
}

function buildCatalogFromPreset(
  template: Record<string, unknown>,
  preset: ModelArtsPreset,
): Record<string, unknown> {
  const account = preset.sharedAccount;
  const breeds = (template.breeds as Array<Record<string, unknown>>) ?? [];
  const roster: Record<string, unknown> = {};

  for (const member of preset.members) {
    const base = (template.roster as Record<string, unknown>)[member.agentId];
    if (!base) {
      throw new Error(
        `ModelArts preset roster template for "${member.agentId}" not found in office-claw-template.json`,
      );
    }
    roster[member.agentId] = { ...(base as object), available: true };
  }

  const catalog = {
    version: 2,
    preset: true,
    defaultAgentId: preset.members[0]?.agentId,
    coCreator: template.coCreator,
    reviewPolicy: template.reviewPolicy,
    roster,
    breeds: preset.members.map((member) => {
      const breed = breeds.find((entry) => entry.id === member.breedId);
      if (!breed) throw new Error(`ModelArts preset template breed "${member.breedId}" not found`);
      const variants = (breed.variants as Array<Record<string, unknown>>) ?? [];
      const baseVariant = variants.find((v) => v.id === breed.defaultVariantId) ?? variants[0];
      const variantId = `${member.agentId}-default`;
      return {
        id: breed.id,
        agentId: member.agentId,
        name: member.displayName ?? breed.name,
        displayName: member.displayName ?? breed.displayName,
        nickname: member.nickname,
        avatar: member.avatar ?? breed.avatar,
        color: member.color ?? breed.color,
        mentionPatterns: member.mentionPatterns,
        roleDescription: member.roleDescription ?? breed.roleDescription,
        ...(member.teamStrengths ?? breed.teamStrengths ? { teamStrengths: member.teamStrengths ?? breed.teamStrengths } : {}),
        ...(breed.caution !== undefined ? { caution: breed.caution } : {}),
        ...(breed.features ? { features: breed.features } : {}),
        defaultVariantId: variantId,
        variants: [
          {
            personality: member.personality ?? baseVariant?.personality,
            ...(member.strengths ?? baseVariant?.strengths
              ? { strengths: member.strengths ?? baseVariant.strengths }
              : {}),
            ...(baseVariant?.contextBudget ? { contextBudget: baseVariant.contextBudget } : {}),
            ...(baseVariant?.voiceConfig ? { voiceConfig: baseVariant.voiceConfig } : {}),
            id: variantId,
            agentId: member.agentId,
            provider: member.provider,
            defaultModel: member.defaultModel ?? account.models[0] ?? 'glm-5',
            mcpSupport: true,
            cli: defaultCliForProvider(member.provider),
            accountRef: 'huawei-maas',
            providerProfileId: 'huawei-maas',
          },
        ],
      };
    }),
  };

  return catalog;
}
