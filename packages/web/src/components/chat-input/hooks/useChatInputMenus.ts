/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback, useState } from 'react';

export function useChatInputMenus() {
  const [showMentions, setShowMentions] = useState(false);
  const [showSkillMenu, setShowSkillMenu] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showStyleTemplatePopover, setShowStyleTemplatePopover] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const closeMenus = useCallback(() => {
    setShowMentions(false);
    setShowSkillMenu(false);
    setShowWorkspaceMenu(false);
    setShowStyleTemplatePopover(false);
  }, []);

  const toggleSkillMenu = useCallback((onOpen?: () => void) => {
    setShowMentions(false);
    setShowSkillMenu((prev) => {
      const next = !prev;
      if (next) onOpen?.();
      return next;
    });
    setShowWorkspaceMenu(false);
    setShowStyleTemplatePopover(false);
    setSelectedIdx(0);
  }, []);

  const toggleWorkspaceMenu = useCallback(() => {
    setShowMentions(false);
    setShowSkillMenu(false);
    setShowStyleTemplatePopover(false);
    setShowWorkspaceMenu((prev) => !prev);
    setSelectedIdx(0);
  }, []);

  const toggleStyleTemplatePopover = useCallback(() => {
    setShowMentions(false);
    setShowSkillMenu(false);
    setShowWorkspaceMenu(false);
    setShowStyleTemplatePopover((prev) => !prev);
  }, []);

  return {
    showMentions,
    setShowMentions,
    showSkillMenu,
    setShowSkillMenu,
    showWorkspaceMenu,
    setShowWorkspaceMenu,
    showStyleTemplatePopover,
    setShowStyleTemplatePopover,
    selectedIdx,
    setSelectedIdx,
    closeMenus,
    toggleSkillMenu,
    toggleWorkspaceMenu,
    toggleStyleTemplatePopover,
  };
}
