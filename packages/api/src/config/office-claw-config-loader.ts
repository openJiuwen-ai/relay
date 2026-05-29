/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * OfficeClaw Config Loader
 * 从 office-claw-template.json / .office-claw/office-claw-catalog.json 加载 Breed+Variant 配置。
 * Node-only — 前端继续用 shared 包的 OFFICE_CLAW_CONFIGS 常量。
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  OFFICE_CLAW_CONFIGS,
  officeClawRegistry,
  createAgentId,
} from '@openjiuwen/relay-shared';
import type {
  AgentBreed,
  OfficeClawConfig,
  OfficeClawConfigEntry,
  AgentFeatures,
  AgentId,
  AgentVariant,
  CoCreatorConfig,
  ContextBudget,
  MissionHubSelfClaimScope,
  ReviewPolicy,
  Roster,
} from '@openjiuwen/relay-shared';
import { z } from 'zod';
import { createModuleLogger } from '../infrastructure/logger.js';
import { resolveOfficeClawHostRoot } from '../utils/office-claw-root.js';
import { isClientAllowed } from '../utils/client-visibility.js';
import { bootstrapAgentCatalog, readAgentCatalogRaw, resolveAgentCatalogPath } from './office-claw-catalog-store.js';
import { migrateAgentIdFields } from '../compat/agentid-field-migration.js';

const log = createModuleLogger('agent-config');

/**
 * Default office-claw-template.json location (repo root).
 *
 * IMPORTANT: API dev scripts run with cwd=`packages/api`, so `process.cwd()` is
 * not the repo root. Resolve relative to this file instead to keep behavior
 * stable across different launch directories.
 */
const DEFAULT_CAT_TEMPLATE_PATH = resolve(resolveOfficeClawHostRoot(process.cwd()), 'office-claw-template.json');

const cliConfigSchema = z.object({
  command: z.string().min(1),
  outputFormat: z.string().min(1),
  defaultArgs: z.array(z.string()).optional(),
  effort: z.enum(['low', 'medium', 'high', 'max', 'xhigh']).optional(),
});

const contextBudgetSchema = z.object({
  maxPromptTokens: z.number().positive(),
  maxContextTokens: z.number().positive(),
  maxMessages: z.number().positive().int(),
  maxContentLengthPerMsg: z.number().positive(),
});

/** F32-b: mentionPatterns must start with @ */
const mentionPatternSchema = z.string().min(2).regex(/^@/, 'mentionPattern must start with @');

const colorSchema = z.object({ primary: z.string(), secondary: z.string() });
const embeddedAcpConfigSchema = z
  .object({
    executablePath: z.string().min(1).optional(),
    args: z.array(z.string().min(1)).optional(),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string().min(1), z.string()).optional(),
    provider: z.enum(['openai_compatible', 'bigmodel', 'minimax', 'echo']).optional(),
    baseUrl: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
    headers: z.record(z.string().min(1), z.string()).optional(),
    sslVerify: z.boolean().nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().positive().optional(),
    contextWindow: z.number().positive().optional(),
    connectTimeoutSeconds: z.number().positive().optional(),
  })
  .optional();

const agentVariantSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1).optional(), // F32-b: variant-level agentId
  displayName: z.string().min(1).optional(), // F32-b: variant-level displayName
  variantLabel: z.string().min(1).optional(), // F32-b P4: disambiguation label
  mentionPatterns: z.array(mentionPatternSchema).optional(), // F32-b: variant-level mentions
  accountRef: z.string().min(1).optional(), // F127: concrete account binding
  providerProfileId: z.string().min(1).optional(), // Legacy migration path
  provider: z.string().min(1),
  defaultModel: z.string().min(1),
  mcpSupport: z.boolean(),
  cli: cliConfigSchema,
  commandArgs: z.array(z.string().min(1)).optional(), // F127: explicit bridge args (e.g. Antigravity)
  cliConfigArgs: z.array(z.string().min(1)).optional(), // F127: extra CLI args per member
  ocProviderName: z.string().min(1).optional(), // F189: opencode custom provider name (e.g. "maas")
  embeddedAcpExecutablePath: z.string().min(1).optional(),
  embeddedAcpConfig: embeddedAcpConfigSchema,
  extend: z.record(z.string(), z.unknown()).optional(),
  skills: z.array(z.string().min(1)).optional(),
  roleDescription: z.string().min(1).optional(), // F127 review fix: allow variant-scoped roleDescription override
  sessionChain: z.boolean().optional(), // F127 review fix: allow variant-scoped sessionChain override
  personality: z.string().optional(),
  strengths: z.array(z.string()).optional(),
  avatar: z.string().min(1).optional(), // F32-b P4c: override breed avatar
  color: colorSchema.optional(), // F32-b P4c: override breed color
  contextBudget: contextBudgetSchema.optional(),
  voiceConfig: z // F103: per-agent TTS voice configuration
    .object({
      voice: z.string().min(1),
      langCode: z.string().min(1),
      speed: z.number().positive().optional(),
      refAudio: z.string().min(1).optional(),
      refText: z.string().min(1).optional(),
      instruct: z.string().min(1).optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
  teamStrengths: z.string().optional(), // F-Ground-3: human-readable strengths
  caution: z.string().nullable().optional(), // F-Ground-3: null = explicit no-caution (R1 fix)
});

