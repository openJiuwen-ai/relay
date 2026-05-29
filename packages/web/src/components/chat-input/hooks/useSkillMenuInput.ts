/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback } from 'react';
import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';
import type { SkillOption } from '@/utils/skill-options-cache';

interface UseSkillMenuInputParams {
  filteredSkillOptions: SkillOption[];
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  onInsertSkill: (name: string) => void;
  onClose: () => void;
  onSkillFilterChange: (value: string) => void;
}

export function useSkillMenuInput({
  filteredSkillOptions,
  selectedIdx,
  setSelectedIdx,
  onInsertSkill,
  onClose,
  onSkillFilterChange,
}: UseSkillMenuInputParams) {
  const handleSkillFilterChange = useCallback(
    (value: string) => {
      onSkillFilterChange(value);
      setSelectedIdx(0);
    },
    [onSkillFilterChange, setSelectedIdx],
  );

  const handleSkillFilterKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (filteredSkillOptions.length === 0) {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((idx) => (idx + 1) % filteredSkillOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((idx) => (idx - 1 + filteredSkillOptions.length) % filteredSkillOptions.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const skill = filteredSkillOptions[selectedIdx];
        if (skill) onInsertSkill(skill.name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filteredSkillOptions, onClose, onInsertSkill, selectedIdx, setSelectedIdx],
  );

  return {
    handleSkillFilterChange,
    handleSkillFilterKeyDown,
  };
}
