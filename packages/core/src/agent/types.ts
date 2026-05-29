/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Agent Service Types
 * Defines the core contract for agent services in the OfficeClaw platform.
 * Moved from packages/api/src/domains/agents/services/types.ts
 */

import type { AgentId, MessageContent } from '@openjiuwen/relay-shared';
import type { GatewayIdentity } from '@openjiuwen/relay-api-server-contracts';

// ── Provider Profile Types ──
// Minimal runtime profile interfaces that plugins receive via AgentServiceOptions.
// The full CRUD/storage types remain in @openjiuwen/relay-api-server.

export type ProviderProfileProtocol = 'anthropic' | 'openai' | 'google' | 'huawei_maas' | 'acp';
export type ProviderProfileAuthType = 'oauth' | 'api_key' | 'none';
export type ProviderProfileKind = 'builtin' | 'api_key' | 'acp';
export type BuiltinAccountClient = 'anthropic' | 'openai' | 'google' | 'dare' | 'opencode';
export type ACPModelAccessMode = 'self_managed' | 'clowder_default_profile';

export interface RuntimeProviderProfile {
  id: string;
  authType: ProviderProfileAuthType;
  kind: ProviderProfileKind;
  client?: BuiltinAccountClient;
  protocol?: ProviderProfileProtocol;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  modelAccessMode?: ACPModelAccessMode;
  defaultModelProfileRef?: string;
}

export type AcpModelProviderType = 'openai_compatible' | 'bigmodel' | 'minimax' | 'echo';

export interface RuntimeAcpModelProfile {
  id: string;
  displayName: string;
  provider?: AcpModelProviderType;
  model: string;
  baseUrl: string;
  apiKey: string;
  sslVerify?: boolean | null;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  connectTimeoutSeconds?: number;
  headers?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

// ── Token Usage ──

/** Unified token usage type across all providers. */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  contextWindowSize?: number;
  lastTurnInputTokens?: number;
  contextUsedTokens?: number;
  contextResetsAtMs?: number;
}

/** Accumulate token usage — adds numeric fields from `incoming` into `existing` */
export function mergeTokenUsage(existing: TokenUsage | undefined, incoming: TokenUsage): TokenUsage {
  if (!existing) return { ...incoming };
  const result = { ...existing };
  const numericKeys: (keyof TokenUsage)[] = [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'cacheReadTokens',
    'cacheCreationTokens',
    'costUsd',
    'durationMs',
    'durationApiMs',
    'numTurns',
  ];
  for (const key of numericKeys) {
    const val = incoming[key];
    if (val != null) {
      result[key] = ((result[key] as number) ?? 0) + (val as number);
    }
  }
  const latestKeys: (keyof TokenUsage)[] = [
    'contextWindowSize',
    'lastTurnInputTokens',
    'contextUsedTokens',
    'contextResetsAtMs',
  ];
  for (const key of latestKeys) {
    const val = incoming[key];
    if (val != null) {
      result[key] = val;
    }
  }
  return result;
}

// ── Message Types ──

/** Metadata about the provider/model behind an agent message */
export interface MessageMetadata {
  provider: string;
  model: string;
  sessionId?: string;
  usage?: TokenUsage;
  modelVerified?: boolean;
}

/** Correlation fields for audit pipelines. */
export interface AuditContext {
  invocationId: string;
  threadId: string;
  userId: string;
  agentId: AgentId;
}

/** Types of messages that can be yielded from an agent */
export type AgentMessageType =
  | 'session_init'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'done'
  | 'a2a_handoff'
  | 'system_info';

/** A message yielded from an agent during invocation */
export interface AgentMessage {
  type: AgentMessageType;
  agentId: AgentId;
  content?: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  error?: string;
  isFinal?: boolean;
  metadata?: MessageMetadata;
  origin?: 'stream' | 'callback';
  messageId?: string;
  extra?: { crossPost?: { sourceThreadId: string; sourceInvocationId?: string }; targetAgents?: string[] };
  replyTo?: string;
  replyPreview?: { senderAgentId: string | null; content: string; deleted?: true };
  mentionsUser?: boolean;
  invocationId?: string;
  errorCode?: string;
  timestamp: number;
}

// ── CLI Types (subset needed by providers) ──

/** Options passed to CLI spawn functions */
export interface CliSpawnOptions {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Record<string, string | null>;
  timeout?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  invocationId?: string;
  cliSessionId?: string;
  livenessProbe?: {
    sampleIntervalMs?: number;
    softWarningMs?: number;
    stallWarningMs?: number;
    boundedExtensionFactor?: number;
    stallAutoKill?: boolean;
  };
  rawArchivePath?: string;
  semanticCompletionSignal?: AbortSignal;
}

/** A handle to a spawned CLI process */
export interface ChildProcessLike {
  readonly pid: number | undefined;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals): boolean;
}

// ── Agent Service Contract ──

/** Options for invoking an agent */
export interface AgentServiceOptions {
  sessionId?: string;
  resumeSession?: boolean;
  workingDirectory?: string;
  callbackEnv?: Record<string, string>;
  contentBlocks?: readonly MessageContent[];
  uploadDir?: string;
  signal?: AbortSignal;
  auditContext?: AuditContext;
  systemPrompt?: string;
  /** Override CLI spawner (e.g. tmux-based execution) */
  spawnCliOverride?: (options: CliSpawnOptions) => AsyncGenerator<unknown, void, undefined>;
  invocationId?: string;
  cliSessionId?: string;
  livenessProbe?: {
    sampleIntervalMs?: number;
    softWarningMs?: number;
    stallWarningMs?: number;
    boundedExtensionFactor?: number;
    stallAutoKill?: boolean;
  };
  cliConfigArgs?: readonly string[];
  providerProfile?: RuntimeProviderProfile | null;
  acpModelProfile?: RuntimeAcpModelProfile | null;
  gatewayIdentity?: GatewayIdentity;
  memberExtend?: Readonly<Record<string, unknown>>;
}

/** Interface that all agent services must implement */
export interface AgentService {
  invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage>;
}
