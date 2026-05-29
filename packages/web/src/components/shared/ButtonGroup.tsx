/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'default' | 'danger' | 'danger-outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonGroupProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 子按钮 */
  children: ReactNode;
  /** 分组尺寸 */
  size?: ButtonSize;
  /** 分组变体 */
  variant?: ButtonVariant;
}

const sizeClassMap: Record<ButtonSize, string> = {
  sm: 'h-8 px-4 text-[12px]',
  md: 'h-[34px] px-6 text-[12px]',
  lg: 'h-[52px] px-8 text-[14px] font-medium',
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ children, size = 'md', variant = 'default', className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        role="group"
        className={joinClasses('inline-flex', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

ButtonGroup.displayName = 'ButtonGroup';