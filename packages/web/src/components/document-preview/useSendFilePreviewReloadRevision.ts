/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import { countSendFileToUserHitsForResolvedPreviewPath } from '@/components/cli-output/local-generated-files';
import { toCliEvents } from '@/components/cli-output/toCliEvents';
import type { ChatMessage, CliEvent } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';

const EMPTY_MESSAGES: readonly ChatMessage[] = [];

/** CLI timeline preserved in message order — matches chat bubble sequence. */
export function chronologicalCliEventsFromMessages(messages: readonly ChatMessage[]): CliEvent[] {
  const events: CliEvent[] = [];
  for (const m of messages) {
    if (!m.toolEvents?.length) continue;
    events.push(...toCliEvents(m.toolEvents, undefined, { padUnmatchedToolResults: true }));
  }
  return events;
}

/** When the assistant calls `send_file_to_user` for the previewed path again, this count increases so embedded fetch hooks can reload. */
export function useSendFilePreviewReloadRevision(threadId: string, resolvedPreviewPath: string | null | undefined): number {
  const messages = useChatStore((s) => {
    if (threadId === s.currentThreadId) return s.messages;
    return s.threadStates[threadId]?.messages ?? EMPTY_MESSAGES;
  });

  return useMemo(() => {
    if (!resolvedPreviewPath?.trim()) return 0;
    const cli = chronologicalCliEventsFromMessages(messages);
    return countSendFileToUserHitsForResolvedPreviewPath(cli, resolvedPreviewPath.trim());
  }, [messages, resolvedPreviewPath]);
}