type LegacyAwareAgentVariant = AgentVariant & {
  providerProfileId?: string;
};

/** F33 Phase 2: session strategy config (matches SessionStrategyConfig from shared).
 *  Exported for reuse by Phase 3 API route validation. */
export const sessionStrategySchema = z
  .object({
    strategy: z.enum(['handoff', 'compress', 'hybrid']),
    thresholds: z
      .object({
        warn: z.number().min(0).max(1),
        action: z.number().min(0).max(1),
      })
      .refine((t) => t.warn < t.action, { message: 'thresholds.warn must be less than thresholds.action' })
      .optional(),
    handoff: z
      .object({
        preSealMemoryDump: z.boolean(),
        bootstrapDepth: z.enum(['extractive', 'generative']),
      })
      .optional(),
    compress: z
      .object({
        maxCompressions: z.number().int().positive().optional(),
        trackPostCompression: z.boolean(),
      })
      .optional(),
    hybrid: z
      .object({
        maxCompressions: z.number().int().positive(),
      })
      .optional(),
    turnBudget: z.number().int().positive().optional(),
    safetyMargin: z.number().int().positive().optional(),
  })
  .optional();

const agentFeaturesSchema = z
  .object({
    sessionChain: z.boolean().optional(),
    sessionStrategy: sessionStrategySchema,
    missionHub: z
      .object({
        selfClaimScope: z.enum(['disabled', 'once', 'thread', 'global']).optional(),
      })
      .optional(),
  })
  .optional();

const agentBreedSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1),
  nickname: z.string().nullable().optional(),
  avatar: z.string().min(1),
  color: colorSchema,
  mentionPatterns: z.array(mentionPatternSchema).min(1),
  roleDescription: z.string().min(1),
  defaultVariantId: z.string().min(1),
  variants: z.array(agentVariantSchema).min(1),
  features: agentFeaturesSchema,
  teamStrengths: z.string().optional(), // F-Ground-3: breed-level default
  caution: z.string().nullable().optional(), // F-Ground-3: null = explicit no-caution (R1 fix)
  creationSource: z.enum(['experts-plaza']).optional(),
});

// ── F032: Roster schema for collaboration rules ──────────────────────

/** Roster entry for a single agent */
const rosterEntrySchema = z.object({
  family: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
  lead: z.boolean(),
  available: z.boolean(),
  evaluation: z.string().min(1),
});

/** Review policy configuration */
const reviewPolicySchema = z.object({
  requireDifferentFamily: z.boolean(),
  preferActiveInThread: z.boolean(),
  preferLead: z.boolean(),
  excludeUnavailable: z.boolean(),
});

// Note: Roster, RosterEntry, ReviewPolicy types imported from @openjiuwen/relay-shared above

/** F067: Owner config schema */
const coCreatorConfigSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  mentionPatterns: z.array(mentionPatternSchema).min(1),
  avatar: z.string().min(1).optional(),
  color: colorSchema.optional(),
});

/** Version 1: breeds only (legacy) */
const officeClawConfigSchemaV1 = z.object({
  version: z.literal(1),
  breeds: z.array(agentBreedSchema).min(1),
});

/** Version 2: breeds + roster + reviewPolicy (F032) + coCreator (F067) */
const officeClawConfigSchemaV2 = z
  .object({
    version: z.literal(2),
    breeds: z.array(agentBreedSchema).min(1),
    roster: z.record(z.string(), rosterEntrySchema),
    reviewPolicy: reviewPolicySchema,
    coCreator: coCreatorConfigSchema.optional(),
    /** @deprecated Accepted for backward compat; migrated to coCreator at parse time. */
    owner: coCreatorConfigSchema.optional(),
  })
  .transform((data) => {
    // Migrate legacy "owner" key → "coCreator" (coCreator takes precedence)
    const { owner: legacyOwner, ...rest } = data;
    if (!rest.coCreator && legacyOwner) {
      return { ...rest, coCreator: legacyOwner };
    }
    return rest;
  });

/** Union of all versions — loader handles migration */
const officeClawConfigSchema = z.union([officeClawConfigSchemaV1, officeClawConfigSchemaV2]);

/**
 * Try office-claw-config.json (real runtime config with coCreator data) first,
 * then fall back to office-claw-template.json (generic template for new projects).
 */
