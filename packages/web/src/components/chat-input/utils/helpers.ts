/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { QUICK_ACTIONS } from '@/config/quick-actions';
import type { AgentData } from '@/hooks/useAgentData';
import type { MentionRef } from '@/hooks/useSendMessage';
import type { AgentOption } from '../chat-input-options';
import {
  MAX_ATTACHMENT_FILES,
  MAX_INPUT_LENGTH,
  QUICK_ACTION_TOKEN_PREFIX,
  QUICK_ACTION_TOKEN_SUFFIX,
  SKILL_TOKEN_PREFIX,
  SKILL_TOKEN_SUFFIX,
} from './constants';

const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.ms-excel.sheet.binary.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/markdown',
  'text/x-markdown',
  'text/plain',
  'text/csv',
]);
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'xlsm',
  'xlsb',
  'ppt',
  'pptx',
  'md',
  'txt',
  'csv',
]);
const MENTION_END_BOUNDARY_RE = /[\s,.:;!?()[\]{}<>，。！？、：；（）【】《》「」『』〈〉]/;

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function getSkillToken(name: string): string {
  return `${SKILL_TOKEN_PREFIX}${name}${SKILL_TOKEN_SUFFIX}`;
}

export function getQuickActionToken(label: string): string {
  return `${QUICK_ACTION_TOKEN_PREFIX}${label}${QUICK_ACTION_TOKEN_SUFFIX}`;
}

export function clampInputLength(value: string): string {
  if (value.length <= MAX_INPUT_LENGTH) return value;
  return value.slice(0, MAX_INPUT_LENGTH);
}

function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  if (parts.length <= 1) return '';
  return parts[parts.length - 1]?.toLowerCase() ?? '';
}

export function isSupportedAttachmentFile(file: File): boolean {
  if (SUPPORTED_ATTACHMENT_MIME_TYPES.has(file.type.toLowerCase())) return true;
  const ext = getFileExtension(file.name);
  return SUPPORTED_ATTACHMENT_EXTENSIONS.has(ext);
}

export function normalizeQuickActionsForSend(input: string): string {
  let output = input;
  for (const action of QUICK_ACTIONS) {
    const token = getQuickActionToken(action.label);
    output = output.split(token).join(action.label);
  }
  return output;
}

export function normalizeMentionsForSend(input: string, agentOptions: AgentOption[]): string {
  let output = input;
  for (const option of agentOptions) {
    const routeToken = option.insert.trim();
    if (!routeToken.startsWith('@')) continue;
    const displayMentionBase = option.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const displayMention = displayMentionBase.startsWith('@') ? displayMentionBase : `@${displayMentionBase}`;
    if (!displayMention || displayMention.toLowerCase() === routeToken.toLowerCase()) continue;
    const displayPattern = new RegExp(`(^|\\s)${escapeRegExp(displayMention)}(?=\\s|$)`, 'gi');
    output = output.replace(displayPattern, (match, prefix: string) => `${prefix}${routeToken}`);
  }
  return output;
}

function countMentionOccurrences(input: string, mention: string): number {
  const normalizedInput = input.toLowerCase();
  const normalizedMention = mention.toLowerCase().trim();
  if (!normalizedMention.startsWith('@')) return 0;

  let count = 0;
  let searchFrom = 0;
  while (searchFrom < normalizedInput.length) {
    const pos = normalizedInput.indexOf(normalizedMention, searchFrom);
    if (pos === -1) break;

    const end = pos + normalizedMention.length;
    const charAfter = normalizedInput[end];
    if (!charAfter || MENTION_END_BOUNDARY_RE.test(charAfter)) {
      count += 1;
    }
    searchFrom = pos + 1;
  }

  return count;
}

export function reconcileMentionRefs(input: string, mentionRefs: MentionRef[]): MentionRef[] {
  if (mentionRefs.length === 0) return mentionRefs;

  const remainingByMention = new Map<string, number>();
  for (const ref of mentionRefs) {
    const mention = ref.mention.trim().toLowerCase();
    if (remainingByMention.has(mention)) continue;
    remainingByMention.set(mention, countMentionOccurrences(input, mention));
  }

  const kept: MentionRef[] = [];
  for (let index = mentionRefs.length - 1; index >= 0; index -= 1) {
    const ref = mentionRefs[index];
    const mention = ref.mention.trim().toLowerCase();
    const remaining = remainingByMention.get(mention) ?? 0;
    if (remaining <= 0) continue;
    kept.push(ref);
    remainingByMention.set(mention, remaining - 1);
  }

  kept.reverse();
  return kept.length === mentionRefs.length ? mentionRefs : kept;
}

