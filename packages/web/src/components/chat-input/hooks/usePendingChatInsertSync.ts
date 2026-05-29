/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { type MutableRefObject, type RefObject, useEffect } from 'react';
import type { MentionRef } from '@/hooks/useSendMessage';
import type { InspirationPendingChatInsert } from '@/stores/chat-types';
import type { RichTextareaHandle } from '../components/RichTextarea';

interface PendingChatInsert {
  threadId: string;
  text: string;
  replaceTrailingMentionTrigger?: boolean;
  suppressMentionMenu?: boolean;
  mentionRefs?: MentionRef[];
  /** 为 true 时直接覆盖输入框内容，不追加 */
  replaceAll?: boolean;
  inspirationData?: InspirationPendingChatInsert;
}

interface UsePendingChatInsertSyncParams {
  pendingChatInsert: PendingChatInsert | null;
  setPendingChatInsert: (value: PendingChatInsert | null) => void;
  threadId?: string;
  quickActionTokenPrefix: string;
  consumedRef: MutableRefObject<PendingChatInsert | null>;
  textareaRef: RefObject<RichTextareaHandle>;
  setInput: (next: string | ((prev: string) => string)) => void;
  onExternalQuickActionInsert: () => void;
  onExternalMentionInsert: (filter: string, start: number) => void;
  onMentionRefsChanged?: (refs: MentionRef[]) => void;
  onMentionRefsCleared?: () => void;
}

export function usePendingChatInsertSync({
  pendingChatInsert,
  setPendingChatInsert,
  threadId,
  quickActionTokenPrefix,
  consumedRef,
  textareaRef,
  setInput,
  onExternalQuickActionInsert,
  onExternalMentionInsert,
  onMentionRefsChanged,
  onMentionRefsCleared,
}: UsePendingChatInsertSyncParams) {
  const stripTrailingMentionTrigger = (value: string): string => {
    const match = value.match(/^(.*?)(\s*)@\s*$/);
    if (!match) return value;
    return `${match[1] ?? ''}${match[2] ?? ''}`;
  };

  useEffect(() => {
    if (!pendingChatInsert) return;
    if (pendingChatInsert.threadId !== threadId) return;
    if (consumedRef.current === pendingChatInsert) return;
    consumedRef.current = pendingChatInsert;

    const isQuickActionInsert =
      pendingChatInsert.text.includes(quickActionTokenPrefix) && !pendingChatInsert.inspirationData;
    const shouldReplaceTrailingMentionTrigger = pendingChatInsert.replaceTrailingMentionTrigger === true;
    const shouldReplaceAll = pendingChatInsert.replaceAll === true;
    const shouldKeepForInspirationTemplate = Boolean(pendingChatInsert.inspirationData?.prompt.includes('{{'));

    if (isQuickActionInsert) {
      setInput(pendingChatInsert.text);
      onMentionRefsCleared?.();
      onExternalQuickActionInsert();
      setPendingChatInsert(null);
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(pendingChatInsert.text.length, pendingChatInsert.text.length);
      }, 0);
      return;
    }

    const mentionMatch = pendingChatInsert.text.match(/^@(\S+)/);
    const isMentionInsert = !!mentionMatch;

    if (isMentionInsert) {
      const filter = mentionMatch[1] ?? '';
      setInput((prev) => {
        const base = shouldReplaceTrailingMentionTrigger ? stripTrailingMentionTrigger(prev) : prev;
        const separator = base && !base.endsWith('\n') ? '\n' : '';
        return base + separator + pendingChatInsert.text;
      });
      if (pendingChatInsert.mentionRefs?.length) {
        onMentionRefsChanged?.(pendingChatInsert.mentionRefs);
      } else {
        onMentionRefsCleared?.();
      }
      setPendingChatInsert(null);
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        if (!pendingChatInsert.suppressMentionMenu) {
          onExternalMentionInsert(filter, 0);
        }
      }, 0);
    } else {
      if (shouldReplaceAll) {
        // 覆盖模式：直接替换输入框内容
        setInput(pendingChatInsert.text);
      } else {
        setInput((prev) => {
          const base = shouldReplaceTrailingMentionTrigger ? stripTrailingMentionTrigger(prev) : prev;
          const separator = base && !base.endsWith('\n') ? '\n' : '';
          return base + separator + pendingChatInsert.text;
        });
      }
      if (pendingChatInsert.mentionRefs?.length) {
        onMentionRefsChanged?.(pendingChatInsert.mentionRefs);
      } else {
        onMentionRefsCleared?.();
      }

      // Keep placeholder templates for useInspirationTemplate; plain inspiration inserts can be consumed here.
      if (!shouldKeepForInspirationTemplate) {
        setPendingChatInsert(null);
      }

      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
      }, 0);
    }
  }, [
    consumedRef,
    onExternalQuickActionInsert,
    onExternalMentionInsert,
    onMentionRefsChanged,
    onMentionRefsCleared,
    pendingChatInsert,
    quickActionTokenPrefix,
    setInput,
    setPendingChatInsert,
    textareaRef,
    threadId,
  ]);
}
