/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Cat Types and Configurations
 * AI 智能体的类型定义和配置
 */

import type { AgentCreationSource, ContextBudget, EmbeddedAcpConfig } from './agent-breed.js';
import type { AgentId, SessionId } from './ids.js';
import { createAgentId } from './ids.js';

/**
 * AI provider behind a agent
 */
/**
 * Known built-in providers. The runtime accepts any string so that new
 * providers introduced in config don't break older code — unknown values
 * fall through to `default` branches in switch statements.
 */
export type KnownAgentProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'dare'
  | 'antigravity'
  | 'opencode'
  | 'a2a'
  | 'relayclaw'
  | 'acp';
export type AgentProvider = string;

/**
 * Cat status in the system
 */
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'error' | 'offline';

/**
 * Cat color configuration
 */
export interface AgentColor {
  readonly primary: string;
  readonly secondary: string;
}

export type EmbeddedRuntimeKind = 'agentteams_acp';

const EMBEDDED_RUNTIME_SEEDS: Readonly<Record<string, { provider: string; kind: EmbeddedRuntimeKind }>> = {
  acp: { provider: 'acp', kind: 'agentteams_acp' },
};

export function resolveEmbeddedRuntimeKind(input: {
  id?: string | null;
  provider?: string | null;
  source?: string | null;
}): EmbeddedRuntimeKind | null {
  if (input.source === 'runtime') return null;
  const entry = input.provider ? EMBEDDED_RUNTIME_SEEDS[input.provider] : undefined;
  if (!entry) return null;
  return entry.kind;
}

export function usesEmbeddedAcpRuntime(input: { id?: string | null; provider?: string | null; source?: string | null }): boolean {
  return resolveEmbeddedRuntimeKind(input) === 'agentteams_acp';
}

/**
 * Cat configuration (immutable)
 */
export interface OfficeClawConfigEntry {
  readonly id: AgentId;
  readonly name: string;
  readonly displayName: string;
  /** Friendly nickname (e.g. 小九, 小理) */
  readonly nickname?: string;
  readonly avatar: string;
  readonly color: AgentColor;
  readonly mentionPatterns: readonly string[];
  readonly accountRef?: string;
  readonly provider: AgentProvider;
  readonly defaultModel: string;
  readonly mcpSupport: boolean;
  readonly commandArgs?: readonly string[];
  readonly contextBudget?: ContextBudget;
  readonly roleDescription: string;
  readonly personality: string;
  /** F32-b: Which breed this agent belongs to (for frontend grouping) */
  readonly breedId?: string;
  /** F32-b P4: Human-readable variant label (e.g. "4.5", "Sonnet") */
  readonly variantLabel?: string;
  /** F32-b P4: Whether this is the default variant for its breed */
  readonly isDefaultVariant?: boolean;
  /** F32-b P4: Breed-level display name (for group headings in UI) */
  readonly breedDisplayName?: string;
  /** F-Ground-3: Human-readable strengths for teammate roster */
  readonly teamStrengths?: string;
  /** F-Ground-3: Caution note for teammate roster. null = explicitly no warning (overrides breed). */
  readonly caution?: string | null;
  /** F127 Screen 3: editable strength tags */
  readonly strengths?: readonly string[];
  /** F127 Screen 3: whether session chain is enabled for this member */
  readonly sessionChain?: boolean;
  /** F127: Extra CLI --config key=value pairs passed to the client at invocation time. */
  readonly cliConfigArgs?: readonly string[];
  /** F189: OpenCode custom provider name for api_key routing (runtime assembles provider/model). */
  readonly ocProviderName?: string;
  /** Whether this config entry is an expert (excluded from generic agent lists). */
  readonly expert?: boolean;
  /** Embedded ACP runtime executable override (relative paths resolve from project root). */
  readonly embeddedAcpExecutablePath?: string;
  /** Embedded ACP runtime command/env/model overrides. */
  readonly embeddedAcpConfig?: EmbeddedAcpConfig;
  /** Opaque member metadata projected from AgentVariant.extend. */
  readonly extend?: Readonly<Record<string, unknown>>;
  /** Optional creation provenance for runtime-created agents. */
  readonly creationSource?: AgentCreationSource;
  /** 技能白名单配置 - 允许的技能 ID 列表，undefined/null 表示跟随全局配置 */
  readonly skills?: readonly string[];
}

export type AgentConfig = OfficeClawConfigEntry;

/**
 * Cat runtime state
 */
