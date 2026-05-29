/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ChatMessage } from '@/stores/chatStore';

/**
 * A lightweight "content version" string for scroll-UI recomputation.
 *
 * Purpose: detect cases where scrollHeight changes without scroll/resize events,
 * such as streaming chunks that append to an existing message (no messages.length change).
 */
export function computeScrollRecomputeSignal(
  threadId: string,
  messages: ChatMessage[],
  uiExpansionSignal?: unknown,
): string {
  const tail = messages.slice(-3);
  const tailSig = tail
    .map((m) => {
      const thinkingLen = m.thinking ? m.thinking.length : 0;
      const toolEventsLen = m.toolEvents ? m.toolEvents.length : 0;
      const blocksLen = m.contentBlocks ? m.contentBlocks.length : 0;
      const richBlocksLen = m.extra?.rich?.blocks ? m.extra.rich.blocks.length : 0;
      return `${m.id}:${m.content.length}:${thinkingLen}:${toolEventsLen}:${blocksLen}:${richBlocksLen}:${m.isStreaming ? 1 : 0}`;
    })
    .join('|');
  const uiSig = uiExpansionSignal === undefined ? '' : String(uiExpansionSignal);
  return `${threadId}:${messages.length}:${tailSig}:${uiSig}`;
}