function readConfigWithFallback(projectRoot: string, templatePath: string): string {
  const legacyPath = resolve(projectRoot, 'office-claw-config.json');
  try {
    return readFileSync(legacyPath, 'utf-8');
  } catch {
    // not found — fall through to template
  }
  try {
    return readFileSync(templatePath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new Error(`Failed to read agent config at ${legacyPath} or ${templatePath}: ${code ?? 'unknown error'}`);
  }
}

/**
 * Deep merge two plain objects. `overlay` fields override `base` fields.
 * - Objects: recursively merged (base fields preserved if absent from overlay).
 * - Arrays of objects with `id`: key-based merge (matched by id, then deep-merged).
 *   Overlay-only items appended; base-only items preserved.
 * - Other arrays / primitives: overlay replaces base.
 */
function deepMergeConfig(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay)) {
    const bVal = base[key];
    const oVal = overlay[key];
    if (Array.isArray(oVal) && Array.isArray(bVal) && oVal.length > 0 && isIdArray(oVal) && isIdArray(bVal)) {
      merged[key] = mergeById(bVal as HasId[], oVal as HasId[]);
    } else if (key === 'cli' && isPlainObject(oVal)) {
      // CLI config is provider-specific. When the runtime catalog switches a agent
      // from Claude ↔ Codex, preserving nested base fields like defaultArgs/effort
      // revives the old provider's flags during default loads.
      merged[key] = oVal;
    } else if (isPlainObject(oVal) && isPlainObject(bVal)) {
      merged[key] = deepMergeConfig(bVal as Record<string, unknown>, oVal as Record<string, unknown>);
    } else {
      merged[key] = oVal;
    }
  }
  return merged;
}

type HasId = Record<string, unknown> & { id: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isIdArray(arr: unknown[]): arr is HasId[] {
  return (
    arr.length > 0 &&
    arr.every((item) => isPlainObject(item) && typeof (item as Record<string, unknown>).id === 'string')
  );
}

function mergeById(base: HasId[], overlay: HasId[]): HasId[] {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const result: HasId[] = [];
  for (const oItem of overlay) {
    seen.add(oItem.id);
    const bItem = baseMap.get(oItem.id);
    result.push(bItem ? (deepMergeConfig(bItem, oItem) as HasId) : oItem);
  }
  // Preserve base-only items (new items added to office-claw-config.json but not yet in catalog)
  for (const bItem of base) {
    if (!seen.has(bItem.id)) result.push(bItem);
  }
  return result;
}

/**
 * Load and validate the resolved agent config source.
 * Explicit filePath reads that file directly.
 * Default resolution: office-claw-config.json is the base, .office-claw/office-claw-catalog.json is a delta overlay.
 * Catalog fields override config fields (deep merge); config fields absent from catalog are preserved.
 */
export function loadAgentConfig(filePath?: string): OfficeClawConfig {
  let raw: string;
  let resolvedPath = filePath;
  if (filePath) {
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new Error(`Failed to read agent config at ${filePath}: ${code ?? 'unknown error'}`);
    }
  } else {
    const templatePath = process.env.CAT_TEMPLATE_PATH ?? DEFAULT_CAT_TEMPLATE_PATH;
    const projectRoot = dirname(templatePath);
    const catalogRaw = readAgentCatalogRaw(projectRoot);
    if (catalogRaw !== null) {
      // Catalog exists — use office-claw-config.json as base, catalog as overlay
      const baseRaw = readConfigWithFallback(projectRoot, templatePath);
      const baseJson = JSON.parse(baseRaw) as Record<string, unknown>;
      const catalogJson = JSON.parse(catalogRaw) as Record<string, unknown>;
      raw = JSON.stringify(deepMergeConfig(baseJson, catalogJson));
      resolvedPath = resolveAgentCatalogPath(projectRoot);
    } else {
      raw = readConfigWithFallback(projectRoot, templatePath);
      resolvedPath = templatePath;
    }
  }

  const json: unknown = JSON.parse(raw);
  if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
    migrateAgentIdFields(json as Record<string, unknown>);
  }
  const result = officeClawConfigSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message} (code: ${i.code})`);
    const topLevel = typeof json === 'object' && json !== null ? Object.keys(json as Record<string, unknown>) : [];
    const version = (json as Record<string, unknown>)?.version;
    throw new Error(
      `Invalid agent config (version=${version}, keys=[${topLevel.join(',')}], path=${resolvedPath}):\n${issues.join('\n')}`,
    );
  }

  // Validate defaultVariantId references
  for (const breed of result.data.breeds) {
    const found = breed.variants.find((v) => v.id === breed.defaultVariantId);
    if (!found) {
      throw new Error(`Breed "${breed.id}": defaultVariantId "${breed.defaultVariantId}" not found in variants`);
    }
  }

  // Validate that configured mentionPatterns are non-empty.
  // The canonical @agentId handle is no longer required — users may replace it
  // with custom aliases via the Hub editor, as long as at least one alias exists.
  for (const breed of result.data.breeds) {
    if (breed.mentionPatterns.length === 0) {
      throw new Error(`Breed "${breed.id}": mentionPatterns must have at least one entry`);
    }
  }

  // Zod output has mutable arrays + plain string agentId;
  // OfficeClawConfig has readonly arrays + branded AgentId.
  // The shapes match at runtime after validation.
  return result.data as unknown as OfficeClawConfig;
}

function rewriteLegacyCatError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(message.replaceAll('Invalid agent config', 'Invalid cat config').replaceAll('agent config', 'cat config'));
}

function tryReadJson(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

function parseAndValidateConfig(raw: string, resolvedPath: string): OfficeClawConfig {
  const json: unknown = JSON.parse(raw);
  if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
    migrateAgentIdFields(json as Record<string, unknown>);
  }
  const result = officeClawConfigSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message} (code: ${i.code})`);
    const topLevel = typeof json === 'object' && json !== null ? Object.keys(json as Record<string, unknown>) : [];
    const version = (json as Record<string, unknown>)?.version;
    throw new Error(
      `Invalid agent config (version=${version}, keys=[${topLevel.join(',')}], path=${resolvedPath}):\n${issues.join('\n')}`,
    );
  }
  for (const breed of result.data.breeds) {
    const found = breed.variants.find((v) => v.id === breed.defaultVariantId);
    if (!found) {
      throw new Error(`Breed "${breed.id}": defaultVariantId "${breed.defaultVariantId}" not found in variants`);
    }
    if (breed.mentionPatterns.length === 0) {
      throw new Error(`Breed "${breed.id}": mentionPatterns must have at least one entry`);
    }
  }
  return result.data as unknown as OfficeClawConfig;
}

