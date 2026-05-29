/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fileNameFromPath,
  inferLocalGeneratedFileKind,
  type LocalGeneratedFile,
  resolvedLocalPreviewMatchesSendFilePath,
} from '@/components/cli-output/local-generated-files';
import { useChatStore } from '@/stores/chatStore';
import { FileBrowserPreviewPane } from './FileBrowserPreviewPane';
import { FileBrowserSidebar } from './FileBrowserSidebar';
import { FileBrowserTabBar } from './FileBrowserTabBar';
import type { FileBrowserPanelProps } from './file-browser-panel-types';
import { openLocalProjectFolder, resolveFolderPath } from './file-browser-utils';
import { TaskListPanel } from './TaskListPanel';
import { useFileBrowserState } from './useFileBrowserState';
import { useWorkspaceFiles } from './useWorkspaceFiles';

/** Panel width below which the sidebar collapses into the preview header dropdown. */
const SIDEBAR_COLLAPSE_WIDTH = 960;

function fileBrowserPanelRootClass(isFullScreen: boolean, useAnchoredFullScreen: boolean): string {
  if (!isFullScreen) {
    return 'flex h-full min-h-0 w-full flex-col bg-white';
  }
  if (useAnchoredFullScreen) {
    return 'absolute inset-0 z-[100] flex min-h-0 flex-col overflow-hidden bg-white shadow-xl';
  }
  return 'fixed inset-0 z-[100] flex h-screen min-h-0 w-screen flex-col overflow-hidden bg-white shadow-xl';
}

export function FileBrowserPanel({
  artifacts,
  projectPath,
  threadId,
  onClose,
  fullScreenContainerRef,
}: FileBrowserPanelProps) {
  const fileBrowserInitialPath = useChatStore((s) => s.fileBrowserInitialPath);
  const fileBrowserInitialTab = useChatStore((s) => s.fileBrowserInitialTab);
  const clearInitialPathAndTab = useChatStore((s) => s.openFileBrowserPanel);

  useEffect(() => {
    if (fileBrowserInitialPath || fileBrowserInitialTab) {
      clearInitialPathAndTab();
    }
  }, [fileBrowserInitialPath, fileBrowserInitialTab, clearInitialPathAndTab]);

  const { activeTab, selectedFilePath, setActiveTab, setSelectedFilePath } = useFileBrowserState(
    artifacts,
    fileBrowserInitialPath,
  );

  const { entries: workspaceEntries } = useWorkspaceFiles(activeTab === 'workspace' ? projectPath : '');

  const containerRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isPreviewFullScreen, setIsPreviewFullScreen] = useState(false);
  const useAnchoredFullScreen = fullScreenContainerRef != null;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.offsetWidth;
      setIsNarrow(width < SIDEBAR_COLLAPSE_WIDTH);
    });
    observer.observe(el);
    setIsNarrow(el.offsetWidth < SIDEBAR_COLLAPSE_WIDTH);
    return () => observer.disconnect();
  }, []);

  const selectedFile: LocalGeneratedFile | null = (() => {
    if (!selectedFilePath) return null;
    const artifact = artifacts.find((a) => resolvedLocalPreviewMatchesSendFilePath(selectedFilePath, a.path));
    if (artifact) return artifact;
    const wsEntry = workspaceEntries.find((e) => e.path === selectedFilePath);
    if (wsEntry && !wsEntry.isDirectory) {
      return {
        name: wsEntry.name || fileNameFromPath(wsEntry.path),
        path: wsEntry.path,
        kind: inferLocalGeneratedFileKind(wsEntry.path, wsEntry.name),
      };
    }
    return null;
  })();

  const handleSelect = useCallback((path: string) => setSelectedFilePath(path), [setSelectedFilePath]);

  const resolvedProjectPath = projectPath && projectPath !== 'default' ? projectPath : '';

  const handleOpenFolderFromTabBar = useCallback(async () => {
    if (!selectedFile || selectedFile.isVirtual) return;
    const folder = resolveFolderPath(selectedFile.path);
    await openLocalProjectFolder(folder, resolvedProjectPath || undefined);
  }, [resolvedProjectPath, selectedFile]);

  const handleTogglePreviewFullscreen = useCallback(() => {
    setIsPreviewFullScreen((v) => !v);
  }, []);

  const isFilesTab = activeTab === 'artifacts' || activeTab === 'workspace';

  return (
    <div ref={containerRef} className={fileBrowserPanelRootClass(isPreviewFullScreen, useAnchoredFullScreen)}>
      <FileBrowserTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={onClose}
        showFileActions={isFilesTab}
        canOpenFolder={!!selectedFile && !selectedFile.isVirtual}
        isFullScreen={isPreviewFullScreen}
        onOpenFolder={handleOpenFolderFromTabBar}
        onToggleFullscreen={handleTogglePreviewFullscreen}
      />

      {activeTab === 'tasks' ? (
        <TaskListPanel />
      ) : (
        <div className="flex min-h-0 flex-1">
          <FileBrowserSidebar
            isNarrow={isNarrow}
            activeTab={activeTab}
            artifacts={artifacts}
            projectPath={projectPath}
            selectedFilePath={selectedFilePath}
            onSelect={handleSelect}
          />
          <FileBrowserPreviewPane
            isNarrow={isNarrow}
            selectedFile={selectedFile}
            artifacts={artifacts}
            threadId={threadId}
            projectPath={projectPath}
            activeTab={activeTab}
            onSelectFile={handleSelect}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  );
}
