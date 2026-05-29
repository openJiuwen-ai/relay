/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ThemeType } from '@/utils/theme-persistence';
import { USER_THEME_OPTIONS } from '@/constants/userThemeOptions';

export interface UserThemePickerProps {
  theme: ThemeType;
  onSelectTheme: (theme: ThemeType) => void;
  optionsTestId?: string;
}

export function UserThemePicker({
  theme,
  onSelectTheme,
  optionsTestId = 'user-theme-options',
}: UserThemePickerProps) {
  return (
    <div className='flex items-start gap-4' data-testid={optionsTestId}>
      {USER_THEME_OPTIONS.map((option) => {
        const isActive = theme === option.id;
        return (
          <button
            key={option.id}
            type='button'
            onClick={() => onSelectTheme(option.id)}
            className={`ui-overlay-item flex flex-col items-center gap-2 text-center text-[var(--overlay-text)] hover:border-transparent hover:bg-transparent hover:text-[var(--overlay-text)] focus-visible:border-transparent focus-visible:bg-transparent focus-visible:text-[var(--overlay-text)]`}
            data-testid={`user-theme-option-${option.id}`}
          >
            <div className='relative'>
              <div
                className='h-9 w-9 rounded-full'
                data-testid={`user-theme-swatch-${option.id}`}
                style={{ background: option.swatchBackground }}
              />
              {isActive ? (
                <div
                  className='absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full'
                  data-testid={`user-theme-selected-badge-${option.id}`}
                  style={{
                    backgroundColor: option.selectedBadgeBackground,
                    color: option.selectedBadgeColor,
                  }}
                >
                  <svg className='h-[12px] w-[12px]' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
                    <path
                      d='M4 8.25 6.5 10.75 12 5.25'
                      stroke='currentColor'
                      strokeWidth='2'
                      strokeLinecap='round'
                      strokeLinejoin='round'
                    />
                  </svg>
                </div>
              ) : null}
            </div>
            <span className='whitespace-nowrap text-[12px] font-medium leading-[18px] text-[var(--overlay-text)]'>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