// Backward-compat loader for historical cat-* naming and file locations used in older tests.
export function loadCatConfig(filePath?: string): OfficeClawConfig {
  try {
    if (filePath) return loadAgentConfig(filePath);

    const templatePath = process.env.CAT_TEMPLATE_PATH ?? DEFAULT_CAT_TEMPLATE_PATH;
    const projectRoot = dirname(templatePath);
    const legacyCatalogPath = resolve(projectRoot, '.office-claw', 'cat-catalog.json');
    const legacyConfigPath = resolve(projectRoot, 'cat-config.json');
    const legacyCatalogRaw = tryReadJson(legacyCatalogPath);
    const legacyBasePath = tryReadJson(legacyConfigPath) !== null ? legacyConfigPath : templatePath;
    const legacyBaseRaw = tryReadJson(legacyBasePath);

    if (legacyCatalogRaw && legacyBaseRaw) {
      const merged = deepMergeConfig(
        JSON.parse(legacyBaseRaw) as Record<string, unknown>,
        JSON.parse(legacyCatalogRaw) as Record<string, unknown>,
      );
      return parseAndValidateConfig(JSON.stringify(merged), legacyCatalogPath);
    }
    if (legacyCatalogRaw) return parseAndValidateConfig(legacyCatalogRaw, legacyCatalogPath);
    if (legacyBaseRaw) return parseAndValidateConfig(legacyBaseRaw, legacyBasePath);
    return loadAgentConfig();
  } catch (error) {
    rewriteLegacyCatError(error);
  }
}

export function bootstrapDefaultAgentCatalog(templatePath?: string): OfficeClawConfig {
  const resolvedTemplatePath = templatePath ?? process.env.CAT_TEMPLATE_PATH ?? DEFAULT_CAT_TEMPLATE_PATH;
  const projectRoot = dirname(resolvedTemplatePath);
  const catalogPath = bootstrapAgentCatalog(projectRoot, resolvedTemplatePath);
  return loadAgentConfig(catalogPath);
}

/** Get the default variant for a breed */
export function getDefaultVariant(breed: AgentBreed): AgentVariant {
  const found = breed.variants.find((variant) => variant.id === breed.defaultVariantId);
  if (!found) throw new Error(`Default variant "${breed.defaultVariantId}" not found for breed "${breed.id}"`);
  return found;
}

/**
 * F32-b: Register ALL variants as independent agents.
 * Each variant becomes a OfficeClawConfigEntry entry keyed by its agentId.
 * Default variant inherits breed-level mentionPatterns; others default to @agentId when unspecified.
 * @throws Error on duplicate agentId (fail-fast at startup)
 */
