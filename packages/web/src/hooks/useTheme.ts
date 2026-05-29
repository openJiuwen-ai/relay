/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useEffect } from 'react';
import { useThemeStore, type ThemeType } from '@/stores/themeStore';

export type { ThemeType };

export function useTheme() {
  const { theme, setTheme, toggleTheme, isLoaded, initializeTheme } = useThemeStore();

  useEffect(() => {
    if (!isLoaded) {
      initializeTheme();
    }
  }, [isLoaded, initializeTheme]);

  return {
    theme,
    setTheme,
    toggleTheme,
    isLoaded,
  };
}
