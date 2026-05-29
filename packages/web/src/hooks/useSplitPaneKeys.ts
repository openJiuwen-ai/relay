/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';

/**
 * Global keyboard shortcuts for split-pane mode.
 * - Cmd+1/2/3/4: Select pane by index
 * - Cmd+\\: Toggle split/single mode
 */
export function useSplitPaneKeys() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle Cmd (Mac) or Ctrl (Win/Linux) combos
      if (!e.metaKey && !e.ctrlKey) return;

      const store = useChatStore.getState();

      // Cmd+\\ → toggle split/single
      if (e.key === '\\') {
        e.preventDefault();
        store.setViewMode(store.viewMode === 'single' ? 'split' : 'single');
        return;
      }

      // Cmd+1234 → select pane (only in split mode)
      if (store.viewMode !== 'split') return;

      const paneIndex = ['1', '2', '3', '4'].indexOf(e.key);
      if (paneIndex < 0) return;

      e.preventDefault();
      const threadId = store.splitPaneThreadIds[paneIndex];
      if (threadId) {
        store.setSplitPaneTarget(threadId);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
