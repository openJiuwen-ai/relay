/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export function ThemeRootSync() {
  const theme = useThemeStore((state) => state.theme);
  const isLoaded = useThemeStore((state) => state.isLoaded);
  const initializeTheme = useThemeStore((state) => state.initializeTheme);

  useEffect(() => {
    if (!isLoaded) {
      initializeTheme();
    }
  }, [initializeTheme, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    document.documentElement.dataset.uiTheme = theme;
  }, [isLoaded, theme]);

  return null;
}
