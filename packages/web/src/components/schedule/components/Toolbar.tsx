/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿'use client';

import { useEffect, useRef, useState } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';

type ViewMode = 'card' | 'calendar';

type ToolbarProps = {
  viewMode: ViewMode;
  weekRangeText: string;
  onChangeView: (next: ViewMode) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek: () => void;
  onCreateFromConversation: () => void;
  onCreateFromTemplate: () => void;
  onCreateCustom: () => void;
};

export function Toolbar({
  viewMode,
  weekRangeText,
  onChangeView,
  onPrevWeek,
  onNextWeek,
  onResetWeek,
  onCreateFromConversation,
  onCreateFromTemplate,
  onCreateCustom,
}: ToolbarProps) {
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isCreateMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (createMenuRef.current?.contains(event.target as Node)) return;
      setIsCreateMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isCreateMenuOpen]);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <ViewToggle viewMode={viewMode} onChangeView={onChangeView} />
        {viewMode === 'calendar' ? (
          <WeekRangeSwitcher
            weekRangeText={weekRangeText}
            onPrevWeek={onPrevWeek}
            onNextWeek={onNextWeek}
            onResetWeek={onResetWeek}
          />
        ) : null}
      </div>
      <div ref={createMenuRef} className="relative">
        <button
          type="button"
          onClick={() => setIsCreateMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={isCreateMenuOpen}
          data-testid="scheduled-task-toolbar-create"
          className="inline-flex h-[32px] min-h-[32px] min-w-[112px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap break-keep rounded-full border border-[#2C3340] bg-[#181B21] px-4 text-[12px] font-medium leading-none text-white"
        >
          <span>创建定时任务</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${isCreateMenuOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {isCreateMenuOpen ? (
          <div className="absolute right-0 top-full z-20 mt-2 w-[160px] rounded-[12px] border border-[#ECEFF3] bg-white p-2 shadow-[0_6px_20px_rgba(31,35,41,0.12)]">
            <button
              type="button"
              onClick={() => {
                setIsCreateMenuOpen(false);
                onCreateFromConversation();
              }}
              data-testid="scheduled-task-toolbar-create-conversation"
              className="flex h-8 w-full items-center rounded-[8px] px-3 text-left text-[12px] font-medium text-[#1F2329] transition-colors hover:bg-[#F5F7FA]"
            >
              从对话创建
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreateMenuOpen(false);
                onCreateFromTemplate();
              }}
              data-testid="scheduled-task-toolbar-create-template"
              className="flex h-8 w-full items-center rounded-[8px] px-3 text-left text-[12px] font-medium text-[#1F2329] transition-colors hover:bg-[#F5F7FA]"
            >
              从模板创建
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreateMenuOpen(false);
                onCreateCustom();
              }}
              data-testid="scheduled-task-toolbar-create-custom"
              className="flex h-8 w-full items-center rounded-[8px] px-3 text-left text-[12px] font-medium text-[#1F2329] transition-colors hover:bg-[#F5F7FA]"
            >
              自定义创建
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type ViewToggleProps = {
  viewMode: ViewMode;
  onChangeView: (next: ViewMode) => void;
};

function ViewToggle({ viewMode, onChangeView }: ViewToggleProps) {
  const base = 'inline-flex h-full min-w-[96px] items-center justify-center whitespace-nowrap px-[18px] text-[12px] leading-none';
  return (
    <div className="inline-flex h-7 items-center rounded-[6px] border border-[#ECECEC] bg-[#F7F7F8]">
      <button
        type="button"
        onClick={() => onChangeView('calendar')}
        className={`${base} rounded-[6px] ${
          viewMode === 'calendar'
            ? 'border border-[#ECECEC] bg-white font-semibold text-[#1F2329]'
            : 'font-medium text-[#4C5563]'
        }`}
      >
        日历视图
      </button>
      <button
        type="button"
        onClick={() => onChangeView('card')}
        className={`${base} rounded-[6px] ${
          viewMode === 'card' ? 'border border-[#ECECEC] bg-white font-semibold text-[#1F2329]' : 'font-medium text-[#4C5563]'
        }`}
      >
        卡片视图
      </button>
    </div>
  );
}

type WeekRangeSwitcherProps = {
  weekRangeText: string;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetWeek: () => void;
};

function WeekRangeSwitcher({ weekRangeText, onPrevWeek, onNextWeek, onResetWeek }: WeekRangeSwitcherProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex h-7 items-center gap-[31.5px] rounded-[6px] border border-[#F0F0F0] px-2">
        <button type="button" onClick={onPrevWeek} className="inline-flex h-5 w-5 items-center justify-center text-[#A8A8A8]">
          <MaskIcon name="chevronLeft" className="h-3.5 w-3.5" />
        </button>
        <span className="text-[12px] font-normal text-[#191919]">{weekRangeText}</span>
        <button type="button" onClick={onNextWeek} className="inline-flex h-5 w-5 items-center justify-center text-[#A8A8A8]">
          <MaskIcon name="chevronRight" className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="button"
        onClick={onResetWeek}
        className="inline-flex h-7 min-h-[28px] min-w-[84px] shrink-0 items-center justify-center whitespace-nowrap break-keep rounded-[6px] border border-[#F0F0F0] px-[10px] text-[12px] font-normal leading-none text-[#191919]"
      >
        回到本周
      </button>
    </div>
  );
}
