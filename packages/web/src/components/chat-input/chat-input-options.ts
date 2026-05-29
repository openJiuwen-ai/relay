/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';
import { API_URL } from '@/utils/api-client';
import { buildResolvedMention } from './utils/helpers';

export interface AgentOption {
  id: string;
  label: string;
  desc: string;
  insert: string;
  color: string; // hex color (for inline style)
  avatar: string;
}

/** Build @mention autocomplete options from roster data.
 *  Filters out agents with no mentionPatterns (not routable via @mention). */
function formatAgentMentionLabel(agent: AgentData): string {
  return agent.variantLabel ? `@${agent.displayName} (${agent.variantLabel})` : `@${agent.displayName}`;
}

function isAvailable(agent: AgentData): boolean {
  return agent.roster?.available !== false;
}

function isGenericMentionAgent(agent: AgentData): boolean {
  return !agent.expert && agent.mentionPatterns.length > 0 && isAvailable(agent);
}

function resolveAgentAvatar(avatar: string): string {
  const trimmed = avatar.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/uploads/') ? `${API_URL}${trimmed}` : trimmed;
}

export function buildAgentOptions(agents: AgentData[]): AgentOption[] {
  return agents
    .filter(isGenericMentionAgent)
    .map((agent) => ({
      id: agent.id,
      label: formatAgentMentionLabel(agent),
      desc: agent.roleDescription,
      insert: `${buildResolvedMention(agent) ?? ''} `,
      color: agent.color.primary,
      avatar: resolveAgentAvatar(agent.avatar),
    }));
}

/** Build whisper target options from roster data.
 *  Includes all agents — whisper routing accepts any agentId regardless of mentionPatterns. */
export function buildWhisperOptions(agents: AgentData[]): AgentOption[] {
  return agents.filter((agent) => isAvailable(agent) && !agent.expert).map((agent) => {
    const mention = buildResolvedMention(agent);
    return {
      id: agent.id,
      label: formatAgentMentionLabel(agent),
      desc: agent.roleDescription,
      insert: mention ? `${mention} ` : '',
      color: agent.color.primary,
      avatar: resolveAgentAvatar(agent.avatar),
    };
  });
}

export function buildMentionOptions(agents: AgentData[], expertOptions: AgentOption[]): AgentOption[] {
  return [...buildAgentOptions(agents), ...expertOptions];
}

export function buildExpertOption(expert: {
  expertId: string;
  displayName: string;
  avatar: string;
  mentionPatterns: string[];
  roleDescription: string;
  category: string;
}): AgentOption {
  return {
    id: expert.expertId,
    label: `@${expert.displayName}`,
    desc: expert.roleDescription,
    insert: `${buildResolvedMention(expert) ?? `@${expert.expertId}`} `,
    color: getExpertColor(expert.category),
    avatar: resolveAgentAvatar(expert.avatar),
  };
}

function getExpertColor(category: string): string {
  const colors: Record<string, string> = {
    design: '#FF6B6B',
    marketing: '#4ECDC4',
    growth: '#45B7D1',
    content: '#96CEB4',
  };
  return colors[category] ?? '#7AAEFF';
}

/** Pure detection — returns menu trigger type from current input, or null. */
export function detectMenuTrigger(
  val: string,
  selectionStart: number,
): { type: 'mention'; start: number; filter: string } | null {
  const textBefore = val.slice(0, selectionStart);
  const atIdx = textBefore.lastIndexOf('@');
  if (atIdx >= 0) {
    const fragment = textBefore.slice(atIdx + 1);
    if (fragment.length <= 12 && !/\s/.test(fragment)) {
      return { type: 'mention', start: atIdx, filter: fragment };
    }
  }
  return null;
}
