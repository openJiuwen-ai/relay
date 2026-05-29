/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { LocalGeneratedFile } from '@/components/cli-output/local-generated-files';
import { FileBrowserExplorerContent } from './FileBrowserExplorerContent';
import type { PanelTab } from './file-browser-panel-types';

interface FileBrowserSidebarProps {
  isNarrow: boolean;
  activeTab: PanelTab;
  artifacts: LocalGeneratedFile[];
  projectPath: string;
  selectedFilePath: string | null;
  onSelect: (path: string) => void;
}

/**
 * Left sidebar for the file browser tabs (artifacts / workspace).
 * Hidden when the panel is narrower than the collapse threshold.
 */
export function FileBrowserSidebar({
  isNarrow,
  activeTab,
  artifacts,
  projectPath,
  selectedFilePath,
  onSelect,
}: FileBrowserSidebarProps) {
  if (isNarrow) return null;
  return (
    <div className="flex h-full w-[296px] shrink-0 flex-col overflow-hidden border-r border-[#F0F0F0] bg-white px-[14px] pb-3 pt-3">
      <FileBrowserExplorerContent
        activeTab={activeTab}
        artifacts={artifacts}
        projectPath={projectPath}
        selectedFilePath={selectedFilePath}
        onSelect={onSelect}
      />
    </div>
  );
}
