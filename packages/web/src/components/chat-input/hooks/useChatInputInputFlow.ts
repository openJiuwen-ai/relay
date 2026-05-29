/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { detectMenuTrigger } from '../chat-input-options';
import { clampInputLength } from '../utils/helpers';

interface UseChatInputInputFlowParams {
  setInput: (next: string | ((prev: string) => string)) => void;
  setShowMentions: Dispatch<SetStateAction<boolean>>;
  setShowSkillMenu: Dispatch<SetStateAction<boolean>>;
  setMentionStart: Dispatch<SetStateAction<number>>;
  setMentionEnd: Dispatch<SetStateAction<number>>;
  setMentionFilterValue: (value: string) => void;
  clearMentionFilter: () => void;
  clearSkillFilter: () => void;
  closeMenus: () => void;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  skillInsertAnchorRef: MutableRefObject<{ start: number; end: number } | null>;
}

export function useChatInputInputFlow({
  setInput,
  setShowMentions,
  setShowSkillMenu,
  setMentionStart,
  setMentionEnd,
  setMentionFilterValue,
  clearMentionFilter,
  clearSkillFilter,
  closeMenus,
  setSelectedIdx,
  skillInsertAnchorRef,
}: UseChatInputInputFlowParams) {
  const handleChange = useCallback(
    (val: string, selectionStart: number, selectionEnd: number) => {
      const next = clampInputLength(val);
      setInput(next);
      const normalizedSelectionStart = Math.min(selectionStart, next.length);
      const normalizedSelectionEnd = Math.min(selectionEnd, next.length);
      skillInsertAnchorRef.current = { start: normalizedSelectionStart, end: normalizedSelectionEnd };
      const trigger = detectMenuTrigger(next, normalizedSelectionStart);
      if (trigger?.type === 'mention') {
        setShowMentions(true);
        setShowSkillMenu(false);
        setMentionStart(trigger.start);
        setMentionEnd(normalizedSelectionStart);
        setMentionFilterValue(trigger.filter);
        setSelectedIdx(0);
      } else {
        closeMenus();
        setMentionStart(-1);
        setMentionEnd(-1);
        clearMentionFilter();
        clearSkillFilter();
      }
    },
    [
      clearMentionFilter,
      clearSkillFilter,
      closeMenus,
      setInput,
      setMentionEnd,
      setMentionFilterValue,
      setMentionStart,
      setSelectedIdx,
      setShowMentions,
      setShowSkillMenu,
      skillInsertAnchorRef,
    ],
  );

  return { handleChange };
}
