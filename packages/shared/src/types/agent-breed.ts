/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Cat Breed & Variant Types
 * Breed+Variant 两层 schema：Breed 是猫种（布偶/缅因/暹罗），
 * Variant 是同一猫种下的不同模型/配置。
 *
 * Phase 3.5: 每 Breed 有 1 个 default Variant
 * Phase 4-F: 支持多 Variant（多版本猫召唤）
 */

import type { AgentColor, AgentProvider } from './agent.js';
import type { AgentId } from './ids.js';
import type { VoiceConfig } from './tts.js';

export type AgentCreationSource = 'experts-plaza';

/**
 * Per-agent context budget configuration.
 * Controls how much history/context is sent to each agent.
 */
export interface ContextBudget {
  /** Total prompt token limit (including system prompt + context + user message) */
  readonly maxPromptTokens: number;
  /** Maximum tokens for historical context */
  readonly maxContextTokens: number;
  /** Maximum number of historical messages to include */
  readonly maxMessages: number;
  /** Maximum characters per single message (truncation point) */
  readonly maxContentLengthPerMsg: number;
}

/**
 * CLI invocation config for a variant
 */
export interface CliConfig {
  readonly command: string; // 'claude' | 'codex' | 'gemini'
  readonly outputFormat: string; // 'stream-json' | 'json'
  readonly defaultArgs?: readonly string[];
  /**
   * Reasoning effort level — each CLI maps to its own flag:
   *   claude: --effort low|medium|high|max
   *   codex:  --config model_reasoning_effort="low|medium|high|xhigh"
   * Default: 'max' (claude) / 'xhigh' (codex)
   */
  readonly effort?: 'low' | 'medium' | 'high' | 'max' | 'xhigh';
}

export interface EmbeddedAcpConfig {
  readonly executablePath?: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly provider?: 'openai_compatible' | 'bigmodel' | 'minimax' | 'echo';
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly sslVerify?: boolean | null;
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxTokens?: number;
  readonly contextWindow?: number;
  readonly connectTimeoutSeconds?: number;
}

/**
 * A specific model/config variant within a breed.
 * e.g. ragdoll breed → opus-4.6 variant, opus-4.5 variant
 *
 * F32-b: Variants can override agentId, displayName, and mentionPatterns
 * to register as independent agents within the same breed.
 */
export interface AgentVariant {
  readonly id: string; // 'opus-4.6', 'codex-default'
  /** Override breed-level agentId to register as an independent agent (F32-b) */
  readonly agentId?: string;
  /** Override breed-level displayName (F32-b) */
  readonly displayName?: string;
  /** F32-b P4: Human-readable label for disambiguation (e.g. "4.5", "Sonnet") */
  readonly variantLabel?: string;
  /** Independent mention patterns for this variant (F32-b).
   *  Default variant inherits breed mentionPatterns; non-default variants fallback to @agentId when unspecified. */
  readonly mentionPatterns?: readonly string[];
  /** F127: member-side binding to a concrete account config (built-in or API key). */
  readonly accountRef?: string;
  readonly provider: AgentProvider;
  readonly defaultModel: string;
  readonly mcpSupport: boolean;
  readonly cli: CliConfig;
  /** F127: explicit CLI args for bridge-style members such as Antigravity. */
  readonly commandArgs?: readonly string[];
  /** Optional per-variant override for roleDescription; falls back to breed.roleDescription. */
  readonly roleDescription?: string;
  readonly personality?: string;
  readonly strengths?: readonly string[];
  /** F32-b P4c: Override breed-level avatar for this variant */
  readonly avatar?: string;
  /** F32-b P4c: Override breed-level color for this variant */
  readonly color?: AgentColor;
  /** Per-agent context budget (optional, falls back to defaults) */
  readonly contextBudget?: ContextBudget;
  /** Optional per-variant override for sessionChain; falls back to breed.features.sessionChain. */
  readonly sessionChain?: boolean;
  /** F34: Per-agent TTS voice (optional, falls back to defaults in agent-voices.ts) */
  readonly voiceConfig?: VoiceConfig;
  /** F-Ground-3: Human-readable strengths for teammate roster (overrides breed-level) */
  readonly teamStrengths?: string;
  /** F-Ground-3: Caution note. null = explicitly no caution (overrides breed). */
  readonly caution?: string | null;
  /** F127: Extra CLI --config key=value pairs passed to the client at invocation time.
   *  Each entry is a raw config string, e.g. 'model_reasoning_effort="low"'. */
  readonly cliConfigArgs?: readonly string[];
  /** F189: OpenCode custom provider name (e.g. "maas", "deepseek").
   *  Used with api_key auth — runtime assembles `ocProviderName/defaultModel` for the -m flag
   *  and generates an OPENCODE_CONFIG runtime config file for the provider. */
  readonly ocProviderName?: string;
  /** Embedded ACP runtime executable override (relative paths resolve from project root). */
  readonly embeddedAcpExecutablePath?: string;
  /** Embedded ACP runtime command/env/model overrides. */
  readonly embeddedAcpConfig?: EmbeddedAcpConfig;
  /** Cloud catalog providers may attach opaque member-level metadata here. */
  readonly extend?: Readonly<Record<string, unknown>>;
  /** Optional skill allowlist for this variant. */
  readonly skills?: readonly string[];
}

