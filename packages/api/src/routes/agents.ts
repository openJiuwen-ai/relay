/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Cats API Routes
 * GET /api/agents - 获取所有智能体信息
 * GET /api/agents/:id/status - 获取智能体状态
 */

import { resolve } from 'node:path';
import type { CatalogProvider, GatewayIdentity } from '@openjiuwen/relay-api-server-contracts';
import {
  type OfficeClawConfig,
  type OfficeClawConfigEntry,
  type AgentProvider,
  type AgentCreationSource,
  type ContextBudget,
  officeClawRegistry,
  type RosterEntry,
  resolveEmbeddedRuntimeKind,
} from '@openjiuwen/relay-shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { isSeedCat, resolveBoundAccountRefForCat } from '../config/office-claw-account-binding.js';
import { bootstrapAgentCatalog, resolveAgentCatalogPath } from '../config/office-claw-catalog-store.js';
import { getRoster, loadAgentConfig, toAllAgentConfigs } from '../config/office-claw-config-loader.js';
import { resolveProjectTemplatePath } from '../config/project-template-path.js';
import { findProjectModelConfigBinding, HUAWEI_MAAS_MODEL_SOURCE_ID } from '../config/model-config-profiles.js';
import {
  resolveBuiltinClientForProvider,
  validateModelFormatForProvider,
  validateRuntimeProviderBinding,
} from '../config/provider-binding-compat.js';
import {
  resolveRuntimeProviderProfileById,
  resolveRuntimeProviderProfileForClient,
} from '../config/provider-profiles.js';
import {
  createRuntimeCatInCatalog,
  deleteRuntimeCatInCatalog,
  updateRuntimeCatInCatalog,
} from '../config/runtime-office-claw-catalog.js';
import { deleteRuntimeOverride, getRuntimeOverride, setRuntimeOverride } from '../config/session-strategy-overrides.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { embeddedAgentTeamsRuntimeAvailable, resolveEmbeddedAgentTeamsExecutable } from '../utils/agent-teams-bundle.js';
import { isClientAllowed } from '../utils/client-visibility.js';
import { resolveEmbeddedAgentTeamsBinding } from '../utils/embedded-runtime-bindings.js';
import { requireGatewayIdentity, resolveGatewayIdentity } from '../utils/request-identity.js';

const colorSchema = z.object({
  primary: z.string().min(1),
  secondary: z.string().min(1),
});

const contextBudgetSchema = z.object({
  maxPromptTokens: z.number().int().positive(),
  maxContextTokens: z.number().int().positive(),
  maxMessages: z.number().int().positive(),
  maxContentLengthPerMsg: z.number().int().positive(),
});

const cliSchema = z.object({
  command: z.string().min(1),
  outputFormat: z.string().min(1),
  defaultArgs: z.array(z.string().min(1)).optional(),
});

const embeddedAcpConfigSchema = z.object({
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
});

const clientSchema = z.string().min(1).max(64);
const agentIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/, 'agentId must use lowercase letters, numbers, "_" or "-" and start with a letter');

const baseAgentSchema = z.object({
  agentId: agentIdSchema,
  name: z.string().min(1),
  displayName: z.string().min(1),
  nickname: z.string().optional(),
  avatar: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().min(1).optional(),
  ),
  color: colorSchema,
  mentionPatterns: z.array(z.string().min(1)).min(1),
  accountRef: z.string().min(1).optional(),
  providerProfileId: z.string().min(1).optional(),
  contextBudget: contextBudgetSchema.optional(),
  roleDescription: z.string().min(1),
  personality: z.string().optional(),
  teamStrengths: z.string().optional(),
  caution: z.string().nullable().optional(),
  strengths: z.array(z.string().min(1)).optional(),
  sessionChain: z.boolean().optional(),
  /** Optional creation provenance for runtime-created agents. */
  creationSource: z.enum(['experts-plaza']).optional(),
  extend: z.record(z.string(), z.unknown()).optional(),
});

const createNormalAgentSchema = baseAgentSchema.extend({
  client: clientSchema,
  defaultModel: z.string().min(1),
  mcpSupport: z.boolean().optional(),
  cli: cliSchema.optional(),
  cliConfigArgs: z.array(z.string().min(1)).optional(),
  ocProviderName: z.string().min(1).optional(),
  embeddedAcpExecutablePath: z.string().min(1).optional(),
  embeddedAcpConfig: embeddedAcpConfigSchema.optional(),
  skills: z.array(z.string().min(1)).optional(),
});

const createAntigravityAgentSchema = baseAgentSchema.extend({
  client: z.literal('antigravity'),
  defaultModel: z.string().min(1),
  commandArgs: z.array(z.string().min(1)).min(1).optional(),
});

const createAgentSchema = z.union([createAntigravityAgentSchema, createNormalAgentSchema]);

