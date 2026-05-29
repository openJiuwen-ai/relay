/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { type ThemeType } from '@/utils/theme-persistence';

export interface UserThemeOption {
  id: ThemeType;
  label: string;
  swatchBackground: string;
  selectedBadgeBackground: string;
  selectedBadgeColor: string;
}

/** Theme choices shown in the profile theme popover and settings modal (subset of ThemeType). */
export const USER_THEME_OPTIONS: UserThemeOption[] = [
  {
    id: 'business',
    label: '灰白',
    swatchBackground: 'var(--theme-preview-business-bg)',
    selectedBadgeBackground: 'var(--theme-preview-business-badge)',
    selectedBadgeColor: 'var(--theme-preview-business-check)',
  },
  {
    id: 'warm',
    label: '橙白',
    swatchBackground: 'var(--theme-preview-warm-bg)',
    selectedBadgeBackground: 'var(--theme-preview-warm-badge)',
    selectedBadgeColor: 'var(--theme-preview-warm-check)',
  },
  // {
  //   id: 'dark',
  //   label: '暗黑',
  //   swatchBackground: 'var(--theme-preview-dark-bg)',
  //   selectedBadgeBackground: 'var(--theme-preview-dark-badge)',
  //   selectedBadgeColor: 'var(--theme-preview-dark-check)',
  // },
];