export function toAllAgentConfigs(config: OfficeClawConfig): Record<string, OfficeClawConfigEntry> {
  const result: Record<
    string,
    OfficeClawConfigEntry & {
      contextBudget?: ContextBudget;
      providerProfileId?: string;
    }
  > = {};
  for (const breed of config.breeds) {
    // F32-b P4c: resolve default variant personality for non-default fallback
    const defaultVariant = breed.variants.find((v) => v.id === breed.defaultVariantId);

    for (const variant of breed.variants) {
      const isDefault = variant.id === breed.defaultVariantId;
      const agentId = variant.agentId ?? breed.agentId;
      const fallbackMentionPatterns = isDefault ? breed.mentionPatterns : [`@${agentId}`];
      const rawMentionPatterns =
        variant.mentionPatterns && variant.mentionPatterns.length > 0
          ? variant.mentionPatterns
          : fallbackMentionPatterns;
      // Auto-include displayName as valid mention pattern so model-generated
      // @displayName routes correctly (buildCallableMentions uses displayName
      // in prompt but parsers only match mentionPatterns).
      // Skip for non-default variants inheriting breed displayName — the
      // default variant already owns that pattern; adding it here would
      // violate the unique-alias constraint.
      const resolvedDisplayName = variant.displayName ?? breed.displayName;
      const displayNamePattern = `@${resolvedDisplayName}`;
      const shouldAddDisplayName =
        isDefault || resolvedDisplayName !== breed.displayName;
      const mentionPatterns =
        shouldAddDisplayName &&
        !rawMentionPatterns.some(
          (p) => p.toLowerCase() === displayNamePattern.toLowerCase(),
        )
          ? [...rawMentionPatterns, displayNamePattern]
          : rawMentionPatterns;

      // F32-b R3: agentId uniqueness — duplicate is a hard error (startup failure)
      if (result[agentId]) {
        throw new Error(
          `Duplicate agentId "${agentId}": variant "${variant.id}" in breed "${breed.id}" ` +
            `conflicts with already registered agent. Each variant must have a unique agentId.`,
        );
      }

      const teamStrengths = variant.teamStrengths ?? breed.teamStrengths;
      // R1 fix: null = "explicitly no caution" (don't inherit breed).
      // undefined (omitted) = inherit from breed. ?? treats null as nullish, so use !== undefined.
      const caution = variant.caution !== undefined ? variant.caution : breed.caution;
      const projectedCommandArgs =
        variant.commandArgs ??
        (variant.provider === 'antigravity' && variant.cli?.defaultArgs && variant.cli.defaultArgs.length > 0
          ? variant.cli.defaultArgs
          : undefined);

      const legacyVariant = variant as LegacyAwareAgentVariant;

      result[agentId] = {
        id: createAgentId(agentId),
        name: variant.displayName ?? breed.name,
        displayName: variant.displayName ?? breed.displayName,
        ...(breed.nickname != null ? { nickname: breed.nickname } : {}),
        avatar: variant.avatar ?? breed.avatar, // F32-b P4c: variant can override
        color: variant.color ?? breed.color, // F32-b P4c: variant can override
        mentionPatterns,
        ...(variant.accountRef != null
          ? { accountRef: variant.accountRef }
          : legacyVariant.providerProfileId != null
            ? { accountRef: legacyVariant.providerProfileId }
            : {}),
        ...(legacyVariant.providerProfileId != null ? { providerProfileId: legacyVariant.providerProfileId } : {}),
        provider: variant.provider,
        defaultModel: variant.defaultModel,
        mcpSupport: variant.mcpSupport,
        ...(projectedCommandArgs != null ? { commandArgs: projectedCommandArgs } : {}),
        ...(variant.cliConfigArgs != null && variant.cliConfigArgs.length > 0
          ? { cliConfigArgs: [...variant.cliConfigArgs] }
          : {}),
        ...(variant.contextBudget != null ? { contextBudget: variant.contextBudget } : {}),
        ...(variant.ocProviderName != null ? { ocProviderName: variant.ocProviderName } : {}),
        ...(variant.embeddedAcpExecutablePath != null
          ? { embeddedAcpExecutablePath: variant.embeddedAcpExecutablePath }
          : {}),
        ...(variant.embeddedAcpConfig != null ? { embeddedAcpConfig: variant.embeddedAcpConfig } : {}),
        ...(variant.extend != null ? { extend: variant.extend } : {}),
        ...(variant.skills != null && variant.skills.length > 0 ? { skills: [...variant.skills] } : {}),
        roleDescription: variant.roleDescription ?? breed.roleDescription,
        personality: variant.personality ?? defaultVariant?.personality ?? '',
        breedId: breed.id,
        breedDisplayName: breed.displayName,
        ...(breed.creationSource != null ? { creationSource: breed.creationSource } : {}),
        ...(variant.variantLabel != null ? { variantLabel: variant.variantLabel } : {}),
        isDefaultVariant: isDefault,
        ...(teamStrengths != null ? { teamStrengths } : {}),
        // R1 fix: preserve null (explicit no-caution) in OfficeClawConfigEntry; only omit if undefined
        ...(caution !== undefined ? { caution } : {}),
        ...(variant.strengths != null ? { strengths: variant.strengths } : {}),
        ...(variant.sessionChain !== undefined
          ? { sessionChain: variant.sessionChain }
          : breed.features?.sessionChain !== undefined
            ? { sessionChain: breed.features.sessionChain }
            : {}),
      };
    }
  }
  return result;
}

export const toAllCatConfigs = toAllAgentConfigs;

/** Backward-compat alias — now registers all variants, not just defaults */
export function toFlatConfigs(config: OfficeClawConfig): Record<string, OfficeClawConfigEntry> {
  return toAllAgentConfigs(config);
}

/**
 * F032 P2 cleanup: Get all agent IDs from config (replaces hardcoded fallbacks).
 * Used by agent-voices.ts, agent-budgets.ts, TaskExtractor.ts.
 */
export function getAllAgentIdsFromConfig(): readonly string[] {
  try {
    const config = getCachedConfig();
    if (!config) return [];
    return Object.keys(toAllAgentConfigs(config));
  } catch {
    return []; // If config fails to load, return empty (caller decides fallback)
  }
}

/**
 * Find a breed by checking mention patterns against text.
 * F32-b P4c: Uses longest-match-first to avoid prefix collisions
 * (e.g. `@布偶sonnet` must match Sonnet variant, not breed-level `@布偶`).
 */
