/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from '@openjiuwen/relay-shared';

export interface ParsedMention {
  targetAgentId: AgentId;
}

// ASCII + CJK full-width punctuation + brackets that can follow a mention
const MENTION_BOUNDARY_RIGHT = '[\\s,.:;!?，。！？；：、)\\]）】」』]';
// Left boundary: @ must not be preceded by word chars or dots (rejects email/domain)
const MENTION_BOUNDARY_LEFT = '(?<!\\w)';

function normalizeConnectorMentionText(text: string): string {
  return text.replaceAll('＠', '@');
}

/**
 * Parse @-mentions from external platform message text.
 * Returns the **first-in-text** matched agent or defaultAgentId.
 *
 * @param text — inbound message text
 * @param allPatterns — Map<AgentId, mentionPatterns[]> from officeClawRegistry
 * @param defaultAgentId — fallback when no mention found
 */
export function parseMentions(text: string, allPatterns: Map<string, string[]>, defaultAgentId: AgentId): ParsedMention {
  const normalizedText = normalizeConnectorMentionText(text);
  let bestIndex = Infinity;
  let bestAgentId: string | undefined;

  for (const [agentId, patterns] of allPatterns) {
    for (const pattern of patterns) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${MENTION_BOUNDARY_LEFT}${escaped}(?=${MENTION_BOUNDARY_RIGHT}|$)`, 'i');
      const match = regex.exec(normalizedText);
      if (match && match.index < bestIndex) {
        bestIndex = match.index;
        bestAgentId = agentId;
      }
    }
  }

  return { targetAgentId: (bestAgentId ?? defaultAgentId) as AgentId };
}
