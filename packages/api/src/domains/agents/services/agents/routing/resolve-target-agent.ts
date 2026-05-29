/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { type AgentId, agentRegistry, createAgentId } from '@openjiuwen/relay-shared';

export type ResolveTargetAgentResult =
  | {
      ok: true;
      agentId: AgentId;
      displayName: string;
    }
  | {
      ok: false;
      errorCode: 'unknown_target' | 'ambiguous_target';
      message: string;
      candidates?: Array<{ agentId: AgentId; displayName: string }>;
    };

function readOptionalAliases(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const aliases = (config as { aliases?: unknown }).aliases;
  if (!Array.isArray(aliases)) return [];
  return aliases.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
}

function normalizeTargetName(value: string): string {
  return value.trim().replace(/^@+/, '').replace(/[\s_-]+/g, '').toLowerCase();
}

export function resolveTargetAgent(target: string): ResolveTargetAgentResult {
  const trimmed = target.trim();
  if (!trimmed) {
    return {
      ok: false,
      errorCode: 'unknown_target',
      message: 'Target agent name is empty.',
    };
  }

  if (agentRegistry.has(trimmed)) {
    const entry = agentRegistry.getOrThrow(trimmed);
    return {
      ok: true,
      agentId: createAgentId(trimmed),
      displayName: entry.config.displayName,
    };
  }

  const normalizedTarget = normalizeTargetName(trimmed);
  const matches: Array<{ agentId: AgentId; displayName: string }> = [];

  for (const agentId of agentRegistry.getAllIds()) {
    const entry = agentRegistry.tryGet(agentId);
    if (!entry) continue;

    const candidates = [
      String(agentId),
      entry.config.displayName,
      ...(entry.config.nickname ? [entry.config.nickname] : []),
      ...entry.config.mentionPatterns.map((pattern) => pattern.replace(/^@+/, '')),
      ...readOptionalAliases(entry.config),
    ];

    const matched = candidates.some((candidate) => normalizeTargetName(candidate) === normalizedTarget);
    if (!matched) continue;

    matches.push({
      agentId,
      displayName: entry.config.displayName,
    });
  }

  if (matches.length === 0) {
    return {
      ok: false,
      errorCode: 'unknown_target',
      message: `Unknown target agent: ${trimmed}`,
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      errorCode: 'ambiguous_target',
      message: `Ambiguous target agent: ${trimmed}`,
      candidates: matches,
    };
  }

  return {
    ok: true,
    agentId: matches[0]!.agentId,
    displayName: matches[0]!.displayName,
  };
}