const updateAgentSchema = z.object({
  name: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  nickname: z.string().optional(),
  avatar: z.string().min(1).optional(),
  color: colorSchema.optional(),
  mentionPatterns: z.array(z.string().min(1)).min(1).optional(),
  accountRef: z.string().min(1).nullable().optional(),
  providerProfileId: z.string().min(1).nullable().optional(),
  contextBudget: contextBudgetSchema.nullable().optional(),
  roleDescription: z.string().min(1).optional(),
  personality: z.string().optional(),
  teamStrengths: z.string().optional(),
  caution: z.string().nullable().optional(),
  strengths: z.array(z.string().min(1)).optional(),
  sessionChain: z.boolean().optional(),
  available: z.boolean().optional(),
  client: clientSchema.optional(),
  defaultModel: z.string().min(1).optional(),
  mcpSupport: z.boolean().optional(),
  cli: cliSchema.optional(),
  commandArgs: z.array(z.string().min(1)).optional(),
  cliConfigArgs: z.array(z.string().min(1)).optional(),
  ocProviderName: z.string().min(1).nullable().optional(),
  embeddedAcpExecutablePath: z.string().min(1).nullable().optional(),
  embeddedAcpConfig: embeddedAcpConfigSchema.nullable().optional(),
  extend: z.record(z.string(), z.unknown()).nullable().optional(),
  skills: z.array(z.string().min(1)).nullable().optional(),
});

function resolveProjectRoot(): string {
  return resolveActiveProjectRoot();
}

function resolveEmbeddedAcpExecutableOverride(input: {
  embeddedAcpExecutablePath?: string | null;
  embeddedAcpConfig?: { executablePath?: string } | null;
}): string | null | undefined {
  if (input.embeddedAcpExecutablePath !== undefined) return input.embeddedAcpExecutablePath;
  const nested = input.embeddedAcpConfig?.executablePath?.trim();
  return nested ? nested : undefined;
}


type AgentSource = 'seed' | 'runtime';

interface AgentResponseMetadata {
  roster: RosterEntry | null;
  source: AgentSource;
}

function buildAgentResponseMetadataResolver(projectRoot: string) {
  const templatePath = resolveProjectTemplatePath(projectRoot);
  let seedAgentIds = new Set<string>();
  try {
    seedAgentIds = new Set(Object.keys(toAllAgentConfigs(loadAgentConfig(templatePath))));
  } catch {
    seedAgentIds = new Set();
  }

  let roster: Record<string, RosterEntry> = {};
  try {
    bootstrapAgentCatalog(projectRoot, templatePath);
    roster = getRoster(loadAgentConfig(resolveAgentCatalogPath(projectRoot)));
  } catch {
    try {
      roster = getRoster(loadAgentConfig(templatePath));
    } catch {
      roster = {};
    }
  }

  return (agentId: string): AgentResponseMetadata => ({
    roster: roster[agentId] ?? null,
    source: seedAgentIds.has(agentId) ? 'seed' : 'runtime',
  });
}

function resolveEmbeddedRuntimeValidation(projectRoot: string, agentId: string, client: AgentProvider) {
  const source: AgentSource = isSeedCat(projectRoot, agentId) ? 'seed' : 'runtime';
  return resolveEmbeddedRuntimeKind({ id: agentId, provider: client, source });
}

function defaultCliForClient(client: AgentProvider): { command: string; outputFormat: string } {
  switch (client) {
    case 'anthropic':
      return { command: 'claude', outputFormat: 'stream-json' };
    case 'openai':
      return { command: 'codex', outputFormat: 'json' };
    case 'google':
      return { command: 'gemini', outputFormat: 'stream-json' };
    case 'dare':
      return { command: 'dare', outputFormat: 'json' };
    case 'opencode':
      return { command: 'opencode', outputFormat: 'json' };
    case 'antigravity':
      return { command: 'antigravity', outputFormat: 'json' };
    case 'a2a':
      return { command: 'a2a', outputFormat: 'json' };
    case 'relayclaw':
      return { command: 'vendor/jiuwenclaw.exe', outputFormat: 'json' };
    case 'acp':
      return { command: 'relay-teams', outputFormat: 'json' };
    default:
      return { command: client, outputFormat: 'json' };
  }
}

function resolveAccountRef(body: {
  accountRef?: string | null;
  providerProfileId?: string | null;
}): string | undefined | null {
  if (body.providerProfileId !== undefined) return body.providerProfileId;
  if (body.accountRef !== undefined) return body.accountRef;
  return undefined;
}

