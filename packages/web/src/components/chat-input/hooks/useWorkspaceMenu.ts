/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback, useMemo, useState } from 'react';
import type { WorkspaceMenuItem, WorkspaceOptionItem } from '../types';

interface UseWorkspaceMenuParams {
  workspaceOptions: WorkspaceOptionItem[];
  onSelectEmptyWorkspace?: () => void;
  onSelectExistingWorkspace?: (path: string) => void;
  onOpenFolderPicker?: () => void;
}

export function useWorkspaceMenu({
  workspaceOptions,
  onSelectEmptyWorkspace,
  onSelectExistingWorkspace,
  onOpenFolderPicker,
}: UseWorkspaceMenuParams) {
  const [workspaceFilter, setWorkspaceFilter] = useState('');

  const filteredWorkspaceOptions = useMemo(() => {
    const lower = workspaceFilter.trim().toLowerCase();
    if (!lower) return workspaceOptions;
    return workspaceOptions.filter((item) => {
      const title = item.title?.trim() ?? '';
      return (
        item.name.toLowerCase().includes(lower) ||
        item.path.toLowerCase().includes(lower) ||
        title.toLowerCase().includes(lower)
      );
    });
  }, [workspaceFilter, workspaceOptions]);

  const workspaceMenuItems = useMemo<WorkspaceMenuItem[]>(
    () => [
      { kind: 'empty' },
      { kind: 'open' },
      ...filteredWorkspaceOptions.map((option): WorkspaceMenuItem => ({ kind: 'workspace', option })),
    ],
    [filteredWorkspaceOptions],
  );

  const selectWorkspaceMenuItem = useCallback(
    (item: WorkspaceMenuItem) => {
      if (item.kind === 'empty') {
        onSelectEmptyWorkspace?.();
      } else if (item.kind === 'open') {
        onOpenFolderPicker?.();
      } else {
        onSelectExistingWorkspace?.(item.option.path);
      }
    },
    [onOpenFolderPicker, onSelectEmptyWorkspace, onSelectExistingWorkspace],
  );

  return {
    workspaceFilter,
    setWorkspaceFilter,
    workspaceMenuItems,
    selectWorkspaceMenuItem,
  };
}

