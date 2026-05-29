/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect } from 'react';
import { Button } from './Button';

interface ActionConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  modalTestId?: string;
  confirmTestId?: string;
  cancelTestId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ActionConfirmModal({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmDisabled = false,
  modalTestId,
  confirmTestId,
  cancelTestId,
  onConfirm,
  onCancel,
}: ActionConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-medium)]">
      <div
        className="w-[400px] rounded-[8px] border border-[var(--modal-border)] bg-[var(--modal-surface)] p-6 shadow-[var(--modal-shadow)]"
        data-testid={modalTestId}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[16px] font-bold text-[var(--modal-title-text)]">{title}</h3>
            <button
              type="button"
              onClick={onCancel}
              aria-label="close"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-label-secondary)] transition-colors hover:text-[var(--text-primary)]"
              style={{ transform: 'translate(4px, -4px)' }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-[var(--modal-text-muted)]">{message}</p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="default"
              onClick={onCancel}
              data-testid={cancelTestId}
            >
              {cancelLabel}
            </Button>
            <Button variant="major"
              onClick={onConfirm}
              disabled={confirmDisabled}
              data-testid={confirmTestId}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
