/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b Phase 3: Mention highlighting data — refreshable from API.
 *
 * Initializes from static OFFICE_CLAW_CONFIGS (zero-load working state).
 * After useAgentData fetches /api/agents, calls refreshMentionData() to rebuild
 * regex with all agents (including dynamically added ones).
 */

import { OFFICE_CLAW_CONFIGS, escapeRegExp } from '@openjiuwen/relay-shared';
import type { AgentData } from '@/hooks/useAgentData';

// ── Internal builders ───────────────────────────────────

function buildMentionAliasToAgentId(
  agents: Array<{ id: string; displayName: string; mentionPatterns: string[] }>,
): Record<string, string> {
  const pairs: Array<[string, string]> = [];
  for (const agent of agents) {
    const aliases = new Set<string>();
    aliases.add(agent.id.trim().toLowerCase());
    aliases.add(agent.displayName.replace(/^@/, '').trim().toLowerCase());
    for (const pattern of agent.mentionPatterns) {
      aliases.add(pattern.replace(/^@/, '').trim().toLowerCase());
    }
    for (const alias of aliases) {
      if (!alias) continue;
      pairs.push([alias, agent.id]);
    }
  }
  return Object.fromEntries(pairs);
}

function buildMentionLabel(
  agents: Array<{ id: string; mentionPatterns: string[]; displayName: string }>,
): Record<string, string> {
  const pairs: Array<[string, string]> = [];
  for (const agent of agents) {
    const label = `@${agent.displayName}`;
    const aliases = new Set<string>();
    aliases.add(agent.id.trim().toLowerCase());
    aliases.add(agent.displayName.replace(/^@/, '').trim().toLowerCase());
    for (const pattern of agent.mentionPatterns) {
      aliases.add(pattern.replace(/^@/, '').trim().toLowerCase());
    }
    for (const alias of aliases) {
      if (!alias) continue;
      pairs.push([alias, label]);
    }
  }
  return Object.fromEntries(pairs);
}

function buildMentionRe(aliasToAgentId: Record<string, string>): RegExp {
  const aliases = Object.keys(aliasToAgentId).sort((a, b) => b.length - a.length);
  if (aliases.length === 0) return /(?!)/g; // never-match fallback
  const pattern = aliases.map(escapeRegExp).join('|');
  // Boundary chars aligned with backend AgentRouter.parseMentions
  return new RegExp(`@(${pattern})(?=$|\\s|[,.:;!?()\\[\\]{}<>，。！？、：；（）【】《》「」『』〈〉])`, 'gi');
}

function buildMentionColor(agents: Array<{ id: string; color: { primary: string } }>): Record<string, string> {
  return Object.fromEntries(agents.map((agent) => [agent.id, agent.color.primary]));
}

// ── Co-Creator (用户) ───────────────────────────────────
const CO_CREATOR_ID = '__co-creator__';
const CO_CREATOR_DISPLAY_NAME = '用户';
const CO_CREATOR_COLOR = '#F5A623'; // warm gold
const DEFAULT_CO_CREATOR_MENTION_PATTERNS = ['@co-creator', '@用户'];

// ── Module-level cache (starts from static OFFICE_CLAW_CONFIGS) ─

const staticMentionAgents = Object.entries(OFFICE_CLAW_CONFIGS).map(([id, c]) => ({
  id,
  displayName: c.displayName,
  mentionPatterns: [...c.mentionPatterns],
  color: { primary: c.color.primary },
}));

// Include co-creator as synthetic entry so @用户 highlights gold
let _mentionAgents = staticMentionAgents;
let _threadExpertAgents: Array<{ id: string; displayName: string; mentionPatterns: string[]; color: { primary: string } }> = [];
let _coCreatorMentionPatterns = [...DEFAULT_CO_CREATOR_MENTION_PATTERNS];
let _mentionAliasToAgentId = buildMentionAliasToAgentId([]);
let _mentionRe = buildMentionRe(_mentionAliasToAgentId);
let _mentionColor = buildMentionColor([]);
let _mentionLabel = buildMentionLabel([]);

function normalizeCoCreatorMentionPatterns(mentionPatterns: readonly string[]): string[] {
  const normalized = mentionPatterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0)
    .map((pattern) => (pattern.startsWith('@') ? pattern : `@${pattern}`));
  const unique = new Set(DEFAULT_CO_CREATOR_MENTION_PATTERNS);
  for (const pattern of normalized) unique.add(pattern);
  return [...unique];
}

function rebuildMentionCache(): void {
  const ownerEntry = {
    id: CO_CREATOR_ID,
    displayName: CO_CREATOR_DISPLAY_NAME,
    mentionPatterns: _coCreatorMentionPatterns,
    color: { primary: CO_CREATOR_COLOR },
  };
  const all = [..._mentionAgents, ..._threadExpertAgents, ownerEntry];
  _mentionAliasToAgentId = buildMentionAliasToAgentId(all);
  _mentionRe = buildMentionRe(_mentionAliasToAgentId);
  _mentionColor = buildMentionColor(all);
  _mentionLabel = buildMentionLabel(all);
}

rebuildMentionCache();

// ── Public API ──────────────────────────────────────────

/** Called once by useAgentData after API fetch succeeds.
 *  Filters out disabled members (roster.available === false) so they don't highlight. */
export function refreshMentionData(agents: AgentData[]): void {
  _mentionAgents = agents.filter((agent) => agent.roster?.available !== false);
  rebuildMentionCache();
}

export function refreshThreadExpertMentionData(
  experts: Array<{
    expertId: string;
    displayName: string;
    mentionPatterns: string[];
    category?: string;
  }>,
): void {
  _threadExpertAgents = experts.map((expert) => ({
    id: expert.expertId,
    displayName: expert.displayName,
    mentionPatterns: expert.mentionPatterns,
    color: { primary: getExpertColor(expert.category) },
  }));
  rebuildMentionCache();
}

export function refreshCoCreatorMentionData(mentionPatterns: readonly string[]): void {
  _coCreatorMentionPatterns = normalizeCoCreatorMentionPatterns(mentionPatterns);
  rebuildMentionCache();
}

/** Get the current mention regex (refreshed after API load) */
export function getMentionRe(): RegExp {
  return _mentionRe;
}

/** Map mention alias (lowercase, no @) → agentId */
export function getMentionToAgentId(): Record<string, string> {
  return _mentionAliasToAgentId;
}

/** Map agentId → primary color hex (e.g. "#9B7EBD") */
export function getMentionColor(): Record<string, string> {
  return _mentionColor;
}

/** Map mention alias (lowercase, no @) → rendered label (e.g. "@办公助理") */
export function getMentionLabel(): Record<string, string> {
  return _mentionLabel;
}

export function resetMentionDataForTest(): void {
  _mentionAgents = staticMentionAgents;
  _threadExpertAgents = [];
  _coCreatorMentionPatterns = [...DEFAULT_CO_CREATOR_MENTION_PATTERNS];
  rebuildMentionCache();
}

function getExpertColor(category?: string): string {
  const colors: Record<string, string> = {
    design: '#FF6B6B',
    marketing: '#4ECDC4',
    growth: '#45B7D1',
    content: '#96CEB4',
  };
  return category ? (colors[category] ?? '#7AAEFF') : '#7AAEFF';
}
