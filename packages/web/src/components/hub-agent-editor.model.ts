/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { resolveEmbeddedRuntimeKind } from '@openjiuwen/relay-shared';
import type { AgentData } from '@/hooks/useAgentData';
import type { BuiltinAccountClient, ProfileItem } from './hub-provider-profiles.types';
import type { AgentStrategyEntry, StrategyType } from './hub-strategy-types';

export type ClientValue = 'anthropic' | 'openai' | 'google' | 'dare' | 'opencode' | 'relayclaw' | 'antigravity' | 'acp';
export type SessionChainValue = 'true' | 'false';
export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
export type CodexApprovalPolicy = 'untrusted' | 'on-failure' | 'on-request' | 'never';
export type CodexAuthMode = 'oauth' | 'api_key' | 'auto';

export interface HubAgentEditorFormState {
  agentId: string;
  name: string;
  displayName: string;
  nickname: string;
  avatar: string;
  colorPrimary: string;
  colorSecondary: string;
  mentionPatterns: string;
  roleDescription: string;
  personality: string;
  teamStrengths: string;
  caution: string;
  strengths: string;
  client: ClientValue;
  accountRef: string;
  defaultModel: string;
  commandArgs: string;
  cliConfigArgs: string[];
  ocProviderName: string;
  embeddedAcpExecutablePath?: string;
  embeddedAcpArgs: string;
  embeddedAcpCwd: string;
  embeddedAcpEnvText: string;
  sessionChain: SessionChainValue;
  maxPromptTokens: string;
  maxContextTokens: string;
  maxMessages: string;
  maxContentLengthPerMsg: string;
  /** Optional creation provenance for runtime-created agents. */
  creationSource?: 'experts-plaza';
}

export interface HubAgentEditorDraft {
  client: ClientValue;
  accountRef?: string;
  providerProfileId?: string;
  defaultModel: string;
  commandArgs?: string;
}

export interface StrategyFormState {
  strategy: StrategyType;
  warnThreshold: string;
  actionThreshold: string;
  maxCompressions: string;
  hybridCapable: boolean;
  sessionChainEnabled: boolean;
}

export interface CodexRuntimeSettings {
  sandboxMode: CodexSandboxMode;
  approvalPolicy: CodexApprovalPolicy;
  authMode: CodexAuthMode;
}

export const CLIENT_OPTIONS: Array<{ value: ClientValue; label: string }> = [
  { value: 'anthropic', label: 'Claude' },
  { value: 'openai', label: 'Codex' },
  { value: 'google', label: 'Gemini' },
  { value: 'dare', label: 'Office Agent' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'relayclaw', label: 'Assistant Agent' },
  { value: 'acp', label: 'ACP' },
  { value: 'antigravity', label: 'Antigravity' },
];

export const SESSION_CHAIN_OPTIONS: Array<{ value: SessionChainValue; label: string }> = [
  { value: 'true', label: 'true' },
  { value: 'false', label: 'false' },
];

export const SESSION_STRATEGY_OPTIONS: Array<{ value: StrategyType; label: string }> = [
  { value: 'handoff', label: 'handoff' },
  { value: 'compress', label: 'compress' },
  { value: 'hybrid', label: 'hybrid' },
];

export const CODEX_SANDBOX_OPTIONS: Array<{ value: CodexSandboxMode; label: string }> = [
  { value: 'read-only', label: 'read-only' },
  { value: 'workspace-write', label: 'workspace-write' },
  { value: 'danger-full-access', label: 'danger-full-access' },
];

export const CODEX_APPROVAL_OPTIONS: Array<{ value: CodexApprovalPolicy; label: string }> = [
  { value: 'untrusted', label: 'untrusted' },
  { value: 'on-failure', label: 'on-failure' },
  { value: 'on-request', label: 'on-request' },
  { value: 'never', label: 'never' },
];

export const CODEX_AUTH_MODE_OPTIONS: Array<{ value: CodexAuthMode; label: string }> = [
  { value: 'oauth', label: 'oauth' },
  { value: 'api_key', label: 'api_key' },
  { value: 'auto', label: 'auto' },
];

export const DEFAULT_ANTIGRAVITY_COMMAND_ARGS = '. --remote-debugging-port=9000';
const HUAWEI_MAAS_MODEL_SOURCE_ID = 'huawei-maas';

export function hasEmbeddedAcpRuntime(agent?: Pick<AgentData, 'id' | 'provider' | 'source' | 'embeddedRuntimeKind'> | null): boolean {
  if (!agent) return false;
  return (
    agent.embeddedRuntimeKind === 'agentteams_acp' ||
    resolveEmbeddedRuntimeKind({ id: agent.id, provider: agent.provider, source: agent.source }) === 'agentteams_acp'
  );
}

