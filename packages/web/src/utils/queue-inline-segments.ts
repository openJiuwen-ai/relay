/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { QUICK_ACTIONS } from '@/config/quick-actions';
import { getMentionLabel, getMentionRe } from '@/lib/mention-highlight';
import { getCachedSkillOptions } from '@/utils/skill-options-cache';
import {
  QUICK_ACTION_TOKEN_PREFIX,
  QUICK_ACTION_TOKEN_SUFFIX,
  SKILL_TOKEN_PREFIX,
  SKILL_TOKEN_SUFFIX,
} from '@/components/chat-input/utils/constants';

const QUICK_ACTIONS_SORTED = [...QUICK_ACTIONS].sort((a, b) => b.label.length - a.label.length);

export type QueueInlineToken =
  | { kind: 'mention'; label: string; start: number; end: number }
  | { kind: 'skill'; label: string; start: number; end: number }
  | { kind: 'quick'; label: string; icon?: string; start: number; end: number };

export type QueueInlineSegment = { kind: 'text'; text: string } | QueueInlineToken;

function isWhitespaceBoundary(input: string, index: number, length: number): boolean {
  const prev = index > 0 ? input[index - 1] : ' ';
  const next = index + length < input.length ? input[index + length] : ' ';
  return /\s/.test(prev) && /\s/.test(next);
}

function extractQueueInlineTokens(content: string): QueueInlineToken[] {
  const tokens: QueueInlineToken[] = [];
  const mentionRe = getMentionRe();
  const mentionLabelMap = getMentionLabel();
  const skillNameSet = new Set(
    (getCachedSkillOptions() ?? [])
      .map((item) => item.name.trim().toLowerCase())
      .filter(Boolean),
  );

  mentionRe.lastIndex = 0;
  let mentionMatch: RegExpExecArray | null;
  while ((mentionMatch = mentionRe.exec(content)) !== null) {
    const alias = (mentionMatch[1] ?? '').toLowerCase();
    const label = mentionLabelMap[alias] ?? mentionMatch[0];
    if (!label) continue;
    const full = mentionMatch[0] ?? '';
    tokens.push({ kind: 'mention', label, start: mentionMatch.index, end: mentionMatch.index + full.length });
  }

  const skillPhraseRe = /(使用\s+)([^\n，。！？,.!?]{1,60}?)(\s+技能)/g;
  let skillMatch: RegExpExecArray | null;
  while ((skillMatch = skillPhraseRe.exec(content)) !== null) {
    const skillName = (skillMatch[2] ?? '').trim();
    if (!skillName) continue;
    if (skillNameSet.size > 0 && !skillNameSet.has(skillName.toLowerCase())) continue;
    const full = skillMatch[0] ?? '';
    tokens.push({ kind: 'skill', label: skillName, start: skillMatch.index, end: skillMatch.index + full.length });
  }

  const quickByIndex = new Map<number, QueueInlineToken>();
  for (const action of QUICK_ACTIONS_SORTED) {
    const label = action.label;
    if (!label) continue;
    let from = 0;
    while (from < content.length) {
      const at = content.indexOf(label, from);
      if (at < 0) break;
      from = at + 1;
      if (!isWhitespaceBoundary(content, at, label.length)) continue;
      if (!quickByIndex.has(at)) {
        quickByIndex.set(at, { kind: 'quick', label, icon: action.icon, start: at, end: at + label.length });
      }
    }
  }
  tokens.push(...quickByIndex.values());

  // 匹配显式的 [[quick_action:xxx]] token，以支持排队队列中非内置 label（如 PPT 内容核查）的芯片样式渲染
  let quickTokenFrom = 0;
  while (quickTokenFrom < content.length) {
    const at = content.indexOf(QUICK_ACTION_TOKEN_PREFIX, quickTokenFrom);
    if (at < 0) break;
    const end = content.indexOf(QUICK_ACTION_TOKEN_SUFFIX, at + QUICK_ACTION_TOKEN_PREFIX.length);
    if (end > at) {
      const label = content.slice(at + QUICK_ACTION_TOKEN_PREFIX.length, end);
      const matchedAction = QUICK_ACTIONS_SORTED.find(action => action.label === label);
      tokens.push({
        kind: 'quick',
        label,
        icon: matchedAction?.icon,
        start: at,
        end: end + QUICK_ACTION_TOKEN_SUFFIX.length,
      });
      quickTokenFrom = end + QUICK_ACTION_TOKEN_SUFFIX.length;
    } else {
      quickTokenFrom = at + 1;
    }
  }

  // 匹配显式的 [[skill:xxx]] token，以支持排队队列中显式技能的芯片样式渲染
  let skillTokenFrom = 0;
  while (skillTokenFrom < content.length) {
    const at = content.indexOf(SKILL_TOKEN_PREFIX, skillTokenFrom);
    if (at < 0) break;
    const end = content.indexOf(SKILL_TOKEN_SUFFIX, at + SKILL_TOKEN_PREFIX.length);
    if (end > at) {
      const label = content.slice(at + SKILL_TOKEN_PREFIX.length, end).trim();
      tokens.push({
        kind: 'skill',
        label,
        start: at,
        end: end + SKILL_TOKEN_SUFFIX.length,
      });
      skillTokenFrom = end + SKILL_TOKEN_SUFFIX.length;
    } else {
      skillTokenFrom = at + 1;
    }
  }

  return tokens.sort((a, b) => a.start - b.start);
}

export function buildQueueInlineSegments(content: string): QueueInlineSegment[] {
  const tokens = extractQueueInlineTokens(content);
  if (tokens.length === 0) return [{ kind: 'text', text: content }];

  const segments: QueueInlineSegment[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor) continue;
    if (token.start > cursor) {
      segments.push({ kind: 'text', text: content.slice(cursor, token.start) });
    }
    segments.push(token);
    cursor = token.end;
  }
  if (cursor < content.length) {
    segments.push({ kind: 'text', text: content.slice(cursor) });
  }
  return segments;
}