function buildEffectiveAccountRefResolver(projectRoot: string) {
  const inheritedBindingCache = new Map<string, Promise<string | undefined>>();

  return async (agent: OfficeClawConfigEntry & { contextBudget?: ContextBudget }): Promise<string | undefined> => {
    const embeddedRuntimeKind = resolveEmbeddedRuntimeKind({
      id: agent.id,
      provider: agent.provider,
      source: isSeedCat(projectRoot, agent.id) ? 'seed' : 'runtime',
    });
    const explicitAccountRef = resolveBoundAccountRefForCat(projectRoot, agent.id, agent);
    if (embeddedRuntimeKind === 'agentteams_acp') {
      const trimmedAccountRef = explicitAccountRef?.trim();
      if (trimmedAccountRef) {
        const modelConfigBinding = await findProjectModelConfigBinding(projectRoot, trimmedAccountRef);
        if (modelConfigBinding) return trimmedAccountRef;
      }
      return (await resolveEmbeddedAgentTeamsBinding(projectRoot, explicitAccountRef))?.accountRef;
    }
    if (explicitAccountRef !== undefined) return explicitAccountRef;
    if (!isSeedCat(projectRoot, agent.id)) return agent.accountRef;

    const builtinClient = resolveBuiltinClientForProvider(agent.provider);
    if (!builtinClient) return agent.accountRef;

    let runtimeProfilePromise = inheritedBindingCache.get(builtinClient);
    if (!runtimeProfilePromise) {
      runtimeProfilePromise = resolveRuntimeProviderProfileForClient(projectRoot, builtinClient).then(
        (profile) => profile?.id,
      );
      inheritedBindingCache.set(builtinClient, runtimeProfilePromise);
    }
    return (await runtimeProfilePromise) ?? agent.accountRef;
  };
}

async function validateAccountBindingOrThrow(
  projectRoot: string,
  agentId: string,
  client: AgentProvider,
  accountRef?: string | null,
  defaultModel?: string | null,
  ocProviderName?: string | null,
  embeddedAcpExecutablePath?: string | null,
): Promise<void> {
  const embeddedRuntimeKind = resolveEmbeddedRuntimeValidation(projectRoot, agentId, client);
  const embeddedAcpRuntime = embeddedRuntimeKind === 'agentteams_acp';
  const trimmedAccountRef = accountRef?.trim();
  if (client === 'antigravity' && trimmedAccountRef) {
    throw new Error('antigravity client does not support accountRef');
  }
  if (client !== 'antigravity' && !trimmedAccountRef) {
    throw new Error(`client "${client}" requires a provider binding`);
  }
  if (!trimmedAccountRef) return;
  const modelConfigBinding = await findProjectModelConfigBinding(projectRoot, trimmedAccountRef);
  if (modelConfigBinding) {
    const isHuaweiMaaSBinding =
      modelConfigBinding.id === HUAWEI_MAAS_MODEL_SOURCE_ID && modelConfigBinding.protocol === 'huawei_maas';
    const isCustomOpenAiBinding = modelConfigBinding.protocol === 'openai';
    if (!isHuaweiMaaSBinding && !isCustomOpenAiBinding) {
      throw new Error(`model config source "${trimmedAccountRef}" is not supported yet`);
    }
    if (embeddedAcpRuntime) {
      if (!embeddedAgentTeamsRuntimeAvailable(projectRoot, embeddedAcpExecutablePath)) {
        throw new Error(
          `built-in Agent Teams runtime is not ready: missing ${resolveEmbeddedAgentTeamsExecutable(projectRoot, embeddedAcpExecutablePath)}`,
        );
      }
      if (
        defaultModel?.trim() &&
        modelConfigBinding.models.length &&
        !modelConfigBinding.models.includes(defaultModel.trim())
      ) {
        throw new Error(`model "${defaultModel.trim()}" is not available on provider "${trimmedAccountRef}"`);
      }
      return;
    }
    if (client !== 'dare' && client !== 'relayclaw') {
      throw new Error(`client "${client}" does not support model config source "${trimmedAccountRef}"`);
    }
    if (
      defaultModel?.trim() &&
      modelConfigBinding.models.length &&
      !modelConfigBinding.models.includes(defaultModel.trim())
    ) {
      throw new Error(`model "${defaultModel.trim()}" is not available on provider "${trimmedAccountRef}"`);
    }
    return;
  }
  const runtimeProfile = await resolveRuntimeProviderProfileById(projectRoot, trimmedAccountRef);
  if (!runtimeProfile) {
    throw new Error(`provider "${trimmedAccountRef}" not found`);
  }
  if (embeddedAcpRuntime && !embeddedAgentTeamsRuntimeAvailable(projectRoot, embeddedAcpExecutablePath)) {
    throw new Error(
      `built-in Agent Teams runtime is not ready: missing ${resolveEmbeddedAgentTeamsExecutable(projectRoot, embeddedAcpExecutablePath)}`,
    );
  }
  const compatibilityError = validateRuntimeProviderBinding(client, runtimeProfile, defaultModel, {
    embeddedAcpRuntime,
  });
  if (compatibilityError) {
    throw new Error(compatibilityError);
  }
  const modelFormatError = validateModelFormatForProvider(client, defaultModel, runtimeProfile.kind, ocProviderName);
  if (modelFormatError) {
    throw new Error(modelFormatError);
  }
}

