/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import type { AgentOption } from '../chat-input-options';

interface UseMentionMenuInputParams {
  agentOptions: AgentOption[];
  selectedIdx: number;
  onSelectIdx: (i: number) => void;
  onInsertMention: (opt: AgentOption) => void;
  onCloseMentionMenu: () => void;
  onMentionFilterChange: (value: string) => void;
}

export function useMentionMenuInput({
  agentOptions,
  selectedIdx,
  onSelectIdx,
  onInsertMention,
  onCloseMentionMenu,
  onMentionFilterChange,
}: UseMentionMenuInputParams) {
  const handleMentionFilterChange = useCallback(
    (value: string) => {
      onMentionFilterChange(value);
      onSelectIdx(0);
    },
    [onMentionFilterChange, onSelectIdx],
  );

  const handleMentionFilterKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (agentOptions.length === 0) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCloseMentionMenu();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        onSelectIdx((selectedIdx + 1) % agentOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onSelectIdx((selectedIdx - 1 + agentOptions.length) % agentOptions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const opt = agentOptions[selectedIdx];
        if (opt) onInsertMention(opt);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseMentionMenu();
      }
    },
    [agentOptions, onCloseMentionMenu, onInsertMention, onSelectIdx, selectedIdx],
  );

  return {
    handleMentionFilterChange,
    handleMentionFilterKeyDown,
  };
}
