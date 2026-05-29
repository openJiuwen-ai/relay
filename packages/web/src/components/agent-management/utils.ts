/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { API_URL } from '@/utils/api-client';
import type { AgentData } from '@/hooks/useAgentData';
import type { AgentCardData } from './types';
import { DEFAULT_PRESET_AVATAR, PRESET_AVATARS } from './constants';

export function agentToCardData(agent: AgentData): AgentCardData {
  return {
    id: agent.id,
    displayName: agent.displayName ?? agent.name ?? '未命名',
    avatar: agent.avatar,
    roleDescription: agent.roleDescription,
    defaultModel: agent.defaultModel,
    source: agent.source as 'runtime' | 'builtin',
    creationSource: agent.creationSource,
  };
}

export type AgentSourceFilter = 'all' | 'seed' | 'runtime' | 'experts-plaza';

export function filterAgents(agents: AgentData[], searchQuery: string, sourceFilter: AgentSourceFilter = 'all'): AgentData[] {
  let result = agents;
  if (sourceFilter !== 'all') {
    result = result.filter((agent) => {
      if (sourceFilter === 'experts-plaza') return agent.creationSource === 'experts-plaza';
      if (sourceFilter === 'seed') return agent.source === 'seed';
      if (sourceFilter === 'runtime') return agent.source === 'runtime' && !agent.creationSource;
      return true;
    });
  }
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) return result;
  return result.filter((agent) => agent.displayName?.toLowerCase().includes(normalizedQuery));
}

function avatarSeed(name: string): string {
  const normalized = name.trim() || 'BOT';
  let hash = 0;
  for (const char of normalized) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 72% 62%)`;
}

export function buildGeneratedAvatarDataUrl(name: string): string {
  const label = (name.trim().slice(0, 1) || '智').toUpperCase();
  const color = avatarSeed(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="#8AA4FF" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="48" fill="url(#g)" />
      <circle cx="48" cy="48" r="38" fill="rgba(255,255,255,0.18)" />
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="700" fill="#FFFFFF">${label}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function resolveInitialAvatar(member: AgentData | null): string {
  return member?.avatar?.trim() ?? '';
}

export function getRandomPresetAvatar(): string {
  const randomIndex = Math.floor(Math.random() * PRESET_AVATARS.length);
  return PRESET_AVATARS[randomIndex];
}

export function formatAvatarUrl(avatar: string): string {
  return avatar.startsWith('/uploads/') ? `${API_URL}${avatar}` : avatar;
}

export function isDuplicateNameErrorMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return (
    (normalized.includes('名称') && normalized.includes('已被使用')) ||
    normalized.includes('duplicate') ||
    normalized.includes('already exists') ||
    normalized.includes('名称重复') ||
    normalized.includes('名字重复') ||
    normalized.includes('重名')
  );
}
