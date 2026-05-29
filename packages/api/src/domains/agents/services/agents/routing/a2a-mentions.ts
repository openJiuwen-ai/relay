/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * A2A Mention Detection
 * 从猫回复文本中检测对其他猫的 @mention。
 *
 * 规则 (F046 简化 — 行首即路由):
 * 1. 剥离围栏代码块 (```...```) 后再解析
 * 2. 仅匹配行首 mention（可带前导空白）→ 直接路由，无需动作词
 * 3. 长匹配优先 + token boundary，避免 `@opus-45` 误命中 `@opus`
 * 4. 过滤自调用
 * 5. F27: 返回所有匹配的猫 (上限 MAX_A2A_MENTION_TARGETS)
 * 6. 只在猫回复完整结束后解析 (由调用方保证)
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';
import { isAgentAvailable } from '../../../../../config/office-claw-config-loader.js';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';

const log = createModuleLogger('a2a-mentions');

/** Max A2A chain depth, configurable via env (read at call time for hot-reload) */
export function getMaxA2ADepth(): number {
  return Number(process.env.MAX_A2A_DEPTH) || 15;
}

/** Max number of distinct cats a single message can @mention (F27 safety limit) */
const MAX_A2A_MENTION_TARGETS = 2;
const TOKEN_BOUNDARY_RE = /[\s,.:;!?()[\]{}<>，。！？、：；（）【】《》「」『』〈〉]/;
// If the next char looks like part of a handle token, treat it as NOT a boundary.
// This avoids prefix-matching `@opus-45` as `@opus`, while still allowing `@opus请看`.
const HANDLE_CONTINUATION_RE = /[a-z0-9_.-]/;

interface MentionPatternEntry {
  readonly agentId: AgentId;
  readonly pattern: string;
}

/** @deprecated Suppression system removed — line-start mentions always route. Kept for backward compat. */
export type MentionSuppressionReason = 'no_action' | 'cross_paragraph';

/** @deprecated Suppression system removed. Kept for backward compat. */
export interface SuppressedA2AMention {
  readonly agentId: AgentId;
  readonly reason: MentionSuppressionReason;
}

export interface A2AMentionAnalysis {
  readonly mentions: AgentId[];
  /** @deprecated Always empty — suppression system removed. */
  readonly suppressed: SuppressedA2AMention[];
}

/** @deprecated Mode is ignored — line-start mentions always route regardless of mode. */
export type MentionActionabilityMode = 'strict' | 'relaxed';

export interface A2AMentionParseOptions {
  /** @deprecated Ignored — line-start mentions always route. Kept for backward compat. */
  readonly mode?: MentionActionabilityMode;
}

/**
 * Parse A2A @mentions from agent response text.
 * F27: Returns all matched AgentIds (up to MAX_A2A_MENTION_TARGETS).
 *
 * Line-start @mention = always actionable. No keyword gate.
 */
export function parseA2AMentions(text: string, currentAgentId?: AgentId, _options: A2AMentionParseOptions = {}): AgentId[] {
  return analyzeA2AMentions(text, currentAgentId, _options).mentions;
}

export function analyzeA2AMentions(
  text: string,
  currentAgentId?: AgentId,
  _options: A2AMentionParseOptions = {},
): A2AMentionAnalysis {
  if (!text) return { mentions: [], suppressed: [] };

  // 1. Strip fenced code blocks
  const stripped = text.replace(/```[\s\S]*?```/g, '');

  // F32-a: prefer officeClawRegistry, fallback to static OFFICE_CLAW_CONFIGS
  const allConfigs = Object.keys(officeClawRegistry.getAllConfigs()).length > 0 ? officeClawRegistry.getAllConfigs() : OFFICE_CLAW_CONFIGS;

  // 2. Build patterns and sort longest-first to avoid prefix collisions
  const entries: MentionPatternEntry[] = [];
  for (const [id, config] of Object.entries(allConfigs)) {
    if (currentAgentId && id === currentAgentId) continue; // 4. Filter self (skip when cross-thread)
    if (!isAgentAvailable(id)) continue;
    for (const pattern of config.mentionPatterns) {
      entries.push({ agentId: id as AgentId, pattern: pattern.toLowerCase() });
    }
  }
  entries.sort((a, b) => b.pattern.length - a.pattern.length);

  // 3. Line-start matching with token boundary — always actionable (no keyword gate)
  const found: AgentId[] = [];
  const seen = new Set<string>();
  const lines = stripped.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex]!;
    if (found.length >= MAX_A2A_MENTION_TARGETS) break; // 5. Safety limit

    const leadingWs = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const normalized = rawLine.slice(leadingWs).toLowerCase();
    if (!normalized.startsWith('@')) {
      continue;
    }

    let matched = false;
    for (const entry of entries) {
      if (!normalized.startsWith(entry.pattern)) continue;
      const charAfter = normalized[entry.pattern.length];
      const isBoundary = !charAfter || TOKEN_BOUNDARY_RE.test(charAfter) || !HANDLE_CONTINUATION_RE.test(charAfter);
      if (!isBoundary) {
        log.debug(
          { lineIndex, pattern: entry.pattern, charAfter, agentId: entry.agentId },
          'A2A mention pattern matched but token boundary failed',
        );
        continue;
      }
      if (!seen.has(entry.agentId)) {
        seen.add(entry.agentId);
        found.push(entry.agentId);
        log.debug({ lineIndex, agentId: entry.agentId, pattern: entry.pattern }, 'A2A mention matched');
      }
      matched = true;
      break; // longest-match-first: lock one winner for this line
    }
    if (!matched) {
      log.debug(
        { lineIndex, lineLen: rawLine.length, currentAgentId },
        'Line starts with @ but no pattern matched',
      );
    }
  }

  if (found.length > 0 || stripped.includes('@')) {
    log.debug(
      { currentAgentId, found, totalLines: lines.length, hasAtSign: stripped.includes('@') },
      'A2A mention parse result',
    );
  }

  return { mentions: found, suppressed: [] };
}
