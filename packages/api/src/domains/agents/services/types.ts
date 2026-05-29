/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Agent Service Types
 * Agent 服务的共享类型定义
 */

import type { AgentId, AgentTaskContextPayload, ErrorFallbackMetadata, MessageContent } from '@openjiuwen/relay-shared';
import type { GatewayIdentity } from '@openjiuwen/relay-api-server-contracts';
import type { RuntimeAcpModelProfile } from '../../../config/acp-model-profiles.js';
import type { RuntimeProviderProfile } from '../../../config/provider-profiles.js';
import type { CliSpawnOptions } from '../../../utils/cli-types.js';

// TokenUsage and MessageMetadata are now canonical in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type { MessageMetadata, TokenUsage } from '@openjiuwen/relay-api-server-contracts/storage';

import type { MessageMetadata, TokenUsage } from '@openjiuwen/relay-api-server-contracts/storage';

/** F8: Accumulate token usage — adds numeric fields from `incoming` into `existing` */
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
  // Non-aggregating contextual fields should keep the most recent snapshot.
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

/**
 * Correlation fields used by audit pipelines to connect service-level events.
 */
export interface AuditContext {
  invocationId: string;
  threadId: string;
  userId: string;
  agentId: AgentId;
  traceId?: string;
}

/**
 * Types of messages that can be yielded from an agent
 */
export type AgentMessageType =
  | 'session_init'
  | 'text'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'done'
  | 'a2a_handoff'
  | 'system_info'; // budget warnings, cancel feedback, extraction progress, thinking

/**
 * A message yielded from an agent during invocation
 */
export interface AgentMessage {
  /** The type of this message */
  type: AgentMessageType;
  /** Which agent (agent) produced this message */
  agentId: AgentId;
  /** Text content (for 'text' and 'tool_result' types) */
  content?: string;
  /** Session ID (for 'session_init' type) */
  sessionId?: string;
  /** Tool name (for 'tool_use' type) */
  toolName?: string;
  /** Tool input parameters (for 'tool_use' type) */
  toolInput?: Record<string, unknown>;
  /** F142: Tool call ID for precise pairing between tool_use and tool_result */
  toolCallId?: string;
  /** Error message (for 'error' type) */
  error?: string;
  /** Whether this is the final 'done' in a multi-agent invocation (for 'done' type) */
  isFinal?: boolean;
  /** Provider/model metadata (set by agent services) */
  metadata?: MessageMetadata;
  /** Message origin: stream = CLI stdout (thinking), callback = MCP post_message (speech) */
  origin?: 'stream' | 'callback';
  /** Backend stored-message ID (set for callback post-message, used for rich_block correlation) */
  messageId?: string;
  /** F52: Cross-thread origin metadata (set for cross-thread callback messages) */
  extra?: {
    crossPost?: { sourceThreadId: string; sourceInvocationId?: string };
    targetAgents?: string[];
    errorFallback?: ErrorFallbackMetadata;
  };
  /** F121: ID of the message this message is replying to */
  replyTo?: string;
  /** F121: Hydrated preview of the replied-to message */
  replyPreview?: { senderAgentId: string | null; content: string; deleted?: true };
  /** F061: Whether this message mentions the co-creator (@user/@用户/configured patterns) */
  mentionsUser?: boolean;
  /** F108: Invocation ID — allows frontend to distinguish messages from concurrent invocations */
  invocationId?: string;
  /** F070: Structured error code for recoverable failures (e.g. GOVERNANCE_BOOTSTRAP_REQUIRED) */
  errorCode?: string;
  /** When this message was created */
  timestamp: number;
  /** Jiuwen / relay-claw: current skill step (attached to thinking, tools, text) */
  taskContext?: AgentTaskContextPayload;
  /** Task lifecycle boundary from jiuwen task.start / task.complete */
  taskPhase?: 'start' | 'complete';
}

/**
 * Override factory: replaces spawnCli() for tmux-based execution.
 * Same event contract — callers iterate events identically.
 */
export type SpawnCliOverride = (options: CliSpawnOptions) => AsyncGenerator<unknown, void, undefined>;

/**
 * Options for invoking an agent
 */
export interface AgentServiceOptions {
  /** Session ID to resume (optional) */
  sessionId?: string;
  /** When true, providers that support it should resume the active interrupted run instead of prompting anew. */
  resumeSession?: boolean;
  /** Working directory for the agent */
  workingDirectory?: string;
  /** Env vars to pass to CLI process for MCP callback auth */
  callbackEnv?: Record<string, string>;
  /** Per-invocation callback env overrides layered on top of callbackEnv. */
  callbackEnvOverrides?: Record<string, string>;
  /** Rich content blocks (e.g. images) to pass to the CLI agent */
  contentBlocks?: readonly MessageContent[];
  /** Upload directory for resolving image paths */
  uploadDir?: string;
  /** AbortSignal to cancel the invocation */
  signal?: AbortSignal;
  /** Correlation context for audit logging and raw trace linking */
  auditContext?: AuditContext;
  /** Static identity prompt (Claude: --append-system-prompt, others: prepend to prompt) */
  systemPrompt?: string;
  /** Provider-specific supplementary prompt context kept out of the primary user query. */
  supplementaryInfo?: string;
  /** F089: Override spawnCli with tmux-based spawner (set per-invocation) */
  spawnCliOverride?: SpawnCliOverride;
  /** F118: Invocation ID for diagnostic enrichment of __cliTimeout */
  invocationId?: string;
  /** F118: CLI session ID for diagnostic enrichment of __cliTimeout */
  cliSessionId?: string;
  /** F118 Phase B: Liveness probe config (undefined = disabled) */
  livenessProbe?: {
    sampleIntervalMs?: number;
    softWarningMs?: number;
    stallWarningMs?: number;
    boundedExtensionFactor?: number;
    /** #774: Auto-kill on idle-silent suspected_stall instead of waiting for full timeout */
    stallAutoKill?: boolean;
  };
  /** F127: Extra --config key=value pairs to pass to the CLI. */
  cliConfigArgs?: readonly string[];
  /** Resolved account/provider profile for non-CLI runtimes such as ACP. */
  providerProfile?: RuntimeProviderProfile | null;
  /** Optional session-scoped model override for ACP runtimes. */
  acpModelProfile?: RuntimeAcpModelProfile | null;
  /** Trusted caller identity propagated from the gateway entrypoint. */
  gatewayIdentity?: GatewayIdentity;
  /** Opaque member metadata loaded from the active CatalogProvider. */
  memberExtend?: Readonly<Record<string, unknown>>;
  /** AskUserQuestion: whether the current channel supports interactive structured questions. */
  interactiveAsk?: boolean;
}

/**
 * Interface that all agent services must implement
 */
export interface AgentService {
  /**
   * Invoke the agent with a prompt and stream back messages
   * @param prompt The user's prompt/message
   * @param options Optional configuration
   * @returns An async iterable of agent messages
   */
  invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage>;
}