async function toAgentResponse(
  agent: OfficeClawConfigEntry & { contextBudget?: ContextBudget },
  metadata: AgentResponseMetadata,
  resolveEffectiveAccountRef: (agent: OfficeClawConfigEntry & { contextBudget?: ContextBudget }) => Promise<string | undefined>,
  storedMentionPatterns?: readonly string[],
) {
  return {
    id: agent.id,
    name: agent.name,
    displayName: agent.displayName,
    nickname: agent.nickname,
    color: agent.color,
    mentionPatterns: storedMentionPatterns ? [...storedMentionPatterns] : agent.mentionPatterns,
    breedId: agent.breedId,
    accountRef: await resolveEffectiveAccountRef(agent),
    provider: agent.provider,
    defaultModel: agent.defaultModel,
    contextBudget: agent.contextBudget,
    avatar: agent.avatar,
    roleDescription: agent.roleDescription,
    personality: agent.personality,
    creationSource: agent.creationSource,
    teamStrengths: agent.teamStrengths,
    caution: agent.caution,
    strengths: agent.strengths,
    sessionChain: agent.sessionChain,
    commandArgs: agent.commandArgs,
    cliConfigArgs: agent.cliConfigArgs,
    ocProviderName: agent.ocProviderName,
    embeddedAcpExecutablePath: agent.embeddedAcpExecutablePath,
    embeddedAcpConfig: agent.embeddedAcpConfig,
    extend: agent.extend,
    variantLabel: agent.variantLabel ?? undefined,
    isDefaultVariant: agent.isDefaultVariant ?? undefined,
    breedDisplayName: agent.breedDisplayName ?? undefined,
    embeddedRuntimeKind:
      resolveEmbeddedRuntimeKind({
        id: agent.id,
        provider: agent.provider,
        source: metadata.source,
      }) ?? undefined,
    mcpSupport: agent.mcpSupport,
    expert: agent.expert,
    skills: agent.skills,
    roster: metadata.roster
      ? {
          family: metadata.roster.family,
          roles: [...metadata.roster.roles],
          lead: metadata.roster.lead,
          available: metadata.roster.available,
          evaluation: metadata.roster.evaluation,
        }
      : null,
    source: metadata.source,
  };
}

function resolveMemberLabel(existingId: string, existingConfig: OfficeClawConfigEntry): string {
  const displayName = existingConfig.displayName?.trim();
  if (displayName) return displayName;
  const name = existingConfig.name?.trim();
  if (name) return name;
  const nickname = existingConfig.nickname?.trim();
  if (nickname) return nickname;
  return existingId;
}

function getStoredMentionPatterns(catalog: OfficeClawConfig): Record<string, readonly string[]> {
  const result: Record<string, readonly string[]> = {};
  for (const breed of catalog.breeds) {
    for (const variant of breed.variants) {
      const agentId = variant.agentId ?? breed.agentId;
      result[agentId] =
        variant.mentionPatterns && variant.mentionPatterns.length > 0
          ? variant.mentionPatterns
          : variant.id === breed.defaultVariantId
            ? breed.mentionPatterns
            : [`@${agentId}`];
    }
  }
  return result;
}

function loadConfigsForValidation(projectRoot: string): Record<string, OfficeClawConfigEntry> {
  const templatePath = resolveProjectTemplatePath(projectRoot);
  try {
    bootstrapAgentCatalog(projectRoot, templatePath);
    return toAllAgentConfigs(loadAgentConfig(resolveAgentCatalogPath(projectRoot)));
  } catch {
    return toAllAgentConfigs(loadAgentConfig(templatePath));
  }
}

function normalizeNameForCompare(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function findNameConflict(
  allConfigs: Record<string, OfficeClawConfigEntry>,
  candidateNames: Array<string | null | undefined>,
  skipId?: string,
): { existingId: string; existingConfig: OfficeClawConfigEntry; conflictValue: string } | null {
  const normalizedCandidates = candidateNames
    .map((value) => value?.trim() ?? '')
    .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index);

  if (normalizedCandidates.length === 0) return null;

  for (const candidate of normalizedCandidates) {
    const normalizedCandidate = normalizeNameForCompare(candidate);
    for (const [existingId, existingConfig] of Object.entries(allConfigs)) {
      if (skipId && existingId === skipId) continue;
      const existingNames = [existingConfig.name, existingConfig.displayName];
      if (existingNames.some((existingName) => normalizeNameForCompare(existingName) === normalizedCandidate)) {
        return { existingId, existingConfig, conflictValue: candidate };
      }
    }
  }

  return null;
}

