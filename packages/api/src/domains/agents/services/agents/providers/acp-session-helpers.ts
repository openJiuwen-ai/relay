/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import type { AgentMessage, MessageMetadata } from '../../types.js';
import { transformACPUpdate } from './acp-event-transform.js';
import type { ACPStdioClient } from './acp-transport.js';

// Keep a short drain window after session/prompt resolves so trailing
// session/update notifications are still surfaced before we emit done.
const TRAILING_UPDATE_IDLE_MS = 120;
const TRAILING_UPDATE_MAX_WAIT_MS = 1200;

export function buildACPMetadata(sessionId?: string, model = 'acp'): MessageMetadata {
  return {
    provider: 'acp',
    model,
    ...(sessionId ? { sessionId } : {}),
  };
}

export function transformIncomingUpdateMessage(
  incoming: Record<string, unknown> | null,
  sessionId: string | undefined,
  agentId: AgentId,
  metadataModel = 'acp',
): AgentMessage[] {
  if (!incoming || incoming.method !== 'session/update') return [];
  const params = incoming.params;
  if (!params || typeof params !== 'object') return [];
  const updateSessionId =
    typeof (params as { sessionId?: unknown }).sessionId === 'string'
      ? ((params as { sessionId: string }).sessionId ?? '')
      : '';
  if (sessionId && updateSessionId && updateSessionId !== sessionId) return [];
  const rawUpdate = (params as { update?: unknown }).update;
  if (!rawUpdate || typeof rawUpdate !== 'object') return [];
  return transformACPUpdate(rawUpdate as Record<string, unknown>, agentId).map((message) => ({
    ...message,
    metadata: buildACPMetadata(sessionId, metadataModel),
  }));
}

export function drainQueuedUpdates(
  client: ACPStdioClient,
  sessionId: string | undefined,
  agentId: AgentId,
  metadataModel = 'acp',
): AgentMessage[] {
  const output: AgentMessage[] = [];
  for (const incoming of client.drainMessages()) {
    output.push(...transformIncomingUpdateMessage(incoming, sessionId, agentId, metadataModel));
  }
  return output;
}

export async function collectTrailingUpdates(
  client: ACPStdioClient,
  sessionId: string | undefined,
  agentId: AgentId,
  metadataModel = 'acp',
  idleMs = TRAILING_UPDATE_IDLE_MS,
  maxWaitMs = TRAILING_UPDATE_MAX_WAIT_MS,
): Promise<AgentMessage[]> {
  const output = [...drainQueuedUpdates(client, sessionId, agentId, metadataModel)];
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, idleMs));
    const drained = drainQueuedUpdates(client, sessionId, agentId, metadataModel);
    if (drained.length === 0) break;
    output.push(...drained);
  }
  return output;
}
