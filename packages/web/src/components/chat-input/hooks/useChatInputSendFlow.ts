/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AgentOption } from '../chat-input-options';
import type { SelectedTemplateSummary } from '../types';
import { normalizeMentionsForSend, normalizeSkillsForSend } from '../utils/helpers';
import { normalizeQuickActionsForSend } from './useQuickActions';
import type { DeliveryMode } from '@/stores/chat-types';
import type { MentionRef, SendMessageOptions, WhisperOptions } from '@/hooks/useSendMessage';


interface UseChatInputSendFlowParams {
  input: string;
  images: File[];
  mentionOptions: AgentOption[];
  queueAwareDisabled: boolean;
  sendTemporarilyDisabled: boolean;
  guidedModeEnabled: boolean;
  selectedQuickActionLabel?: string;
  hasPptSkillInInput: boolean;
  selectedTemplate: SelectedTemplateSummary | null;
  queueSendDisabled: boolean;
  mentionRefs: MentionRef[];
  onSend: (
    content: string,
    images?: File[],
    whisper?: WhisperOptions,
    deliveryMode?: DeliveryMode,
    sendOptions?: SendMessageOptions,
  ) => void;
  addHistoryEntry: (text: string) => void;
  setInput: (next: string | ((prev: string) => string)) => void;
  setImages: Dispatch<SetStateAction<File[]>>;
  setShowMentions: Dispatch<SetStateAction<boolean>>;
  setShowSkillMenu: Dispatch<SetStateAction<boolean>>;
  setShowWorkspaceMenu: Dispatch<SetStateAction<boolean>>;
  setSelectedTemplate: Dispatch<SetStateAction<SelectedTemplateSummary | null>>;
  setQueueExpanded: Dispatch<SetStateAction<boolean>>;
  clearMentionRefs: () => void;
  setGhostSuggestion: Dispatch<SetStateAction<string | null>>;
  ghostRef: MutableRefObject<string | null>;
  resetQuickActions: () => void;
  resolveQueueSendOptions?: () => SendMessageOptions | undefined;
}

export function useChatInputSendFlow({
  input,
  images,
  mentionOptions,
  queueAwareDisabled,
  sendTemporarilyDisabled,
  guidedModeEnabled,
  selectedQuickActionLabel,
  hasPptSkillInInput,
  selectedTemplate,
  queueSendDisabled,
  mentionRefs,
  onSend,
  addHistoryEntry,
  setInput,
  setImages,
  setShowMentions,
  setShowSkillMenu,
  setShowWorkspaceMenu,
  setSelectedTemplate,
  setQueueExpanded,
  clearMentionRefs,
  setGhostSuggestion,
  ghostRef,
  resetQuickActions,
  resolveQueueSendOptions,
}: UseChatInputSendFlowParams) {
  const doSend = useCallback(
    (deliveryMode?: DeliveryMode): boolean => {
      if (sendTemporarilyDisabled) return false;
      const trimmed = input.trim();
      const payload = normalizeMentionsForSend(
        normalizeSkillsForSend(normalizeQuickActionsForSend(trimmed)),
        mentionOptions,
      );
      if (payload && !queueAwareDisabled) {
        // Preserve raw user-typed tokens (e.g. [[skill:xxx]]) in history so
        // Tab/ArrowRight completion can restore highlighted rich tokens.
        addHistoryEntry(trimmed);
        const sendOptions: SendMessageOptions = {
          ...(guidedModeEnabled ? { interactiveAsk: true } : {}),
          ...((selectedQuickActionLabel === '幻灯片' || hasPptSkillInInput) && selectedTemplate
            ? { pptTemplateId: selectedTemplate.id }
            : {}),
          ...(mentionRefs.length > 0 ? { mentionRefs } : {}),
          ...(deliveryMode === 'queue' ? resolveQueueSendOptions?.() : {}),
        };
        onSend(
          payload,
          images.length > 0 ? images : undefined,
          undefined,
          deliveryMode,
          Object.keys(sendOptions).length > 0 ? sendOptions : undefined,
        );
        setInput('');
        ghostRef.current = null;
        setGhostSuggestion(null);
        setImages([]);
        setShowMentions(false);
        setShowSkillMenu(false);
        setShowWorkspaceMenu(false);
        setSelectedTemplate(null);
        clearMentionRefs();
        resetQuickActions();
        return true;
      }
      return false;
    },
    [
      addHistoryEntry,
      mentionOptions,
      ghostRef,
      guidedModeEnabled,
      hasPptSkillInInput,
      mentionRefs,
      images,
      input,
      onSend,
      queueAwareDisabled,
      resetQuickActions,
      selectedQuickActionLabel,
      selectedTemplate,
      sendTemporarilyDisabled,
      setGhostSuggestion,
      setImages,
      setInput,
      setSelectedTemplate,
      setShowMentions,
      setShowSkillMenu,
      setShowWorkspaceMenu,
      clearMentionRefs,
      resolveQueueSendOptions,
    ],
  );

  const handleSend = useCallback((): boolean => doSend(undefined), [doSend]);

  const handleQueueSend = useCallback((): boolean => {
    if (queueSendDisabled) return false;
    setQueueExpanded(true);
    return doSend('queue');
  }, [doSend, queueSendDisabled, setQueueExpanded]);

  return {
    handleSend,
    handleQueueSend,
  };
}

