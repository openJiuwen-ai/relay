/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { QuickActionConfig } from '@/config/quick-actions';
import type { SkillOption } from '@/utils/skill-options-cache';
import type { SelectedTemplateSummary } from '../types';
import type { RichTextareaHandle } from './RichTextarea';
import { useBottomLeftControls } from '../hooks/useBottomLeftControls';
import { ChatInputSkillControls } from './ChatInputSkillControls';

interface ChatInputBottomLeftProps {
  input: string;
  textareaRef: RefObject<RichTextareaHandle>;
  skillInsertAnchorRef: MutableRefObject<{ start: number; end: number } | null>;
  closeMenus: () => void;
  routerPush: (path: string) => void;
  skillBtnRef: RefObject<HTMLButtonElement>;
  styleTemplateBtnRef: RefObject<HTMLButtonElement>;
  selectedQuickAction: QuickActionConfig | null;
  guidedModeEnabled: boolean;
  hasPptSkillInInput: boolean;
  selectedTemplate: SelectedTemplateSummary | null;
  showSkillMenu: boolean;
  menuRef: RefObject<HTMLDivElement>;
  skillFilter: string;
  onSkillFilterChange: (value: string) => void;
  filteredSkillOptions: SkillOption[];
  skillOptionsLoading: boolean;
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  skillOptionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  onInsertSkill: (skillName: string) => void;
  onCloseMenus: () => void;
  onSkillClick: () => void;
  onToggleGuidedMode: () => void;
  onStyleTemplateClick: () => void;
  onClearSelectedTemplate: () => void;
}

export function ChatInputBottomLeft({
  input,
  textareaRef,
  skillInsertAnchorRef,
  closeMenus,
  routerPush,
  ...rest
}: ChatInputBottomLeftProps) {
  const { onSkillMouseDown, onOpenSkillManager } = useBottomLeftControls({
    input,
    textareaRef,
    skillInsertAnchorRef,
    closeMenus,
    routerPush,
  });

  return (
    <ChatInputSkillControls
      {...rest}
      onSkillMouseDown={onSkillMouseDown}
      onOpenSkillManager={onOpenSkillManager}
    />
  );
}
