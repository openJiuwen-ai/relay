/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { type LocalGeneratedFile, resolvedLocalPreviewMatchesSendFilePath } from '@/components/cli-output/local-generated-files';
import { useChatStore } from '@/stores/chatStore';
import type { FileBrowserState, PanelTab } from './file-browser-panel-types';

/**
 * Manages the internal state of the FileBrowserPanel.
 * When `initialPath` is provided (from store, e.g. chat artifact card deeplink),
 * selects that path and switches to **工作产物** so the sidebar + preview are visible.
 * When `initialPath` is null/absent after that, falls back to auto-select latest artifact behavior.
 */
export function useFileBrowserState(artifacts: LocalGeneratedFile[], initialPath: string | null): FileBrowserState {
  const initialTab = useChatStore((s) => s.fileBrowserInitialTab);
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab ?? 'tasks');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(initialPath);

  // Deep-link from chat / PPT cards: jump to 「工作产物」 and select the path when store passes it (may be briefly before clear).
  useEffect(() => {
    if (initialPath !== null && initialPath !== '') {
      setSelectedFilePath(initialPath);
      setActiveTab('artifacts');
    } else if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialPath, initialTab]);

  // Auto-select the latest artifact when no store-driven path applies
  useEffect(() => {
    if (activeTab !== 'artifacts') return;
    if (initialPath !== null && initialPath !== '') return;
    if (artifacts.length === 0) return;
    const latest = artifacts[artifacts.length - 1];
    if (!latest) return;
    setSelectedFilePath((prev) => {
      const stillPresent = prev && artifacts.some((a) => resolvedLocalPreviewMatchesSendFilePath(prev, a.path));
      return stillPresent ? prev : latest.path;
    });
  }, [artifacts, initialPath, activeTab]);

  const handleSetActiveTab = useCallback((tab: PanelTab) => {
    setActiveTab(tab);
  }, []);

  // Sync the current local selection to the global store so that chat cards can highlight
  useEffect(() => {
    useChatStore.setState({ fileBrowserSelectedPath: selectedFilePath });
    return () => {
      // Optional: Clear selection when unmounting
      useChatStore.setState({ fileBrowserSelectedPath: null });
    };
  }, [selectedFilePath]);

  return {
    activeTab,
    selectedFilePath,
    setActiveTab: handleSetActiveTab,
    setSelectedFilePath,
  };
}
