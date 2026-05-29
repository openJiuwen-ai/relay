/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import type { Dispatch, MouseEvent, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { QuickActionConfig } from '@/config/quick-actions';
import type { SkillOption } from '@/utils/skill-options-cache';
import type { SelectedTemplateSummary } from '../types';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { SkillMenuPanel } from '@/components/chat-input/components/SkillMenuPanel';
import { GuidedModeIcon } from '@/components/icons/GuidedModeIcon';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';
import { SKILL_TRIGGER_BUTTON_CLASS } from '../utils/constants';


interface ChatInputSkillControlsProps {
  skillBtnRef: RefObject<HTMLButtonElement>;
  styleTemplateBtnRef: RefObject<HTMLButtonElement>;
  onSkillMouseDown: (e: MouseEvent<HTMLButtonElement>) => void;
  onSkillClick: () => void;
  selectedQuickAction: QuickActionConfig | null;
  guidedModeEnabled: boolean;
  onToggleGuidedMode: () => void;
  hasPptSkillInInput: boolean;
  selectedTemplate: SelectedTemplateSummary | null;
  onStyleTemplateClick: () => void;
  onClearSelectedTemplate: () => void;
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
  onOpenSkillManager: () => void;
}

export function ChatInputSkillControls({
  skillBtnRef,
  styleTemplateBtnRef,
  onSkillMouseDown,
  onSkillClick,
  selectedQuickAction,
  guidedModeEnabled,
  onToggleGuidedMode,
  hasPptSkillInInput,
  selectedTemplate,
  onStyleTemplateClick,
  onClearSelectedTemplate,
  showSkillMenu,
  menuRef,
  skillFilter,
  onSkillFilterChange,
  filteredSkillOptions,
  skillOptionsLoading,
  selectedIdx,
  setSelectedIdx,
  skillOptionRefs,
  onInsertSkill,
  onCloseMenus,
  onOpenSkillManager,
}: ChatInputSkillControlsProps) {
  return (
    <div className="relative inline-flex items-center gap-[8px]">
      <button
        ref={skillBtnRef}
        type="button"
        onMouseDown={onSkillMouseDown}
        onClick={onSkillClick}
        className={SKILL_TRIGGER_BUTTON_CLASS}
      >
        <MaskIcon src="/icons/menu/skills.svg" className="h-4 w-4 text-[var(--mask-icon)]" />
        技能
      </button>
      {selectedQuickAction?.label === '幻灯片' && (
        <OverflowTooltip
          content="开启引导模式后，将在生成前主动追问并确认细节，确保内容精准贴合需求。"
          forceShow
          className="inline-flex"
        >
          <button
            type="button"
            onClick={onToggleGuidedMode}
            className={SKILL_TRIGGER_BUTTON_CLASS}
            style={
              guidedModeEnabled
                ? {
                    color: 'var(--accent-pill-text)',
                    backgroundColor: 'var(--accent-pill-bg)',
                    borderColor: 'var(--accent-pill-text)',
                  }
                : undefined
            }
          >
            <GuidedModeIcon className="h-4 w-4 shrink-0" />
            引导模式
          </button>
        </OverflowTooltip>
      )}
      {(selectedQuickAction?.label === '幻灯片' || hasPptSkillInInput) && (
        <>
          {!selectedTemplate ? (
            <button
              ref={styleTemplateBtnRef}
              type="button"
              onClick={onStyleTemplateClick}
              className={SKILL_TRIGGER_BUTTON_CLASS}
              data-testid="chat-input-style-template-trigger"
            >
              <MaskIcon src="/icons/userprofile/style-template.svg" className="h-4 w-4 text-[var(--mask-icon)]" />
              风格模板
            </button>
          ) : (
            <OverflowTooltip content={selectedTemplate.name} className="inline-flex">
              <span
                className="inline-flex max-w-[200px] items-center gap-1 rounded-full border border-[#1476ff] bg-[#f0f7ff] px-3 py-[7px] text-xs text-[#1476ff] transition-colors hover:bg-[#e0f0ff] cursor-pointer"
                data-testid="chat-input-selected-template-pill"
                onClick={onStyleTemplateClick}
              >
                <span
                  role="button"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-[#dbeaff]"
                  aria-label="删除已选模板"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearSelectedTemplate();
                  }}
                >
                  <MaskIcon name="close" className="h-3 w-3" />
                </span>
                <span className="truncate">{selectedTemplate.name}</span>
              </span>
            </OverflowTooltip>
          )}
        </>
      )}
      {showSkillMenu && (
        <SkillMenuPanel
          menuRef={menuRef}
          skillFilter={skillFilter}
          onSkillFilterChange={onSkillFilterChange}
          filteredSkillOptions={filteredSkillOptions}
          skillOptionsLoading={skillOptionsLoading}
          selectedIdx={selectedIdx}
          setSelectedIdx={setSelectedIdx}
          skillOptionRefs={skillOptionRefs}
          onInsertSkill={onInsertSkill}
          onClose={onCloseMenus}
          onOpenSkillManager={onOpenSkillManager}
        />
      )}
    </div>
  );
}

