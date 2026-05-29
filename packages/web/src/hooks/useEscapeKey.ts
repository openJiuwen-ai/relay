/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect } from 'react';

export interface UseEscapeKeyOptions {
  enabled?: boolean;
  onEscape?: () => void;
}

export function useEscapeKey({ enabled = true, onEscape }: UseEscapeKeyOptions): void {
  const handleEscape = useCallback(
    (event: KeyboardEvent) => {
      if (enabled && event.key === 'Escape') {
        onEscape?.();
      }
    },
    [enabled, onEscape],
  );

  useEffect(() => {
    if (!enabled || !onEscape) return;

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [enabled, onEscape, handleEscape]);
}