export function deriveTargetAgentIds(
  input: string,
  mentionRefs: MentionRef[],
  mentionOptions: AgentOption[],
): string[] {
  const exactRefs = reconcileMentionRefs(input, mentionRefs);
  const exactTargetIds = exactRefs.map((ref) => ref.catId);
  const exactMentions = new Set(exactRefs.map((ref) => ref.mention.trim().toLowerCase()));
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const agentId of exactTargetIds) {
    if (seen.has(agentId)) continue;
    seen.add(agentId);
    ordered.push(agentId);
  }

  for (const option of mentionOptions) {
    const routeToken = option.insert.trim();
    const displayTokenBase = option.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const displayToken = displayTokenBase.startsWith('@') ? displayTokenBase : `@${displayTokenBase}`;
    const candidates = [routeToken, displayToken].filter((token) => token.startsWith('@'));
    if (candidates.some((token) => exactMentions.has(token.toLowerCase()))) continue;
    const matched = candidates.some((token) => {
      const re = new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, 'i');
      return re.test(input);
    });
    if (!matched || seen.has(option.id)) continue;
    seen.add(option.id);
    ordered.push(option.id);
  }

  return ordered;
}

export function normalizeSkillsForSend(input: string): string {
  return input.replace(/\[\[skill:([^\]]+)\]\]/g, (_match, rawName: string) => {
    const name = rawName.trim();
    return name ? `使用 ${name} 技能` : '';
  });
}

export function restoreSkillTokensFromSendText(input: string, skillNames: string[]): string {
  if (!input) return input;
  if (skillNames.length === 0) {
    return input.replace(/使用\s*([^\s，。；、,.!?！？]+)\s*技能/g, (_match, rawName: string) => {
      const name = rawName.trim();
      return name ? getSkillToken(name) : '';
    });
  }
  const normalizedNames = Array.from(new Set(skillNames.map((name) => name.trim()).filter(Boolean))).sort(
    (a, b) => b.length - a.length,
  );
  if (normalizedNames.length === 0) return input;
  let output = input;
  for (const name of normalizedNames) {
    const pattern = new RegExp(`使用\\s*${escapeRegExp(name)}\\s*技能`, 'g');
    output = output.replace(pattern, getSkillToken(name));
  }
  return output;
}

type MentionTargetLike = Pick<AgentData, 'displayName' | 'mentionPatterns'>;

export function buildResolvedMention(agent: MentionTargetLike): string | null {
  const displayName = agent.displayName.trim();
  const preferredPattern =
    agent.mentionPatterns.find(
      (pattern) => pattern.replace(/^@/, '').trim().toLowerCase() === displayName.toLowerCase(),
    ) ?? agent.mentionPatterns[0];
  if (!preferredPattern) return null;
  const alias = preferredPattern.replace(/^@/, '').trim();
  return alias ? `@${alias}` : null;
}

export function stripExpertCardMentionPrefix(content: string, displayNames: string[]): string {
  const displayPrefix = displayNames.map((name) => `@${name}`).join('');
  if (displayPrefix && content.startsWith(displayPrefix)) {
    return content
      .slice(displayPrefix.length)
      .replace(/^[，,]\s*/, '')
      .trimStart();
  }
  return content.replace(/^(?:@[^@\s，,]+)+[，,]?\s*/, '').trimStart();
}

export function getSkillInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [initial] = Array.from(trimmed);
  return /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
}

export function mergeFilesByName(
  prev: File[],
  incoming: File[],
  maxCount = MAX_ATTACHMENT_FILES,
): { files: File[]; dropped: number } {
  const next = [...prev];
  let dropped = 0;
  for (const file of incoming) {
    const normalizedName = file.name.toLowerCase();
    const existingIndex = next.findIndex((item) => item.name.toLowerCase() === normalizedName);
    if (existingIndex >= 0) {
      next[existingIndex] = file;
      continue;
    }
    if (next.length >= maxCount) {
      dropped += 1;
      continue;
    }
    next.push(file);
  }
  return { files: next.slice(0, maxCount), dropped };
}