export function splitMentionPatterns(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function normalizeMentionPattern(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

export function canonicalMentionPattern(agentId: string): string {
  return normalizeMentionPattern(agentId);
}

export function joinTags(tags: string[]): string {
  return tags.join(', ');
}

export function splitCommandArgs(raw: string): string[] {
  const input = raw.trim();
  if (!input) return [];
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  const pushCurrent = () => {
    if (current.length === 0) return;
    args.push(current);
    current = '';
  };

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }
    current += char;
  }
  if (escaping) current += '\\';
  pushCurrent();
  return args;
}

export function splitStrengthTags(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isBuiltinClient(client: ClientValue): client is BuiltinAccountClient {
  return (
    client === 'anthropic' || client === 'openai' || client === 'google' || client === 'dare' || client === 'opencode'
  );
}

function isModelConfigProfile(profile: ProfileItem): boolean {
  return profile.source === 'model_config';
}

function legacyProfileClient(profile: ProfileItem): BuiltinAccountClient | undefined {
  if (profile.client) return profile.client;
  if (profile.oauthLikeClient === 'dare' || profile.oauthLikeClient === 'opencode') return profile.oauthLikeClient;
  const normalizedId = `${profile.id} ${profile.provider ?? ''} ${profile.displayName} ${profile.name}`.toLowerCase();
  if (normalizedId.includes('claude')) return 'anthropic';
  if (normalizedId.includes('codex')) return 'openai';
  if (normalizedId.includes('gemini')) return 'google';
  if (normalizedId.includes('dare')) return 'dare';
  if (normalizedId.includes('opencode')) return 'opencode';
  switch (profile.protocol) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
      return 'openai';
    case 'google':
      return 'google';
    default:
      return undefined;
  }
}

export function builtinAccountIdForClient(client: ClientValue): string | null {
  if (!isBuiltinClient(client)) return null;
  switch (client) {
    case 'anthropic':
      return 'claude';
    case 'openai':
      return 'codex';
    case 'google':
      return 'gemini';
    case 'dare':
      return 'dare';
    case 'opencode':
      return 'opencode';
  }
}

export function filterAccounts(
  client: ClientValue,
  profiles: ProfileItem[],
  options?: { embeddedAcpRuntime?: boolean },
): ProfileItem[] {
  if (options?.embeddedAcpRuntime) {
    return profiles.filter((profile) => {
      if (profile.source === 'model_config') {
        return profile.protocol === 'openai' || profile.protocol === 'huawei_maas';
      }
      return profile.kind !== 'acp' && profile.authType === 'api_key' && profile.protocol === 'openai';
    });
  }
  if (client === 'acp') {
    return profiles.filter((profile) => profile.kind === 'acp');
  }
  const modelConfigProfiles = profiles.filter(isModelConfigProfile);
  if (modelConfigProfiles.length > 0) {
    if (client !== 'dare' && client !== 'relayclaw') return [];
    return modelConfigProfiles.filter((profile) => {
      if (profile.id === HUAWEI_MAAS_MODEL_SOURCE_ID && profile.protocol === 'huawei_maas') return true;
      return profile.protocol === 'openai';
    });
  }
  if (client === 'relayclaw') {
    return profiles.filter((profile) => profile.authType === 'api_key' && profile.protocol === 'openai');
  }
  if (!isBuiltinClient(client)) return [];
  const builtinProfiles = profiles.filter(
    (profile) => profile.authType !== 'api_key' && legacyProfileClient(profile) === client,
  );
  // Gemini CLI only supports builtin Google auth — no API key profiles.
  if (client === 'google') return builtinProfiles;
  const apiKeyProfiles = profiles.filter((profile) => profile.authType === 'api_key');
  return [...builtinProfiles, ...apiKeyProfiles.filter((profile) => !builtinProfiles.includes(profile))];
}

export const filterProfiles = filterAccounts;

