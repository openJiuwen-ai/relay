/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { MODEL_MENU_MAX_HEIGHT, MODEL_MENU_OFFSET } from '../constants';

interface UseModelMenuParams {
  modelGroupCount: number;
  modelItemCount: number;
  modelMenuOpen: boolean;
  modelMenuRef: RefObject<HTMLDivElement>;
  modelTriggerRef: RefObject<HTMLButtonElement>;
  onClose: () => void;
}

export function useModelMenu({
  modelGroupCount,
  modelItemCount,
  modelMenuOpen,
  modelMenuRef,
  modelTriggerRef,
  onClose,
}: UseModelMenuParams) {
  const [openAbove, setOpenAbove] = useState(false);
  const [modelMenuPosition, setModelMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateModelMenuPosition = useCallback(() => {
    if (!modelMenuOpen || !modelTriggerRef.current) return;
    const rect = modelTriggerRef.current.getBoundingClientRect();
    const estimatedMenuHeight =
      modelMenuRef.current?.offsetHeight ??
      Math.min(Math.max(modelItemCount, 1) * 36 + modelGroupCount * 22 + 54, MODEL_MENU_MAX_HEIGHT);
    const spaceBelow = window.innerHeight - rect.bottom;
    const nextOpenAbove = spaceBelow < estimatedMenuHeight + MODEL_MENU_OFFSET;
    setOpenAbove(nextOpenAbove);
    setModelMenuPosition({
      top: nextOpenAbove ? rect.top - MODEL_MENU_OFFSET : rect.bottom + MODEL_MENU_OFFSET,
      left: rect.left,
      width: rect.width,
    });
  }, [modelGroupCount, modelItemCount, modelMenuOpen, modelMenuRef, modelTriggerRef]);

  useEffect(() => {
    if (!modelMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modelMenuRef.current?.contains(target) || modelTriggerRef.current?.contains(target)) return;
      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
      modelTriggerRef.current?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [modelMenuOpen, modelMenuRef, modelTriggerRef, onClose]);

  useLayoutEffect(() => {
    if (!modelMenuOpen) {
      setModelMenuPosition(null);
      setOpenAbove(false);
      return;
    }
    updateModelMenuPosition();
  }, [modelMenuOpen, updateModelMenuPosition]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const handleViewportChange = () => updateModelMenuPosition();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [modelMenuOpen, updateModelMenuPosition]);

  return {
    modelMenuPosition,
    openAbove,
  };
}