async function reconcileAgentRegistry(
  provider: CatalogProvider,
  identity: GatewayIdentity,
  onCatalogChanged?: (agents: Record<string, OfficeClawConfigEntry>) => Promise<void> | void,
) {
  const { catalog } = await provider.readCatalog(identity);
  const runtimeCats = toAllAgentConfigs(catalog);
  await onCatalogChanged?.(runtimeCats);
  return runtimeCats;
}

interface CatsRoutesOptions {
  onCatalogChanged?: (agents: Record<string, OfficeClawConfigEntry>) => Promise<void> | void;
  catalogProvider?: CatalogProvider;
}

function createFileRouteCatalogProvider(projectRoot: string): CatalogProvider {
  return {
    id: 'file-route-fallback',
    async readCatalog(_identity: GatewayIdentity) {
      const templatePath = resolveProjectTemplatePath(projectRoot);
      bootstrapAgentCatalog(projectRoot, templatePath);
      return { catalog: loadAgentConfig(resolveAgentCatalogPath(projectRoot)) };
    },
    async writeCatalog(_identity: GatewayIdentity, catalog: OfficeClawConfig) {
      const { writeAndValidateCatalog } = await import('../config/runtime-office-claw-catalog.js');
      writeAndValidateCatalog(projectRoot, catalog);
    },
  };
}

async function resolveCatalogProvider(
  optionsProvider: CatalogProvider | undefined,
  projectRoot: string,
): Promise<CatalogProvider> {
  return optionsProvider ?? createFileRouteCatalogProvider(projectRoot);
}

async function resolveCatalogIdentity(request: Parameters<typeof resolveGatewayIdentity>[0]): Promise<GatewayIdentity> {
  return requireGatewayIdentity(request);
}

async function readCatalogConfigs(
  provider: CatalogProvider,
  identity: GatewayIdentity,
): Promise<Record<string, OfficeClawConfigEntry>> {
  const members = await provider.listRoutableMembers?.(identity);
  if (members) {
    return Object.fromEntries(members.map((member) => [member.agentId, member.config]));
  }
  const { catalog } = await provider.readCatalog(identity);
  return toAllAgentConfigs(catalog);
}

function withLegacyAgentPayload<T extends Record<string, unknown>>(
  key: 'agent' | 'agents',
  value: T | T[],
  rest: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    [key]: value,
    [key === 'agent' ? 'cat' : 'cats']: value,
    ...rest,
  };
}

