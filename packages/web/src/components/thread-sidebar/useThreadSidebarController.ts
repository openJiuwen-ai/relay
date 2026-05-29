/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ThreadSidebarControllerResult, ThreadSidebarProps } from './thread-sidebar-types';
import { useThreadSidebarActions } from './useThreadSidebarActions';
import { useThreadSidebarData } from './useThreadSidebarData';
import { useThreadSidebarLayout } from './useThreadSidebarLayout';

export function useThreadSidebarController({
  onClose,
  className,
  onThreadSelect,
}: ThreadSidebarProps): ThreadSidebarControllerResult {
  const layout = useThreadSidebarLayout();
  const data = useThreadSidebarData({
    searchQuery: layout.searchQuery,
    filterOption: layout.filterOption,
  });
  const actions = useThreadSidebarActions({
    pathname: data.pathname,
    currentThreadId: data.currentThreadId,
    threads: data.threads,
    showTrash: data.showTrash,
    trashedThreads: data.trashedThreads,
    loadThreads: data.loadThreads,
    loadTrash: data.loadTrash,
    resetSearchAndFilter: layout.resetSearchAndFilter,
    onClose,
    onThreadSelect,
    getThreadState: data.getThreadState,
    scrollRegionRef: data.scrollRegionRef,
  });

  return {
    className,
    ...layout,
    ...data,
    ...actions,
  };
}