export function findBreedByMention(config: OfficeClawConfig, text: string): { breed: AgentBreed; agentId: AgentId } | undefined {
  const lower = text.toLowerCase();

  // Collect all patterns with their resolution targets
  const entries: { pattern: string; breed: AgentBreed; agentId: string }[] = [];
  for (const breed of config.breeds) {
    for (const pattern of breed.mentionPatterns) {
      entries.push({ pattern: pattern.toLowerCase(), breed, agentId: breed.agentId });
    }
    for (const variant of breed.variants) {
      if (variant.mentionPatterns) {
        const agentId = variant.agentId ?? breed.agentId;
        for (const pattern of variant.mentionPatterns) {
          entries.push({ pattern: pattern.toLowerCase(), breed, agentId });
        }
      }
    }
  }

  // Sort longest-first to prevent prefix collisions
  entries.sort((a, b) => b.pattern.length - a.pattern.length);

  for (const entry of entries) {
    if (lower.includes(entry.pattern)) {
      return { breed: entry.breed, agentId: createAgentId(entry.agentId) };
    }
  }
  return undefined;
}

// ── F24 Feature Toggle ──────────────────────────────────────────────

let _cachedConfig: OfficeClawConfig | null = null;
let _configLoadFailed = false;

function getCachedConfig(): OfficeClawConfig | null {
  if (_configLoadFailed) return null;
  if (!_cachedConfig) {
    try {
      _cachedConfig = loadAgentConfig();
    } catch (err) {
      _configLoadFailed = true;
      log.warn({ err }, 'Failed to load runtime catalog/template config, F24 toggle will default to enabled');
      return null;
    }
  }
  return _cachedConfig;
}

// ── F32-b: agentId → breed index (for variant-aware feature lookups) ────

/**
 * Build an index mapping every agentId (including variant-level) to its parent breed.
 * Used by isSessionChainEnabled() to correctly resolve features for variants.
 */
export function buildAgentIdToBreedIndex(config: OfficeClawConfig): Map<string, AgentBreed> {
  const index = new Map<string, AgentBreed>();
  for (const breed of config.breeds) {
    for (const variant of breed.variants) {
      const agentId = variant.agentId ?? breed.agentId;
      // Prefer variants with an explicit agentId — an inherited agentId (variant.agentId===undefined)
      // must not overwrite an already-indexed explicit entry.  This prevents orphan variants
      // from a template breed (e.g. codex-default) from clobbering the catalog breed's agentId
      // ("office") after a breed rename via deepMergeConfig.
      if (!index.has(agentId) || variant.agentId !== undefined) {
        index.set(agentId, breed);
      }
    }
  }
  return index;
}

// Cache bound to config reference — rebuilt if different config is passed (e.g. tests)
let _agentIdToBreed: Map<string, AgentBreed> | null = null;
let _agentIdToBreedSource: OfficeClawConfig | null = null;

/**
 * Check if F24 session chain is enabled for an agent.
 * Returns true by default — only false when explicitly disabled in office-claw-config.json.
 * Gracefully returns true if config file is unreadable (availability over strictness).
 *
 * F32-b: Now resolves variant agentIds to their parent breed via index.
 * Design constraint: OfficeClaw config is loaded once at startup, no hot-reload.
 *
 * @param agentId - The agent to check (e.g. 'opus', 'codex', 'opus-45')
 * @param config - Optional config override (for testing)
 */
export function isSessionChainEnabled(agentId: AgentId | string, config?: OfficeClawConfig): boolean {
  const cfg = config ?? getCachedConfig();
  if (!cfg) return true; // Config unreadable → default enabled (Cloud P1 fix)
  const id = agentId as string;
  for (const breed of cfg.breeds) {
    for (const variant of breed.variants) {
      const resolvedAgentId = variant.agentId ?? breed.agentId;
      if (resolvedAgentId !== id) continue;
      if (variant.sessionChain !== undefined) return variant.sessionChain;
      return breed.features?.sessionChain !== false;
    }
  }
  return true; // Unknown agent → default enabled
}

// ── F33 Phase 2: Session Strategy from config ─────────────────────────

/**
 * Get session strategy config from office-claw-config.json for an agent.
 * Returns undefined if not configured (caller falls back to code defaults).
 *
 * F33 Phase 2: Same lookup pattern as isSessionChainEnabled — agentId → breed → features.
 */
export function getConfigSessionStrategy(
  agentId: string,
  config?: OfficeClawConfig,
): AgentFeatures['sessionStrategy'] | undefined {
  const cfg = config ?? getCachedConfig();
  if (!cfg) return undefined;

  if (!_agentIdToBreed || _agentIdToBreedSource !== cfg) {
    _agentIdToBreed = buildAgentIdToBreedIndex(cfg);
    _agentIdToBreedSource = cfg;
  }

  const breed = _agentIdToBreed.get(agentId);
  if (!breed) return undefined;

  // features.sessionStrategy is Zod-validated at load time
  return breed.features?.sessionStrategy;
}

/**
 * Get Mission Hub self-claim scope from office-claw-config.json for an agent.
 * Defaults to 'disabled' when not configured.
 */
export function getMissionHubSelfClaimScope(agentId: string, config?: OfficeClawConfig): MissionHubSelfClaimScope {
  const cfg = config ?? getCachedConfig();
  if (!cfg) return DEFAULT_MISSION_HUB_SELF_CLAIM_SCOPE;

  if (!_agentIdToBreed || _agentIdToBreedSource !== cfg) {
    _agentIdToBreed = buildAgentIdToBreedIndex(cfg);
    _agentIdToBreedSource = cfg;
  }

  const breed = _agentIdToBreed.get(agentId);
  if (!breed) return DEFAULT_MISSION_HUB_SELF_CLAIM_SCOPE;

  return breed.features?.missionHub?.selfClaimScope ?? DEFAULT_MISSION_HUB_SELF_CLAIM_SCOPE;
}

