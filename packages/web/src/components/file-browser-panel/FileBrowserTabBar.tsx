/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { PanelTab } from './file-browser-panel-types';
import { PreviewPanelFolderOpenIcon } from './file-browser-folder-icons';

interface FileBrowserTabBarProps {
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  showFileActions?: boolean;
  canOpenFolder?: boolean;
  isFullScreen?: boolean;
  onOpenFolder?: () => void;
  onToggleFullscreen?: () => void;
}

const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'tasks', label: '任务列表' },
  { id: 'artifacts', label: '工作产物' },
  { id: 'workspace', label: '全部文件' },
];

function TabBarFolderIcon() {
  return <PreviewPanelFolderOpenIcon width={18} height={18} />;
}

function TabBarFullscreenIcon({ exit }: { exit: boolean }) {
  if (exit) {
    return (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <title>退出全屏</title>
        <path
          fill="currentColor"
          fillRule="nonzero"
          d="M5.96105 8.53895C6.78948 8.53895 7.46105 9.21052 7.46105 10.0389L7.46105 13.5C7.46105 13.7761 7.23719 14 6.96105 14C6.68491 14 6.46105 13.7761 6.46105 13.5L6.46067 10.2453L3.15939 13.5477C2.96413 13.743 2.64755 13.743 2.45228 13.5477C2.25702 13.3525 2.25702 13.0359 2.45228 12.8406L5.754 9.53867L2.5 9.53895C2.24687 9.53895 2.03767 9.35085 2.00456 9.1068L2 9.03895C2 8.76281 2.22386 8.53895 2.5 8.53895L5.96105 8.53895ZM9.03895 2C9.31509 2 9.53895 2.22386 9.53895 2.5L9.53867 5.754L12.8406 2.45228C13.0359 2.25702 13.3525 2.25702 13.5477 2.45228C13.743 2.64755 13.743 2.96413 13.5477 3.15939L10.2453 6.46067L13.5 6.46105C13.7531 6.46105 13.9623 6.64915 13.9954 6.8932L14 6.96105C14 7.23719 13.7761 7.46105 13.5 7.46105L10.0389 7.46105C9.21052 7.46105 8.53895 6.78948 8.53895 5.96105L8.53895 2.5C8.53895 2.22386 8.76281 2 9.03895 2Z"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <title>全屏预览</title>
      <path
        fill="currentColor"
        fillRule="nonzero"
        d="M2.5 8.53895C2.77614 8.53895 3 8.76281 3 9.03895L3 12.292L6.30166 8.99123C6.49692 8.79597 6.8135 8.79597 7.00877 8.99123C7.20403 9.1865 7.20403 9.50308 7.00877 9.69834L3.70667 13L6.96105 13C7.21418 13 7.42338 13.1881 7.45649 13.4322L7.46105 13.5C7.46105 13.7761 7.23719 14 6.96105 14L3.5 14C2.67157 14 2 13.3284 2 12.5L2 9.03895C2 8.76281 2.22386 8.53895 2.5 8.53895ZM12.5 2C13.3284 2 14 2.67157 14 3.5L14 6.96105C14 7.23719 13.7761 7.46105 13.5 7.46105C13.2239 7.46105 13 7.23719 13 6.96105L13 3.70667L9.69834 7.00877C9.50308 7.20403 9.1865 7.20403 8.99123 7.00877C8.79597 6.8135 8.79597 6.49692 8.99123 6.30166L12.2927 2.99933L9.03895 3C8.78582 3 8.57662 2.8119 8.54351 2.56785L8.53895 2.5C8.53895 2.22386 8.76281 2 9.03895 2L12.5 2Z"
      />
    </svg>
  );
}

export function FileBrowserTabBar({
  activeTab,
  onTabChange,
  onClose,
  showFileActions = false,
  canOpenFolder = false,
  isFullScreen = false,
  onOpenFolder,
  onToggleFullscreen,
}: FileBrowserTabBarProps) {
  return (
    <div className="flex min-h-[48px] shrink-0 items-center gap-2 border-b border-[#F0F0F0] bg-white px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`shrink-0 rounded-lg px-[14px] py-2 text-[14px] font-medium leading-5 transition-colors ${
              activeTab === tab.id
                ? 'bg-[#F5F5F7] text-[#1F1F1F]'
                : 'text-[#8C8C8C] hover:bg-[#FAFAFA] hover:text-[#434343]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {showFileActions && canOpenFolder && onOpenFolder ? (
          <button
            type="button"
            onClick={() => {
              void onOpenFolder();
            }}
            className="flex size-8 items-center justify-center rounded-md text-[#434343] transition-colors hover:bg-[#F5F5F7]"
            title="打开文件所在文件夹"
          >
            <TabBarFolderIcon />
          </button>
        ) : null}
        {onToggleFullscreen ? (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex size-8 items-center justify-center rounded-md text-[#434343] transition-colors hover:bg-[#F5F5F7]"
            title={isFullScreen ? '退出全屏' : '全屏预览'}
          >
            <TabBarFullscreenIcon exit={isFullScreen} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#8C8C8C] transition-colors hover:bg-[#F5F5F7] hover:text-[#434343]"
          title="关闭"
          aria-label="关闭"
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" aria-hidden>
            <title>关闭</title>
            <path d="M3 3l8 8M11 3l-8 8" strokeWidth="1.35" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
