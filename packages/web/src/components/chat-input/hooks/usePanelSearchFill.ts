/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AgentOption } from '../chat-input-options';
import type { SkillOption } from '@/utils/skill-options-cache';

interface UsePanelSearchFillParams {
  agentOptions: AgentOption[];
  skillOptions: SkillOption[];
  setSelectedIdx: Dispatch<SetStateAction<number>>;
}

export function usePanelSearchFill({ agentOptions, skillOptions, setSelectedIdx }: UsePanelSearchFillParams) {
  const [mentionFilter, setMentionFilterState] = useState('');
  const [skillFilter, setSkillFilterState] = useState('');

  const filteredAgentOptions = useMemo(() => {
    if (!mentionFilter) return agentOptions;
    const lower = mentionFilter.toLowerCase();
    return agentOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lower) ||
        opt.insert.toLowerCase().includes(lower) ||
        opt.id.toLowerCase().includes(lower),
    );
  }, [agentOptions, mentionFilter]);

  const filteredSkillOptions = useMemo(() => {
    const lower = skillFilter.trim().toLowerCase();
    if (!lower) return skillOptions;
    return skillOptions.filter((item) => item.name.toLowerCase().includes(lower));
  }, [skillFilter, skillOptions]);

  const setMentionFilterValue = useCallback((value: string) => {
    setMentionFilterState(value);
  }, []);

  const onMentionSearchChange = useCallback(
    (value: string) => {
      setMentionFilterState(value);
      setSelectedIdx(0);
    },
    [setSelectedIdx],
  );

  const onSkillSearchChange = useCallback(
    (value: string) => {
      setSkillFilterState(value);
      setSelectedIdx(0);
    },
    [setSelectedIdx],
  );

  const clearMentionFilter = useCallback(() => setMentionFilterState(''), []);
  const clearSkillFilter = useCallback(() => setSkillFilterState(''), []);
  const clearSearchFilters = useCallback(() => {
    setMentionFilterState('');
    setSkillFilterState('');
  }, []);

  return {
    mentionFilter,
    skillFilter,
    filteredAgentOptions,
    filteredSkillOptions,
    setMentionFilterValue,
    onMentionSearchChange,
    onSkillSearchChange,
    clearMentionFilter,
    clearSkillFilter,
    clearSearchFilters,
  };
}
