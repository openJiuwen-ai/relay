/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState } from 'react';
import type { LocalGeneratedFile } from '@/components/cli-output/local-generated-files';
import { ArtifactFileList } from './ArtifactFileList';
import { FileBrowserSearchBar } from './FileBrowserSearchBar';
import type { PanelTab } from './file-browser-panel-types';
import { WorkspaceFileList } from './WorkspaceFileList';

interface FileBrowserExplorerContentProps {
  activeTab: PanelTab;
  artifacts: LocalGeneratedFile[];
  projectPath: string;
  selectedFilePath: string | null;
  onSelect: (path: string) => void;
  flattenActions?: boolean;
}

export function FileBrowserExplorerContent({
  activeTab,
  artifacts,
  projectPath,
  selectedFilePath,
  onSelect,
  flattenActions = false,
}: FileBrowserExplorerContentProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileBrowserSearchBar value={searchQuery} onChange={setSearchQuery} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'artifacts' ? (
          <ArtifactFileList
            artifacts={artifacts}
            selectedFilePath={selectedFilePath}
            onSelect={onSelect}
            filterQuery={searchQuery}
            flattenActions={flattenActions}
          />
        ) : (
          <WorkspaceFileList
            projectPath={projectPath}
            selectedFilePath={selectedFilePath}
            onSelect={onSelect}
            filterQuery={searchQuery}
            flattenActions={flattenActions}
          />
        )}
      </div>
    </div>
  );
}
