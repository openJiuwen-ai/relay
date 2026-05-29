/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback } from 'react';
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react';
import type { WorkspaceMenuItem } from '../types';

interface UseBottomRightActionsParams {
  fileInputRef: RefObject<HTMLInputElement>;
  workspaceMenuItems: WorkspaceMenuItem[];
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  setWorkspaceFilter: Dispatch<SetStateAction<string>>;
  closeMenus: () => void;
  selectWorkspaceMenuItem: (item: WorkspaceMenuItem) => void;
}

export function useBottomRightActions({
  fileInputRef,
  workspaceMenuItems,
  selectedIdx,
  setSelectedIdx,
  setWorkspaceFilter,
  closeMenus,
  selectWorkspaceMenuItem,
}: UseBottomRightActionsParams) {
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleWorkspaceFilterChange = useCallback(
    (value: string) => {
      setWorkspaceFilter(value);
      setSelectedIdx(0);
    },
    [setWorkspaceFilter, setSelectedIdx],
  );

  const handleWorkspaceSearchKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (workspaceMenuItems.length === 0) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMenus();
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((idx) => (idx + 1) % workspaceMenuItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((idx) => (idx - 1 + workspaceMenuItems.length) % workspaceMenuItems.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = workspaceMenuItems[selectedIdx];
        if (item) selectWorkspaceMenuItem(item);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenus();
      }
    },
    [closeMenus, selectWorkspaceMenuItem, selectedIdx, setSelectedIdx, workspaceMenuItems],
  );

  return {
    handleAttachClick,
    handleWorkspaceFilterChange,
    handleWorkspaceSearchKeyDown,
  };
}

