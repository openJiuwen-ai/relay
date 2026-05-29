/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { SkillOption } from '@/utils/skill-options-cache';
import { OverflowTooltip } from '../../shared/OverflowTooltip';
import { useSkillMenuInput } from '../hooks/useSkillMenuInput';

const SKILL_MENU_CLASS =
  'ui-overlay-card absolute bottom-full left-0 mb-2 z-[200] flex w-[240px] flex-col overflow-visible rounded-xl p-2 shadow-[var(--overlay-shadow)]';
const SKILL_MENU_ITEM_CLASS =
  'relative flex h-[32px] w-full items-center gap-2 rounded-[6px] px-2 py-[7px] text-left text-[12px] font-normal text-[var(--overlay-text)] transition-colors';

function getSkillInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const [initial] = Array.from(trimmed);
  return /[a-z]/i.test(initial) ? initial.toUpperCase() : initial;
}

function SkillOptionIcon({ name, iconUrl }: { name: string; iconUrl?: string | null }) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" aria-hidden="true" className="h-4 w-4 shrink-0 rounded-sm object-cover" />;
  }
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[var(--surface-card-muted)] text-[10px] font-semibold text-[var(--text-label-secondary)]">
      {getSkillInitial(name)}
    </span>
  );
}

interface SkillMenuPanelProps {
  menuRef: RefObject<HTMLDivElement | null>;
  skillFilter: string;
  onSkillFilterChange: (value: string) => void;
  filteredSkillOptions: SkillOption[];
  skillOptionsLoading: boolean;
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  skillOptionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  onInsertSkill: (name: string) => void;
  onClose: () => void;
  onOpenSkillManager: () => void;
}

export function SkillMenuPanel({
  menuRef,
  skillFilter,
  onSkillFilterChange,
  filteredSkillOptions,
  skillOptionsLoading,
  selectedIdx,
  setSelectedIdx,
  skillOptionRefs,
  onInsertSkill,
  onClose,
  onOpenSkillManager,
}: SkillMenuPanelProps) {
  const { handleSkillFilterChange, handleSkillFilterKeyDown } = useSkillMenuInput({
    filteredSkillOptions,
    selectedIdx,
    setSelectedIdx,
    onInsertSkill,
    onClose,
    onSkillFilterChange,
  });

  return (
    <div ref={menuRef} className={SKILL_MENU_CLASS}>
      <div className="px-1 pt-0 pb-2">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-label-secondary)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            value={skillFilter}
            onChange={(e) => handleSkillFilterChange(e.target.value)}
            onKeyDown={handleSkillFilterKeyDown}
            placeholder="请输入关键字搜索"
            className="ui-input ui-input-underline w-full py-1 pl-6 pr-0 text-sm"
          />
        </div>
      </div>
      <div className="-mr-1 max-h-[260px] overflow-x-visible overflow-y-auto pr-1 [scrollbar-gutter:auto]">
        {skillOptionsLoading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`skill-loading-${i}`}
              className="flex h-[24px] w-full items-center gap-2 rounded-[6px] p-2"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="h-4 w-4 shrink-0 rounded-sm bg-[var(--surface-card-muted)] animate-pulse" />
              <div className="h-3 w-[120px] rounded bg-[var(--surface-card-muted)] animate-pulse" />
            </div>
          ))}
        {!skillOptionsLoading &&
          filteredSkillOptions.map((skill, i) => (
            <button
              key={skill.name}
              type="button"
              ref={(node) => {
                skillOptionRefs.current[i] = node;
              }}
              className={`${SKILL_MENU_ITEM_CLASS} ${
                i === selectedIdx ? 'bg-[var(--overlay-item-hover-bg)]' : 'hover:bg-[var(--overlay-item-hover-bg)]'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onInsertSkill(skill.name);
              }}
              onMouseEnter={() => {
                setSelectedIdx(i);
              }}
            >
              {skill.description?.trim() ? (
                <OverflowTooltip
                  content={skill.description.trim()}
                  forceShow
                  placement="right"
                  className="flex min-w-0 w-full items-center gap-2"
                  gap={8}
                >
                  <span className="flex min-w-0 w-full items-center gap-2">
                    <SkillOptionIcon name={skill.name} iconUrl={skill.iconUrl} />
                    <span className="truncate">{skill.name}</span>
                  </span>
                </OverflowTooltip>
              ) : (
                <span className="flex min-w-0 w-full items-center gap-2">
                  <SkillOptionIcon name={skill.name} iconUrl={skill.iconUrl} />
                  <span className="truncate">{skill.name}</span>
                </span>
              )}
            </button>
          ))}
        {!skillOptionsLoading && filteredSkillOptions.length === 0 && (
          <div className="px-2 py-2 text-xs text-[var(--text-label-secondary)]">无匹配技能</div>
        )}
      </div>
      <div className="p-2">
        <div className="h-px w-full bg-[var(--panel-divider)]" />
      </div>
      <button
        type="button"
        className="ui-button-default mx-2 inline-flex h-[24px] min-w-0 items-center justify-center px-3 text-[12px]"
        onMouseDown={(e) => {
          e.preventDefault();
          onOpenSkillManager();
        }}
      >
        管理技能
      </button>
    </div>
  );
}

