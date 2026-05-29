/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type ReactNode } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { DirectoryBrowser } from './thread-sidebar/DirectoryBrowser';

interface DirectoryBrowserModalProps {
  open: boolean;
  title?: ReactNode;
  initialPath?: string;
  activeProjectPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function DirectoryBrowserModal({
  open,
  title = '选择文件夹',
  initialPath,
  activeProjectPath,
  onSelect,
  onClose,
}: DirectoryBrowserModalProps) {
  useEscapeKey({
    enabled: open,
    onEscape: onClose,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)] p-4"
      data-testid="directory-browser-modal"
    >
      <div
        className="flex h-[620px] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-6 shadow-[var(--modal-shadow)]"
        data-testid="directory-browser-modal-panel"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-[var(--modal-title-text)]" data-testid="directory-browser-modal-title">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="close-directory-browser"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-label-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 pt-5" data-testid="directory-browser-modal-body">
          <DirectoryBrowser
            initialPath={initialPath}
            activeProjectPath={activeProjectPath}
            onSelect={onSelect}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
