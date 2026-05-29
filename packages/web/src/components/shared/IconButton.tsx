/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 图标 */
  icon: ReactNode;
  /** 尺寸，默认 md */
  size?: IconButtonSize;
  /** tooltip 文案 */
  label?: string;
}

const sizeDimensionMap: Record<IconButtonSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function IconButton({
  icon,
  size = 'md',
  label,
  disabled = false,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={joinClasses(
        'inline-flex items-center justify-center rounded-md bg-transparent text-[var(--text-muted)] transition-[background-color,color] duration-200',
        sizeDimensionMap[size],
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
}