// ── F32-b: Default agent resolution ─────────────────────────────────────

let _defaultAgentId: AgentId | null = null;

function getFallbackDefaultAgentId(): AgentId {
  const registered = officeClawRegistry.getAllIds();
  if (registered.length > 0) return registered[0]!;

  const builtin = Object.keys(OFFICE_CLAW_CONFIGS)[0];
  if (builtin) return createAgentId(builtin);

  throw new Error('No available agents to resolve default agentId');
}

/**
 * Get the default agent ID for unaddressed messages.
 * Used as ultimate fallback in AgentRouter when no mentions/participants/preferredCats.
 *
 * Resolution order:
 * 1. Catalog-level `defaultAgentId` field (set by preset installers)
 * 2. First breed's agentId from the catalog (preset deployments)
 * 3. First registered runtime agentId
 * 4. First built-in fallback config key
 */
export function getDefaultAgentId(): AgentId {
  if (_defaultAgentId) return _defaultAgentId;

  const config = getCachedConfig();
  if (config) {
    // 1. Catalog-level explicit default (e.g. preset deployments set this)
    const catalogDefault = (config as unknown as Record<string, unknown>).defaultAgentId;
    if (typeof catalogDefault === 'string' && catalogDefault.length > 0) {
      _defaultAgentId = createAgentId(catalogDefault);
      return _defaultAgentId;
    }

    // 2. First breed's agentId (preset deployments with custom members)
    const firstBreed = config.breeds[0];
    if (firstBreed) {
      const agentId = firstBreed.agentId ?? firstBreed.variants?.[0]?.agentId;
      if (agentId) {
        _defaultAgentId = createAgentId(agentId as string);
        return _defaultAgentId;
      }
    }
  }

  // 3/4. Runtime-safe fallback: derive from the runtime registry first, then
  // the built-in config list. This keeps connector/default routing
  // aligned with the runtime registry even if agent-config.json is missing
  // or malformed during an upgrade/overwrite install.
  _defaultAgentId = getFallbackDefaultAgentId();
  return _defaultAgentId;
}

// ── Variant CLI effort accessor ──────────────────────────────────────

/** agentId → variant index (lazy, rebuilt on config change) */
let _agentIdToVariant: Map<string, AgentVariant> | null = null;
let _agentIdToVariantSource: OfficeClawConfig | null = null;

function buildAgentIdToVariantIndex(config: OfficeClawConfig): Map<string, AgentVariant> {
  const index = new Map<string, AgentVariant>();
  for (const breed of config.breeds) {
    for (const variant of breed.variants) {
      const agentId = variant.agentId ?? breed.agentId;
      // Prefer variants with an explicit agentId — an inherited agentId (variant.agentId===undefined)
      // must not overwrite an already-indexed explicit entry.  This prevents orphan variants
      // from a template breed (e.g. codex-default) from clobbering the catalog breed's agentId
      // ("office") after a breed rename via deepMergeConfig.
      if (!index.has(agentId) || variant.agentId !== undefined) {
        index.set(agentId, variant);
      }
    }
  }
  return index;
}

/** Effort level union across all CLI providers */
export type CliEffortLevel = 'low' | 'medium' | 'high' | 'max' | 'xhigh';

/**
 * Get CLI effort level for an agent from office-claw-config.json.
 * Default when not configured:
 *   claude (anthropic): 'max'
 *   codex (openai):     'xhigh'
 *   others:             'high'
 */
export function getAgentEffort(agentId: string, config?: OfficeClawConfig): CliEffortLevel {
  const cfg = config ?? getCachedConfig();
  if (!cfg) return 'max';

  if (!_agentIdToVariant || _agentIdToVariantSource !== cfg) {
    _agentIdToVariant = buildAgentIdToVariantIndex(cfg);
    _agentIdToVariantSource = cfg;
  }

  const variant = _agentIdToVariant.get(agentId);
  if (variant?.cli.effort) return variant.cli.effort;

  // Provider-aware defaults
  if (variant?.provider === 'openai') return 'xhigh';
  if (variant?.provider === 'anthropic') return 'max';
  return 'high';
}

/** Reset cached config (for testing) */
export function _resetCachedConfig(): void {
  _cachedConfig = null;
  _configLoadFailed = false;
  _agentIdToBreed = null;
  _agentIdToBreedSource = null;
  _agentIdToVariant = null;
  _agentIdToVariantSource = null;
  _defaultAgentId = null;
  _cachedRoster = null;
  _cachedReviewPolicy = null;
  _cachedCoCreator = null;
}

// ── F032: Roster + ReviewPolicy accessors ──────────────────────────────

let _cachedRoster: Roster | null = null;
let _cachedReviewPolicy: ReviewPolicy | null = null;

/** Default review policy if not configured (v1 config) */
const DEFAULT_REVIEW_POLICY: ReviewPolicy = {
  requireDifferentFamily: true,
  preferActiveInThread: true,
  preferLead: true,
  excludeUnavailable: true,
};
const DEFAULT_MISSION_HUB_SELF_CLAIM_SCOPE: MissionHubSelfClaimScope = 'disabled';

