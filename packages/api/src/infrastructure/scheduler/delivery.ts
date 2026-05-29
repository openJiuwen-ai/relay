/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Phase 4 (AC-H1): Delivery function factory for scheduled task execution.
 * Templates call deliver() to post messages to threads without going through MCP callbacks.
 */
import type { DeliverOpts } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export interface DeliveryDeps {
  messageStore: { append: AnyFn };
  socketManager: { broadcastAgentMessage: AnyFn };
}

const SCHEDULER_SOURCE = {
  connector: 'scheduler',
  label: '定时任务',
  icon: 'scheduler',
} as const;

export function createDeliverFn(deps: DeliveryDeps): (opts: DeliverOpts) => Promise<string> {
  return async (opts: DeliverOpts): Promise<string> => {
    const stored = await deps.messageStore.append({
      userId: opts.userId,
      agentId: opts.agentId,
      content: opts.content,
      mentions: [],
      origin: 'callback',
      timestamp: Date.now(),
      threadId: opts.threadId,
      source: SCHEDULER_SOURCE,
    });
    deps.socketManager.broadcastAgentMessage(
      {
        type: 'text',
        agentId: opts.agentId,
        content: opts.content,
        origin: 'callback',
        messageId: stored.id,
        timestamp: Date.now(),
        source: SCHEDULER_SOURCE,
      },
      opts.threadId,
    );
    return stored.id;
  };
}
