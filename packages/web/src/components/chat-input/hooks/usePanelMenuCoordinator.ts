/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useEffect, useMemo } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { WorkspaceMenuItem } from '../types';

type ActiveMenuKind = 'mention' | 'skill' | 'workspace' | null;

interface UsePanelMenuCoordinatorParams {
  showMentions: boolean;
  showSkillMenu: boolean;
  showWorkspaceMenu: boolean;
  filteredAgentOptionsLength: number;
  filteredSkillOptionsLength: number;
  workspaceMenuItems: WorkspaceMenuItem[];
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  skillOptionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  workspaceOptionRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
  folderSelectionEnabled: boolean;
  setShowWorkspaceMenu: Dispatch<SetStateAction<boolean>>;
}

export function usePanelMenuCoordinator({
  showMentions,
  showSkillMenu,
  showWorkspaceMenu,
  filteredAgentOptionsLength,
  filteredSkillOptionsLength,
  workspaceMenuItems,
  selectedIdx,
  setSelectedIdx,
  skillOptionRefs,
  workspaceOptionRefs,
  folderSelectionEnabled,
  setShowWorkspaceMenu,
}: UsePanelMenuCoordinatorParams) {
  const activeMenu = useMemo<ActiveMenuKind>(
    () => (showMentions ? 'mention' : showSkillMenu ? 'skill' : showWorkspaceMenu ? 'workspace' : null),
    [showMentions, showSkillMenu, showWorkspaceMenu],
  );

  const activeOptionsCount = useMemo(() => {
    if (activeMenu === 'mention') return filteredAgentOptionsLength;
    if (activeMenu === 'skill') return filteredSkillOptionsLength;
    return workspaceMenuItems.length;
  }, [activeMenu, filteredAgentOptionsLength, filteredSkillOptionsLength, workspaceMenuItems.length]);

  useEffect(() => {
    if (!showMentions) return;
    setSelectedIdx((i) => Math.min(i, Math.max(0, filteredAgentOptionsLength - 1)));
  }, [filteredAgentOptionsLength, setSelectedIdx, showMentions]);

  useEffect(() => {
    if (!showSkillMenu) return;
    setSelectedIdx((i) => Math.min(i, Math.max(0, filteredSkillOptionsLength - 1)));
  }, [filteredSkillOptionsLength, setSelectedIdx, showSkillMenu]);

  useEffect(() => {
    if (!folderSelectionEnabled && showWorkspaceMenu) setShowWorkspaceMenu(false);
  }, [folderSelectionEnabled, setShowWorkspaceMenu, showWorkspaceMenu]);

  useEffect(() => {
    if (!showWorkspaceMenu) return;
    setSelectedIdx((i) => Math.min(i, Math.max(0, workspaceMenuItems.length - 1)));
  }, [setSelectedIdx, showWorkspaceMenu, workspaceMenuItems.length]);

  useEffect(() => {
    if (!showSkillMenu) return;
    const el = skillOptionRefs.current[selectedIdx];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, showSkillMenu, skillOptionRefs]);

  useEffect(() => {
    if (!showWorkspaceMenu) return;
    const el = workspaceOptionRefs.current[selectedIdx];
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx, showWorkspaceMenu, workspaceOptionRefs]);

  return {
    activeMenu,
    activeOptionsCount,
  };
}

