/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';

interface RefreshButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> {
  bordered?: boolean;
  children?: ReactNode;
}

export function RefreshButton({
  bordered = true,
  children,
  className = '',
  'aria-label': ariaLabel = '刷新',
  title = '刷新',
  ...props
}: RefreshButtonProps) {
  const classes = [
    bordered
      ? 'inline-flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] border border-[var(--border-secondary)] bg-[var(--surface-panel)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:border-[var(--refresh-button-border-hover)] disabled:cursor-not-allowed disabled:opacity-50'
      : 'inline-flex items-center justify-center text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" aria-label={ariaLabel} title={title} className={classes} {...props}>
      {children ?? <MaskIcon name="refresh" className="h-4 w-4" />}
    </button>
  );
}
