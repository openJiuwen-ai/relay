/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import React, { type ReactNode } from 'react';

export type AlertMode = 'error' | 'prompt' | 'warn';

export interface AlertProps {
  /** Alert mode determines background color and icon */
  mode: AlertMode;
  /** Content text or React nodes */
  children: ReactNode;
  /** Show/hide the close button on the right */
  closable?: boolean;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Additional CSS classes */
  className?: string;
}

const ALERT_VARIANTS = {
  error: {
    bg: 'var(--alert-error-bg)',
    icon: <img src="/icons/message-error.svg" alt="" aria-hidden="true" className="h-4 w-4" />,
  },
  prompt: {
    bg: 'var(--alert-prompt-bg)',
    icon: <img src="/icons/message-prompt.svg" alt="" aria-hidden="true" className="h-4 w-4" />,
  },
  warn: {
    bg: 'var(--alert-warn-bg)',
    icon: <img src="/icons/message-warn.svg" alt="" aria-hidden="true" className="h-4 w-4" />,
  },
} as const;

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export function Alert({ mode, children, closable = true, onClose, className = '' }: AlertProps) {
  const variant = ALERT_VARIANTS[mode];

  return (
    <div
      className={`flex w-full gap-2 rounded-[8px] px-4 py-2 ${className}`}
      style={{ backgroundColor: variant.bg }}
      role="alert"
    >
      {/* Left icon */}
      <span
        data-testid="alert-status-icon"
        className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-[var(--text-primary)] mt-[2px]"
      >
        {variant.icon}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
        {children}
      </div>

      {/* Right close button */}
      {closable && onClose && (
        <button
          onClick={onClose}
          className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-[4px] text-[var(--text-label-secondary)] transition-colors hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
