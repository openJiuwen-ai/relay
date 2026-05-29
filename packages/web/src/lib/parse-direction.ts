/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F098: Parse direction info from a chat message for display as a pill badge.
 * Priority: whisper > crossPost > @mention in content.
 */

export interface DirectionInfo {
  type: 'mention' | 'crossPost' | 'whisper';
  targets: string[];
  arrow: '→' | '↗';
}

interface MessageLike {
  origin?: 'stream' | 'callback';
  content: string;
  visibility?: 'public' | 'whisper';
  whisperTo?: string[];
  extra?: { crossPost?: { sourceThreadId: string }; targetAgents?: string[] };
  source?: { connector?: string; meta?: { targets?: string[]; initiator?: string } };
}

interface MentionData {
  toAgent: Record<string, string>;
  re: RegExp;
}

export function parseDirection(message: MessageLike, getMentionData: () => MentionData): DirectionInfo | null {
  // Whisper — highest priority, has explicit targets
  if (message.visibility === 'whisper' && message.whisperTo?.length) {
    return { type: 'whisper', targets: message.whisperTo, arrow: '→' };
  }

  // CrossPost — has source thread metadata
  if (message.extra?.crossPost?.sourceThreadId) {
    const shortId = message.extra.crossPost.sourceThreadId.replace(/^thread_/, '').slice(0, 8);
    return { type: 'crossPost', targets: [shortId], arrow: '↗' };
  }

  // F098-C2: Connector messages with explicit targets metadata (e.g. multi-mention-result)
  if (message.source?.meta?.targets?.length) {
    return { type: 'mention', targets: message.source.meta.targets, arrow: '→' };
  }

  // F098-C1: Explicit targetAgents from post_message API (takes priority over content parsing)
  if (message.extra?.targetAgents?.length) {
    return { type: 'mention', targets: message.extra.targetAgents, arrow: '→' };
  }

  // Stream messages don't need direction (agentId in header is enough)
  if (message.origin === 'stream') return null;

  // Only parse @mentions for callback messages
  if (message.origin !== 'callback') return null;

  const { toAgent, re } = getMentionData();
  const found = new Set<string>();
  re.lastIndex = 0;
  for (let match = re.exec(message.content); match !== null; match = re.exec(message.content)) {
    const alias = match[1].toLowerCase();
    const agentId = toAgent[alias];
    if (agentId && agentId !== '__co-creator__') found.add(agentId);
  }

  if (found.size > 0) {
    return { type: 'mention', targets: [...found], arrow: '→' };
  }

  return null;
}