/**
 * Per-agent feature flags.
 * Controls which subsystems are enabled for each agent.
 */
export interface AgentFeatures {
  /** F24: Enable session chain (context health tracking, auto-seal, bootstrap).
   *  Default: true. Set false for cats with inaccurate token stats (e.g. Gemini). */
  readonly sessionChain?: boolean;
  /** F33 Phase 2: Per-breed session strategy override from office-claw-config.json.
   *  Partial config — merged with provider/global defaults at runtime.
   *  Matches SessionStrategyConfig shape (all fields except strategy are optional). */
  readonly sessionStrategy?: {
    readonly strategy: 'handoff' | 'compress' | 'hybrid';
    readonly thresholds?: { readonly warn: number; readonly action: number };
    readonly handoff?: { readonly preSealMemoryDump: boolean; readonly bootstrapDepth: 'extractive' | 'generative' };
    readonly hybrid?: { readonly maxCompressions: number };
    readonly compress?: { readonly maxCompressions?: number; readonly trackPostCompression: boolean };
    readonly turnBudget?: number;
    readonly safetyMargin?: number;
  };
  /** F049: Mission Hub self-claim permission ratchet scope. */
  readonly missionHub?: {
    /**
     * disabled: 仅允许「建议 + 批准」
     * once/thread/global: 允许直通 self-claim（细粒度行为由路由层定义）
     */
    readonly selfClaimScope?: MissionHubSelfClaimScope;
  };
}

export type MissionHubSelfClaimScope = 'disabled' | 'once' | 'thread' | 'global';

/**
 * A agent breed — the identity layer (name, avatar, color, role).
 * Each group has one or more variants (model configs).
 */
export interface AgentBreed {
  readonly id: string; // 'ragdoll', 'maine-coon', 'siamese'
  readonly agentId: AgentId;
  readonly name: string; // e.g. 'Claude'
  readonly displayName: string;
  readonly nickname?: string;
  readonly avatar: string;
  readonly color: AgentColor;
  readonly mentionPatterns: readonly string[];
  readonly roleDescription: string;
  readonly defaultVariantId: string;
  readonly variants: readonly AgentVariant[];
  /** Per-agent feature flags (optional, all features enabled by default) */
  readonly features?: AgentFeatures;
  /** F-Ground-3: Human-readable strengths for teammate roster (breed default) */
  readonly teamStrengths?: string;
  /** F-Ground-3: Caution note. null = explicitly no caution (overrides breed). */
  readonly caution?: string | null;
  /** Optional creation provenance for runtime-created agents. */
  readonly creationSource?: AgentCreationSource;
}

// ── F032: Roster types for collaboration rules ─────────────────────────

/**
   * Roster entry for a single agent.
 * F032: Used for reviewer matching, availability tracking, and role checking.
 */
export interface RosterEntry {
  /** Family/species (ragdoll, maine-coon, siamese) */
  readonly family: string;
  /** Roles this agent can fulfill (architect, peer-reviewer, designer, etc.) */
  readonly roles: readonly string[];
  /** Whether this agent is the lead of its group */
  readonly lead: boolean;
  /** Whether this agent is available (has quota). 用户 40 美刀教训！ */
  readonly available: boolean;
  /** 用户's evaluation of this agent */
  readonly evaluation: string;
}

/** Map of agentId → RosterEntry */
export type Roster = Record<string, RosterEntry>;

/**
 * Review policy configuration.
 * F032: Determines how reviewers are matched to authors.
 */
export interface ReviewPolicy {
  /** Require reviewer to be from a different family than author */
  readonly requireDifferentFamily: boolean;
   /** Prefer agents that are active in the current thread */
  readonly preferActiveInThread: boolean;
   /** Prefer lead agents when multiple candidates exist */
  readonly preferLead: boolean;
   /** Exclude agents with available: false (no quota) */
  readonly excludeUnavailable: boolean;
}

/**
 * Root config v1: breeds only (legacy)
 */
export interface OfficeClawConfigV1 {
  readonly version: 1;
  readonly breeds: readonly AgentBreed[];
}

/**
 * F067: Co-Creator (用户) configuration — configurable identity for @ mention routing.
 */
export interface CoCreatorConfig {
  /** Primary display name (e.g. "You") */
  readonly name: string;
  /** Alternative names cats may use (e.g. ["L.S.", "Lysander"]) */
  readonly aliases: readonly string[];
  /** Line-start mention patterns for routing detection (e.g. ["@co-creator", "@co-creator"]) */
  readonly mentionPatterns: readonly string[];
  /** Optional co-creator avatar shown in Hub and chat surfaces. */
  readonly avatar?: string;
  /** Optional co-creator palette for Hub/chat surfaces. */
  readonly color?: AgentColor;
}

/**
 * Root config v2: breeds + roster + reviewPolicy (F032)
 */
export interface OfficeClawConfigV2 {
  readonly version: 2;
  readonly breeds: readonly AgentBreed[];
  readonly roster: Roster;
  readonly reviewPolicy: ReviewPolicy;
  readonly coCreator?: CoCreatorConfig;
}

/**
 * Root config: versioned, contains all breeds.
 * Union of all versions — loader handles migration.
 */
export type OfficeClawConfig = OfficeClawConfigV1 | OfficeClawConfigV2;