export const catsRoutes: FastifyPluginAsync<CatsRoutesOptions> = async (app, opts) => {
  // GET /api/agents - 获取所有智能体配置（按 client-visibility 过滤）
  app.get('/api/agents', async (request, reply) => {
    const projectRoot = resolveProjectRoot();
    const catalogProvider = await resolveCatalogProvider(opts.catalogProvider, projectRoot);
    let identity: GatewayIdentity;
    try {
      identity = await resolveCatalogIdentity(request);
    } catch {
      reply.status(401);
      return { error: 'Authentication required' };
    }
    const snapshot = await catalogProvider.readCatalog(identity);
    const storedMentionPatterns = getStoredMentionPatterns(snapshot.catalog);
    const resolveMetadata = buildAgentResponseMetadataResolver(projectRoot);
    const resolveEffectiveAccountRef = buildEffectiveAccountRefResolver(projectRoot);
    const allCats = Object.values(toAllAgentConfigs(snapshot.catalog));
    const visibleCats = allCats.filter((agent) => isClientAllowed(agent.provider));
    const agents = await Promise.all(
      visibleCats.map((agent) =>
        toAgentResponse(agent, resolveMetadata(agent.id), resolveEffectiveAccountRef, storedMentionPatterns[agent.id]),
      ),
    );
    return withLegacyAgentPayload('agents', agents);
  });

  app.post('/api/agents', async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }

    const projectRoot = resolveProjectRoot();
    const catalogProvider = await resolveCatalogProvider(opts.catalogProvider, projectRoot);
    let identity: GatewayIdentity;
    try {
      identity = await resolveCatalogIdentity(request);
    } catch {
      reply.status(401);
      return { error: 'Authentication required' };
    }
    const body = parsed.data;
    const allConfigs = await readCatalogConfigs(catalogProvider, identity);

    const nameConflict = findNameConflict(allConfigs, [body.name, body.displayName]);
    if (nameConflict) {
      reply.status(400);
      return { error: `名称 "${nameConflict.conflictValue}" 已被使用` };
    }

    // Validate alias uniqueness across all existing members
    if (body.mentionPatterns?.length) {
      for (const pattern of body.mentionPatterns) {
        const normalized = pattern.toLowerCase();
        for (const [existingId, existingConfig] of Object.entries(allConfigs)) {
          if (existingConfig.mentionPatterns.some((p: string) => p.toLowerCase() === normalized)) {
            reply.status(400);
            return { error: `别名 "${pattern}" 已被成员 "${resolveMemberLabel(existingId, existingConfig)}" 使用` };
          }
        }
      }
    }

    const accountRef = resolveAccountRef(body);
    try {
      const ocProviderNameForValidation = 'ocProviderName' in body ? body.ocProviderName : undefined;
      const embeddedAcpExecutablePathForValidation = resolveEmbeddedAcpExecutableOverride({
        embeddedAcpExecutablePath: 'embeddedAcpExecutablePath' in body ? body.embeddedAcpExecutablePath : undefined,
        embeddedAcpConfig: 'embeddedAcpConfig' in body ? body.embeddedAcpConfig : undefined,
      });
      await validateAccountBindingOrThrow(
        projectRoot,
        body.agentId,
        body.client,
        accountRef,
        body.defaultModel,
        ocProviderNameForValidation,
        embeddedAcpExecutablePathForValidation,
      );
      const resolvedAvatar = body.avatar ?? '/avatars/default.png';
      const snapshot = await catalogProvider.readCatalog(identity);
      const baseInput = {
        agentId: body.agentId,
        name: body.name,
        displayName: body.displayName,
        nickname: body.nickname,
        avatar: resolvedAvatar,
        color: body.color,
        mentionPatterns: body.mentionPatterns,
        ...(accountRef !== undefined ? { accountRef: accountRef ?? undefined } : {}),
        contextBudget: body.contextBudget,
        roleDescription: body.roleDescription,
        personality: body.personality,
        ...(body.creationSource ? { creationSource: body.creationSource as AgentCreationSource } : {}),
        teamStrengths: body.teamStrengths,
        caution: body.caution,
        strengths: body.strengths,
        sessionChain: body.sessionChain,
        ...(body.extend !== undefined ? { extend: body.extend } : {}),
        ...(('skills' in body && body.skills) ? { skills: body.skills } : {}),
      };
      let nextCatalog: OfficeClawConfig;
      if (body.client === 'antigravity') {
        const ag = body as z.infer<typeof createAntigravityAgentSchema>;
        nextCatalog = createRuntimeCatInCatalog(snapshot.catalog, {
          ...baseInput,
          provider: 'antigravity',
          defaultModel: ag.defaultModel,
          mcpSupport: false,
          cli: {
            ...defaultCliForClient('antigravity'),
            ...(ag.commandArgs ? { defaultArgs: ag.commandArgs } : {}),
          },
          commandArgs: ag.commandArgs,
        });
      } else {
        const nb = body as z.infer<typeof createNormalAgentSchema>;
        nextCatalog = createRuntimeCatInCatalog(snapshot.catalog, {
          ...baseInput,
          provider: nb.client,
          defaultModel: nb.defaultModel,
          mcpSupport:
            nb.mcpSupport ??
            (nb.client === 'anthropic' ||
              nb.client === 'acp' ||
              nb.client === 'openai' ||
              nb.client === 'google' ||
              nb.client === 'opencode'),
          cli: nb.cli ?? defaultCliForClient(nb.client),
          ...(nb.cliConfigArgs ? { cliConfigArgs: nb.cliConfigArgs } : {}),
          ...(nb.ocProviderName ? { ocProviderName: nb.ocProviderName } : {}),
          ...(nb.embeddedAcpExecutablePath ? { embeddedAcpExecutablePath: nb.embeddedAcpExecutablePath } : {}),
          ...(nb.embeddedAcpConfig ? { embeddedAcpConfig: nb.embeddedAcpConfig } : {}),
        });
      }
      await catalogProvider.writeCatalog(identity, nextCatalog);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply.status(400);
      return { error: message };
    }

    const storedMentionPatterns = getStoredMentionPatterns((await catalogProvider.readCatalog(identity)).catalog);
    const resolved = await reconcileAgentRegistry(catalogProvider, identity, opts.onCatalogChanged);
    const agent = resolved[body.agentId];
    const metadata = buildAgentResponseMetadataResolver(projectRoot);
    const resolveEffectiveAccountRef = buildEffectiveAccountRefResolver(projectRoot);
    reply.status(201);
    return withLegacyAgentPayload(
      'agent',
      await toAgentResponse(agent, metadata(agent.id), resolveEffectiveAccountRef, storedMentionPatterns[agent.id]),
      { updatedBy: identity.userId },
    );
  });

  app.patch<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const parsed = updateAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }

    const body = parsed.data;
    const projectRoot = resolveProjectRoot();
    const catalogProvider = await resolveCatalogProvider(opts.catalogProvider, projectRoot);
    let identity: GatewayIdentity;
    try {
      identity = await resolveCatalogIdentity(request);
    } catch {
      reply.status(401);
      return { error: 'Authentication required' };
    }
    const allConfigs = await readCatalogConfigs(catalogProvider, identity);

    const nameConflict = findNameConflict(allConfigs, [body.name, body.displayName], request.params.id);
    if (nameConflict) {
      reply.status(400);
      return { error: `名称 "${nameConflict.conflictValue}" 已被使用` };
    }

    // Validate alias uniqueness when mentionPatterns are being updated
    if (body.mentionPatterns?.length) {
      for (const pattern of body.mentionPatterns) {
        const normalized = pattern.toLowerCase();
        for (const [existingId, existingConfig] of Object.entries(allConfigs)) {
          if (existingId === request.params.id) continue; // skip self
          if (existingConfig.mentionPatterns.some((p: string) => p.toLowerCase() === normalized)) {
            reply.status(400);
            return { error: `别名 "${pattern}" 已被成员 "${resolveMemberLabel(existingId, existingConfig)}" 使用` };
          }
        }
      }
    }

    const resolveEffectiveAccountRef = buildEffectiveAccountRefResolver(projectRoot);
    const currentCat = allConfigs[request.params.id];
    if (!currentCat) {
      reply.status(404);
      return { error: `Cat "${request.params.id}" not found` };
    }
    const effectiveClient = body.client ?? currentCat.provider;
    const nextAccountRef = resolveAccountRef(body);
    const currentEffectiveAccountRef = await resolveEffectiveAccountRef(currentCat);
    const effectiveAccountRef =
      nextAccountRef !== undefined ? (nextAccountRef ?? undefined) : currentEffectiveAccountRef;
    const effectiveDefaultModel = body.defaultModel !== undefined ? body.defaultModel : currentCat.defaultModel;
    const nextEmbeddedAcpExecutablePath = resolveEmbeddedAcpExecutableOverride(body);
    const effectiveEmbeddedAcpExecutablePath =
      nextEmbeddedAcpExecutablePath !== undefined ? nextEmbeddedAcpExecutablePath : currentCat.embeddedAcpExecutablePath;
    const providerConfigTouched =
      body.client !== undefined ||
      body.defaultModel !== undefined ||
      nextAccountRef !== undefined ||
      body.ocProviderName !== undefined ||
      body.embeddedAcpExecutablePath !== undefined ||
      body.embeddedAcpConfig !== undefined;

    if (providerConfigTouched) {
      try {
        const effectiveOcProviderName =
          body.ocProviderName !== undefined ? body.ocProviderName : currentCat.ocProviderName;
        await validateAccountBindingOrThrow(
          projectRoot,
          request.params.id,
          effectiveClient,
          effectiveAccountRef,
          effectiveDefaultModel,
          effectiveOcProviderName,
          effectiveEmbeddedAcpExecutablePath,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        reply.status(400);
        return { error: message };
      }
    }

    try {
      const snapshot = await catalogProvider.readCatalog(identity);
      const hasCommandArgsPatch = body.commandArgs !== undefined;
      const nextCommandArgs = body.commandArgs ?? [];
      const antigravityCliPatch =
        body.client === 'antigravity' || (currentCat.provider === 'antigravity' && hasCommandArgsPatch)
          ? {
              cli: {
                ...defaultCliForClient('antigravity'),
                ...(hasCommandArgsPatch && nextCommandArgs.length > 0 ? { defaultArgs: nextCommandArgs } : {}),
              },
            }
          : {};
      const nextCatalog = updateRuntimeCatInCatalog(snapshot.catalog, request.params.id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
        ...(body.avatar !== undefined ? { avatar: body.avatar } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.mentionPatterns !== undefined ? { mentionPatterns: body.mentionPatterns } : {}),
        ...(nextAccountRef !== undefined ? { accountRef: nextAccountRef } : {}),
        ...(body.contextBudget !== undefined ? { contextBudget: body.contextBudget } : {}),
        ...(body.roleDescription !== undefined ? { roleDescription: body.roleDescription } : {}),
        ...(body.personality !== undefined ? { personality: body.personality } : {}),
        ...(body.teamStrengths !== undefined ? { teamStrengths: body.teamStrengths } : {}),
        ...(body.caution !== undefined ? { caution: body.caution } : {}),
        ...(body.strengths !== undefined ? { strengths: body.strengths } : {}),
        ...(body.sessionChain !== undefined ? { sessionChain: body.sessionChain } : {}),
        ...(body.client !== undefined ? { provider: body.client } : {}),
        ...(body.defaultModel !== undefined ? { defaultModel: body.defaultModel } : {}),
        ...(body.mcpSupport !== undefined ? { mcpSupport: body.mcpSupport } : {}),
        ...(hasCommandArgsPatch
          ? {
              ...antigravityCliPatch,
              commandArgs: body.commandArgs,
            }
          : {}),
        ...(!hasCommandArgsPatch ? antigravityCliPatch : {}),
        ...(body.cli !== undefined ? { cli: body.cli } : {}),
        ...(body.available !== undefined ? { available: body.available } : {}),
        ...(body.cliConfigArgs !== undefined ? { cliConfigArgs: body.cliConfigArgs } : {}),
        ...(body.ocProviderName !== undefined
          ? body.ocProviderName === null
            ? { ocProviderName: undefined }
            : { ocProviderName: body.ocProviderName }
          : {}),
        ...(body.embeddedAcpExecutablePath !== undefined
          ? body.embeddedAcpExecutablePath === null
            ? { embeddedAcpExecutablePath: undefined }
            : { embeddedAcpExecutablePath: body.embeddedAcpExecutablePath }
          : {}),
        ...(body.embeddedAcpConfig !== undefined
          ? body.embeddedAcpConfig === null
            ? { embeddedAcpConfig: null }
            : { embeddedAcpConfig: body.embeddedAcpConfig }
          : {}),
        ...(body.extend !== undefined ? { extend: body.extend } : {}),
        ...(body.skills !== undefined ? { skills: body.skills } : {}),
      });
      await catalogProvider.writeCatalog(identity, nextCatalog);
      const storedMentionPatterns = getStoredMentionPatterns((await catalogProvider.readCatalog(identity)).catalog);
      const resolved = await reconcileAgentRegistry(catalogProvider, identity, opts.onCatalogChanged);
      const agent = resolved[request.params.id];
      const metadata = buildAgentResponseMetadataResolver(projectRoot);
      return withLegacyAgentPayload(
        'agent',
        await toAgentResponse(agent, metadata(agent.id), resolveEffectiveAccountRef, storedMentionPatterns[agent.id]),
        { updatedBy: identity.userId },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not found/i.test(message)) {
        reply.status(404);
      } else {
        reply.status(400);
      }
      return { error: message };
    }
  });

  app.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const projectRoot = resolveProjectRoot();
    const catalogProvider = await resolveCatalogProvider(opts.catalogProvider, projectRoot);
    let identity: GatewayIdentity;
    try {
      identity = await resolveCatalogIdentity(request);
    } catch {
      reply.status(401);
      return { error: 'Authentication required' };
    }
    const allConfigs = await readCatalogConfigs(catalogProvider, identity);
    const currentCat = allConfigs[request.params.id];
    if (!currentCat) {
      reply.status(404);
      return { error: `Cat "${request.params.id}" not found` };
    }
    const metadata = buildAgentResponseMetadataResolver(projectRoot);
    if (metadata(request.params.id).source === 'seed') {
      reply.status(409);
      return { error: 'cannot delete seed agent' };
    }
    const overrideBackup = getRuntimeOverride(request.params.id);
    try {
      await deleteRuntimeOverride(request.params.id);
      try {
        const snapshot = await catalogProvider.readCatalog(identity);
        const nextCatalog = deleteRuntimeCatInCatalog(snapshot.catalog, request.params.id);
        await catalogProvider.writeCatalog(identity, nextCatalog);
      } catch (err) {
        if (overrideBackup) {
          await setRuntimeOverride(request.params.id, overrideBackup);
        }
        throw err;
      }
      await reconcileAgentRegistry(catalogProvider, identity, opts.onCatalogChanged);
      return { deleted: true, id: request.params.id, updatedBy: identity.userId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/not found/i.test(message)) {
        reply.status(404);
      } else if (/cannot delete seed agent/i.test(message)) {
        reply.status(409);
      } else {
        reply.status(400);
      }
      return { error: message };
    }
  });

  // GET /api/agents/:id/status - 获取智能体状态
  app.get<{ Params: { id: string } }>('/api/agents/:id/status', async (request, reply) => {
    const { id } = request.params;
    const projectRoot = resolveProjectRoot();
    const catalogProvider = await resolveCatalogProvider(opts.catalogProvider, projectRoot);
    let identity: GatewayIdentity;
    try {
      identity = await resolveCatalogIdentity(request);
    } catch {
      reply.status(401);
      return { error: 'Authentication required' };
    }
    const agent = (await readCatalogConfigs(catalogProvider, identity))[id];

    if (!agent) {
      reply.status(404);
      return { error: 'Cat not found' };
    }

    // Cat status is currently tracked via WebSocket events (ThinkingIndicator/ParallelStatusBar).
    // This endpoint returns placeholder data; Redis-backed polling status is a future enhancement.
    // See: InvocationTracker for per-thread tracking, not per-agent.
    return {
      id: agent.id,
      displayName: agent.displayName,
      status: 'idle',
      lastActive: Date.now(),
    };
  });
};