export interface AgentState {
  readonly id: AgentId;
  readonly status: AgentStatus;
  readonly currentTask?: string;
  readonly lastActiveAt: Date;
  readonly sessionId?: SessionId;
}

/**
 * Default configurations for built-in cats.
 * At runtime, officeClawRegistry is the authoritative source (populated at startup).
 * This constant is retained as fallback for code that hasn't migrated yet
 * and for frontend (which doesn't use the registry).
 */
export const OFFICE_CLAW_CONFIGS: Record<string, OfficeClawConfigEntry> = {
  opus: {
    id: createAgentId('opus'),
    name: '办公智能体',
    displayName: '办公智能体',
    nickname: '小九',
    avatar: '/avatars/agent-avatar-2.png',
    color: {
      primary: '#2B5797',
      secondary: '#C0D0E8',
    },
    mentionPatterns: ['@opus', '@office', '@小九', '@办公智能体'],
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    mcpSupport: true,
    breedId: 'ragdoll',
    roleDescription: '商务办公专家，擅长文档撰写、会议纪要、项目管理和数据分析',
    personality: '专业干练，逻辑清晰，善于结构化输出和流程优化',
  },
  codex: {
    id: createAgentId('codex'),
    name: '通用智能体',
    displayName: '通用智能体',
    nickname: '小理',
    avatar: '/avatars/agent-avatar-1.png',
    color: {
      primary: '#E8913A',
      secondary: '#FFF0DD',
    },
    mentionPatterns: ['@codex', '@assistant', '@小理', '@通用智能体'],
    provider: 'openai',
    defaultModel: 'codex',
    mcpSupport: false,
    breedId: 'maine-coon',
    roleDescription: '个人助理，擅长日常问答、信息整理、创意写作和生活建议',
    personality: '温暖亲切，耐心细致，善于倾听和陪伴式交流',
  },
  gemini: {
    id: createAgentId('gemini'),
    name: '编码智能体',
    displayName: '编码智能体',
    nickname: '小码',
    avatar: '/avatars/agent-avatar-3.png',
    color: {
      primary: '#4CAF50',
      secondary: '#E8F5E9',
    },
    mentionPatterns: ['@gemini', '@agentteams', '@小码', '@编码智能体'],
    provider: 'google',
    defaultModel: 'gemini-2.5-pro',
    mcpSupport: false,
    breedId: 'siamese',
    roleDescription: '多智能体协作引擎，擅长复杂任务拆解、多步骤编排和工具链调度',
    personality: '冷静高效的任务指挥官，擅长将复杂问题拆解为可执行步骤并协调多方资源完成',
  },
  jiuwenclaw: {
    id: createAgentId('jiuwenclaw'),
    name: '办公助理',
    displayName: '办公助理',
    nickname: '小九',
    avatar: '/avatars/jiuwenclaw.png',
    color: {
      primary: '#D97A3A',
      secondary: '#F6E7DA',
    },
    mentionPatterns: ['@jiuwenclaw', '@jiuwenClaw', '@jiuwen', '@办公助理', '@office', '@小九'],
    provider: 'relayclaw',
    defaultModel: 'gpt-5.4',
    mcpSupport: true,
    breedId: 'jiuwenclaw',
    roleDescription: '通用 office 助理，负责文档整理、会议纪要、资料汇总、事项跟进和日常事务协助',
    personality: '耐心细致、沟通清楚，优先帮助用户把办公事务梳理清楚并推进落地',
  },
} as const;


/**
 * Find a agent by mention pattern in text.
 * Reads from OFFICE_CLAW_CONFIGS (static fallback, frontend-safe).
 * API-side code should use officeClawRegistry directly for dynamic lookups.
 * @param text - The text to search for mentions
 * @returns The OfficeClawConfigEntry if found, undefined otherwise
 */
export function findAgentByMention(text: string): OfficeClawConfigEntry | undefined {
  const lowerText = text.toLowerCase();

  for (const config of Object.values(OFFICE_CLAW_CONFIGS)) {
    for (const pattern of config.mentionPatterns) {
      if (lowerText.includes(pattern.toLowerCase())) {
        return config;
      }
    }
  }

  return undefined;
}

/**
 * Get all agent IDs from static defaults.
 * API-side code should use officeClawRegistry.getAllIds() instead.
 */
export function getAllAgentIds(): readonly AgentId[] {
  return Object.values(OFFICE_CLAW_CONFIGS).map((config) => config.id);
}
