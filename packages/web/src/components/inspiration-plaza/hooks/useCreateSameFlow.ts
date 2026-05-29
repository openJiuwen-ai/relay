/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AgentOption } from '@/components/chat-input/chat-input-options';
import { buildAgentOptions } from '@/components/chat-input/chat-input-options';
import { getQuickActionToken, getSkillToken } from '@/components/chat-input/utils/helpers';
import { QUICK_ACTIONS } from '@/config/quick-actions';
import type { AgentData } from '@/hooks/useAgentData';
import { useAgentData } from '@/hooks/useAgentData';
import type { MentionRef } from '@/hooks/useSendMessage';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { fetchSkillOptionsWithCache, type SkillOption } from '@/utils/skill-options-cache';
import type { AgentRef, InspirationTemplateDetail, InspirationTemplateListItem, SkillRef } from '../types';

const HOME_DRAFT_THREAD_ID = '__new__';

export type CreateSameTarget = { kind: 'new' } | { kind: 'existing'; threadId: string };

function hasPrompt(template: InspirationTemplateListItem): template is InspirationTemplateDetail {
  return 'prompt' in template && typeof template.prompt === 'string';
}

async function resolveTemplateDetail(template: InspirationTemplateListItem): Promise<InspirationTemplateDetail> {
  if (hasPrompt(template)) return template;
  const response = await apiFetch(`/api/inspiration/templates/${template.id}`);
  if (!response.ok) throw new Error(`Failed to fetch inspiration template: ${response.status}`);
  const data = await response.json();
  return data.data as InspirationTemplateDetail;
}

function normalizeLookupValue(value: string | undefined): string {
  return value?.replace(/^@/, '').trim().toLowerCase() ?? '';
}

function stripVariantLabel(value: string): string {
  return value
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^@/, '')
    .trim();
}

function resolveSkillNames(skills: SkillRef[], skillOptions: SkillOption[]): string[] {
  const optionByName = new Map(skillOptions.map((option) => [normalizeLookupValue(option.name), option.name.trim()]));
  const names: string[] = [];
  const seen = new Set<string>();

  for (const skill of skills) {
    const candidates = [skill.id, skill.name];
    const matchedName = candidates.map((candidate) => optionByName.get(normalizeLookupValue(candidate))).find(Boolean);
    if (!matchedName) continue;

    const key = normalizeLookupValue(matchedName);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(matchedName);
  }

  return names;
}

function getAgentByOptionId(agents: AgentData[], option: AgentOption): AgentData | undefined {
  return agents.find((agent) => agent.id === option.id);
}

function getStrongAgentValues(agent: AgentData | undefined, option: AgentOption): string[] {
  return [option.id, agent?.id, agent?.breedId, agent?.displayName, agent?.name, stripVariantLabel(option.label)]
    .map(normalizeLookupValue)
    .filter(Boolean);
}

function getAliasAgentValues(agent: AgentData | undefined, option: AgentOption): string[] {
  return [option.insert, ...(agent?.mentionPatterns ?? [])].map(normalizeLookupValue).filter(Boolean);
}

function hasAgentMatch(ref: AgentRef, values: string[]): boolean {
  const refValues = [ref.id, ref.catId, ref.name].map(normalizeLookupValue).filter(Boolean);
  return refValues.some((value) => values.includes(value));
}

function findMatchingAgentOption(ref: AgentRef, agentOptions: AgentOption[], agents: AgentData[]): AgentOption | null {
  const strongMatches = agentOptions.filter((option) =>
    hasAgentMatch(ref, getStrongAgentValues(getAgentByOptionId(agents, option), option)),
  );
  if (strongMatches.length === 1) return strongMatches[0] ?? null;

  const aliasMatches = agentOptions.filter((option) =>
    hasAgentMatch(ref, getAliasAgentValues(getAgentByOptionId(agents, option), option)),
  );
  return aliasMatches.length === 1 ? (aliasMatches[0] ?? null) : null;
}

function resolveAgentMentionRefs(templateAgents: AgentRef[], agents: AgentData[]): MentionRef[] {
  const agentOptions = buildAgentOptions(agents);
  const refs: MentionRef[] = [];
  const seen = new Set<string>();

  for (const agent of templateAgents) {
    const option = findMatchingAgentOption(agent, agentOptions, agents);
    const mention = option?.insert.trim();
    if (!option || !mention) continue;

    const key = `${option.id}:${mention.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ catId: option.id, mention });
  }

  return refs;
}

function mentionAlreadyInPrompt(prompt: string, mention: string): boolean {
  const pattern = new RegExp(`(^|\\s)${mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
  return pattern.test(prompt);
}

function resolveCategoryToken(tags: string[], prompt: string): string | null {
  const visibleCategoryByLabel = new Map(
    QUICK_ACTIONS.filter((action) => action.show !== false).map((action) => [
      normalizeLookupValue(action.label),
      action.label,
    ]),
  );
  for (const tag of tags) {
    const label = visibleCategoryByLabel.get(normalizeLookupValue(tag));
    if (!label) continue;
    const token = getQuickActionToken(label);
    return prompt.includes(token) ? null : token;
  }
  return null;
}

async function buildCreateSameInput(detail: InspirationTemplateDetail, agents: AgentData[]) {
  const skillOptions = await fetchSkillOptionsWithCache();
  const categoryToken = resolveCategoryToken(detail.tags, detail.prompt);
  const skillTokens = resolveSkillNames(detail.skills, skillOptions)
    .map(getSkillToken)
    .filter((token) => !detail.prompt.includes(token));
  const mentionRefs = resolveAgentMentionRefs(detail.agents, agents);
  const mentionTokens = mentionRefs
    .map((ref) => ref.mention)
    .filter((mention) => !mentionAlreadyInPrompt(detail.prompt, mention));
  const prefix = [categoryToken, ...mentionTokens, ...skillTokens].filter(Boolean).join(' ').trim();

  return {
    text: prefix ? `${prefix}\n${detail.prompt}` : detail.prompt,
    mentionRefs,
  };
}

export function useCreateSameFlow(template: InspirationTemplateListItem) {
  const navigate = useNavigate();
  const setPendingChatInsert = useChatStore((state) => state.setPendingChatInsert);
  const { agents } = useAgentData();

  return useCallback(
    async (target: CreateSameTarget) => {
      const threadId = target.kind === 'new' ? HOME_DRAFT_THREAD_ID : target.threadId;
      try {
        const detail = await resolveTemplateDetail(template);
        const { text, mentionRefs } = await buildCreateSameInput(detail, agents);

        setPendingChatInsert({
          threadId,
          text,
          ...(mentionRefs.length > 0 ? { mentionRefs } : {}),
          ...(mentionRefs.length > 0 ? { suppressMentionMenu: true } : {}),
          inspirationData: {
            prompt: detail.prompt,
            skills: detail.skills,
            agents: detail.agents,
            templateId: detail.id,
          },
        });

        navigate(target.kind === 'new' ? '/' : `/thread/${threadId}`);
      } catch (error) {
        console.error('Failed to resolve inspiration template detail', error);
      }
    },
    [agents, navigate, setPendingChatInsert, template],
  );
}