export function initialState(agent?: AgentData | null, draft?: HubAgentEditorDraft | null): HubAgentEditorFormState {
  const createDraft = !agent ? draft : null;
  const agentId = agent?.id ?? '';
  const mentionPatterns = agent?.mentionPatterns ?? (agentId ? [canonicalMentionPattern(agentId)] : []);
  const embeddedAcpConfig = agent?.embeddedAcpConfig;
  return {
    agentId,
    name: agent?.name ?? agent?.displayName ?? '',
    displayName: agent?.displayName ?? agent?.name ?? '',
    nickname: agent?.nickname ?? '',
    avatar: agent?.avatar ?? '',
    colorPrimary: agent?.color.primary ?? '#9B7EBD',
    colorSecondary: agent?.color.secondary ?? '#E8DFF5',
    mentionPatterns: joinTags(mentionPatterns),
    roleDescription: agent?.roleDescription ?? '',
    personality: agent?.personality ?? '',
    teamStrengths: agent?.teamStrengths ?? '',
    caution: agent?.caution ?? '',
    strengths: agent?.strengths?.join(', ') ?? '',
    client: (agent?.provider as ClientValue | undefined) ?? createDraft?.client ?? 'anthropic',
    accountRef:
      agent?.accountRef ?? agent?.providerProfileId ?? createDraft?.accountRef ?? createDraft?.providerProfileId ?? '',
    defaultModel: agent?.defaultModel ?? createDraft?.defaultModel ?? '',
    commandArgs: agent?.commandArgs?.join(' ') ?? createDraft?.commandArgs ?? '',
    cliConfigArgs: [...(agent?.cliConfigArgs ?? [])],
    ocProviderName: agent?.ocProviderName ?? '',
    embeddedAcpExecutablePath: embeddedAcpConfig?.executablePath ?? agent?.embeddedAcpExecutablePath ?? '',
    embeddedAcpArgs: embeddedAcpConfig?.args?.join(' ') ?? '',
    embeddedAcpCwd: embeddedAcpConfig?.cwd ?? '',
    embeddedAcpEnvText: embeddedAcpConfig?.env
      ? Object.entries(embeddedAcpConfig.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n')
      : '',
    sessionChain: String(agent?.sessionChain ?? true) as SessionChainValue,
    maxPromptTokens: agent?.contextBudget ? String(agent.contextBudget.maxPromptTokens) : '',
    maxContextTokens: agent?.contextBudget ? String(agent.contextBudget.maxContextTokens) : '',
    maxMessages: agent?.contextBudget ? String(agent.contextBudget.maxMessages) : '',
    maxContentLengthPerMsg: agent?.contextBudget ? String(agent.contextBudget.maxContentLengthPerMsg) : '',
  };
}

export function toStrategyForm(entry: AgentStrategyEntry): StrategyFormState {
  return {
    strategy: entry.effective.strategy,
    warnThreshold: String(entry.effective.thresholds.warn),
    actionThreshold: String(entry.effective.thresholds.action),
    maxCompressions: String(entry.effective.hybrid?.maxCompressions ?? 2),
    hybridCapable: entry.hybridCapable,
    sessionChainEnabled: entry.sessionChainEnabled,
  };
}

export function buildStrategyPayload(strategy: StrategyFormState) {
  const warn = Number.parseFloat(strategy.warnThreshold);
  const action = Number.parseFloat(strategy.actionThreshold);
  if (!Number.isFinite(warn) || !Number.isFinite(action)) {
    throw new Error('Session 阈值必须是数字');
  }
  if (warn >= action) {
    throw new Error('Warn Threshold 必须小于 Action Threshold');
  }

  const payload: Record<string, unknown> = {
    strategy: strategy.strategy,
    thresholds: { warn, action },
  };
  if (strategy.strategy === 'hybrid') {
    const maxCompressions = Number.parseInt(strategy.maxCompressions, 10);
    if (!Number.isFinite(maxCompressions) || maxCompressions <= 0) {
      throw new Error('Max Compressions 必须是正整数');
    }
    payload.hybrid = { maxCompressions };
  }
  return payload;
}

export function toCodexRuntimeSettings(config?: {
  cli?: {
    codexSandboxMode?: CodexSandboxMode;
    codexApprovalPolicy?: CodexApprovalPolicy;
  };
  codexExecution?: {
    authMode?: CodexAuthMode;
  };
}): CodexRuntimeSettings {
  return {
    sandboxMode: config?.cli?.codexSandboxMode ?? 'workspace-write',
    approvalPolicy: config?.cli?.codexApprovalPolicy ?? 'on-request',
    authMode: config?.codexExecution?.authMode ?? 'oauth',
  };
}

export function buildCodexConfigPatches(
  settings: CodexRuntimeSettings,
  baseline: CodexRuntimeSettings,
): Array<{ key: string; value: string }> {
  const patches: Array<{ key: string; value: string }> = [];
  if (settings.sandboxMode !== baseline.sandboxMode) {
    patches.push({ key: 'cli.codexSandboxMode', value: settings.sandboxMode });
  }
  if (settings.approvalPolicy !== baseline.approvalPolicy) {
    patches.push({ key: 'cli.codexApprovalPolicy', value: settings.approvalPolicy });
  }
  if (settings.authMode !== baseline.authMode) {
    patches.push({ key: 'codex.execution.authMode', value: settings.authMode });
  }
  return patches;
}

// Extracted to hub-agent-editor.payload.ts:
// buildAgentPayload, validateModelFormatForClient
export {
  buildAgentPayload,
  validateModelFormatForClient,
} from './hub-agent-editor.payload';