/**
 * Get roster from config. Returns empty object for v1 configs.
 * F032: Used by reviewer matching to check roles, availability, family.
 */
export function getRoster(config?: OfficeClawConfig): Roster {
  if (_cachedRoster && !config) return _cachedRoster;

  const cfg = config ?? getCachedConfig();
  if (!cfg) return {};

  // v1 config has no roster
  if (cfg.version === 1) return {};

  // v2 config has roster — TypeScript narrows type after version check
  _cachedRoster = cfg.roster;
  return cfg.roster;
}

/**
 * Get review policy from config. Returns defaults for v1 configs.
 * F032: Used by reviewer matching to determine matching strategy.
 */
export function getReviewPolicy(config?: OfficeClawConfig): ReviewPolicy {
  if (_cachedReviewPolicy && !config) return _cachedReviewPolicy;

  const cfg = config ?? getCachedConfig();
  if (!cfg) return DEFAULT_REVIEW_POLICY;

  // v1 config has no reviewPolicy → use defaults
  if (cfg.version === 1) return DEFAULT_REVIEW_POLICY;

  // v2 config has reviewPolicy — TypeScript narrows type after version check
  _cachedReviewPolicy = cfg.reviewPolicy;
  return cfg.reviewPolicy;
}

/**
 * Resolve an agent's provider from config breeds.
 * Returns undefined if agentId is not found in config.
 */
function getAgentProvider(agentId: string, config?: OfficeClawConfig): string | undefined {
  const cfg = config ?? getCachedConfig();
  if (!cfg) return undefined;

  // Reuse the existing variant index for O(1) lookup
  if (!_agentIdToVariant || _agentIdToVariantSource !== cfg) {
    _agentIdToVariant = buildAgentIdToVariantIndex(cfg);
    _agentIdToVariantSource = cfg;
  }

  return _agentIdToVariant.get(agentId)?.provider;
}

/**
 * Check if a agent is available (has quota AND its provider is visible).
 * F032: 用户 40 美刀教训 — 没配额的猫不要找！
 * Client-visibility: hidden providers must not be routable via @mention.
 */
export function isAgentAvailable(agentId: string, config?: OfficeClawConfig): boolean {
  const roster = getRoster(config);
  const entry = roster[agentId];
  // If not in roster, assume available (backward compat)
  if (entry?.available === false) return false;

  // Check client-visibility: agent's provider must be in allowed list
  const provider = getAgentProvider(agentId, config);
  if (provider && !isClientAllowed(provider)) return false;

  return true;
}

/**
 * Get an agent's family from roster.
 * F032: Used for "different family" rule in reviewer matching.
 */
export function getAgentFamily(agentId: string, config?: OfficeClawConfig): string | undefined {
  const roster = getRoster(config);
  return roster[agentId]?.family;
}

/**
 * Check if a agent has a specific role.
 * F032: Used to check if a agent can be a reviewer, architect, etc.
 */
export function agentHasRole(agentId: string, role: string, config?: OfficeClawConfig): boolean {
  const roster = getRoster(config);
  const entry = roster[agentId];
  return entry?.roles.includes(role) ?? false;
}

/**
 * Check if a agent is the lead of its family.
 * F032: Used for "prefer lead" rule in reviewer matching.
 */
export function isAgentLead(agentId: string, config?: OfficeClawConfig): boolean {
  const roster = getRoster(config);
  return roster[agentId]?.lead ?? false;
}

// ── F067: Co-Creator config accessor ────────────────────────────────

/** Default co-creator mention patterns (backward compat when not configured) */
const DEFAULT_CO_CREATOR_MENTION_PATTERNS = ['@co-creator', '@用户'];

let _cachedCoCreator: CoCreatorConfig | null = null;

/**
 * Get coCreator config from office-claw-config.json.
 * Returns a default config with @co-creator/@用户 patterns when not configured.
 */
export function getCoCreatorConfig(config?: OfficeClawConfig): CoCreatorConfig {
  if (_cachedCoCreator && !config) return _cachedCoCreator;

  const cfg = config ?? getCachedConfig();

  // v1 config or no coCreator → return defaults
  if (!cfg || cfg.version === 1 || !cfg.coCreator) {
    return { name: '用户', aliases: [], mentionPatterns: DEFAULT_CO_CREATOR_MENTION_PATTERNS };
  }

  _cachedCoCreator = cfg.coCreator;
  return cfg.coCreator;
}

/**
 * Get all co-creator mention patterns (lowercased, with @ prefix).
 * Always includes @co-creator and @用户 as fallback patterns in addition to configured ones.
 */
export function getCoCreatorMentionPatterns(config?: OfficeClawConfig): readonly string[] {
  const coCreator = getCoCreatorConfig(config);
  const patterns = new Set(coCreator.mentionPatterns.map((p: string) => p.toLowerCase()));
  // Always include legacy patterns for backward compat
  for (const p of DEFAULT_CO_CREATOR_MENTION_PATTERNS) patterns.add(p);
  return [...patterns];
}
