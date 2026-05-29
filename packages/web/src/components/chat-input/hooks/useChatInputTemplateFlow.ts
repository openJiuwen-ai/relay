/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback, useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { SelectedTemplateSummary } from '../types';

interface PickerTemplate {
  id: string;
  name: string;
}

interface UseChatInputTemplateFlowParams {
  showStyleTemplatePopover: boolean;
  styleTemplatePopoverRef: RefObject<HTMLDivElement>;
  styleTemplateBtnRef: RefObject<HTMLButtonElement>;
  setShowStyleTemplatePopover: Dispatch<SetStateAction<boolean>>;
  selectedQuickActionLabel?: string;
  setSelectedTemplate: Dispatch<SetStateAction<SelectedTemplateSummary | null>>;
}

export function useChatInputTemplateFlow({
  showStyleTemplatePopover,
  styleTemplatePopoverRef,
  styleTemplateBtnRef,
  setShowStyleTemplatePopover,
  selectedQuickActionLabel,
  setSelectedTemplate,
}: UseChatInputTemplateFlowParams) {
  useEffect(() => {
    if (!showStyleTemplatePopover) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!target.isConnected) return;
      if (
        styleTemplatePopoverRef.current &&
        !styleTemplatePopoverRef.current.contains(target) &&
        !styleTemplateBtnRef.current?.contains(target)
      ) {
        setShowStyleTemplatePopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setShowStyleTemplatePopover, showStyleTemplatePopover, styleTemplateBtnRef, styleTemplatePopoverRef]);

  useEffect(() => {
    if (selectedQuickActionLabel === '幻灯片') return;
    setShowStyleTemplatePopover(false);
    setSelectedTemplate(null);
  }, [selectedQuickActionLabel, setSelectedTemplate, setShowStyleTemplatePopover]);

  const onTemplateSelectChange = useCallback(
    (template: PickerTemplate | null) => {
      setSelectedTemplate(template ? { id: template.id, name: template.name } : null);
      if (template) setShowStyleTemplatePopover(false);
    },
    [setSelectedTemplate, setShowStyleTemplatePopover],
  );

  const onTemplatePopoverClose = useCallback(() => {
    setShowStyleTemplatePopover(false);
  }, [setShowStyleTemplatePopover]);

  return {
    onTemplateSelectChange,
    onTemplatePopoverClose,
  };
}

