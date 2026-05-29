/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

interface PromptDialogProps {
  open: boolean;
  title: string;
  message?: string;
  inputValue: string;
  inputPlaceholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  modalTestId?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  onInputChange?: (value: string) => void;
}

export function PromptDialog({
  open,
  title,
  message,
  inputValue,
  inputPlaceholder,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmDisabled = false,
  modalTestId,
  onConfirm,
  onCancel,
  onInputChange,
}: PromptDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(inputValue);

  useEffect(() => {
    if (open) {
      setLocalValue(inputValue);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(localValue);
  };

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

          {message && (
            <p className="text-sm text-[var(--modal-text-muted)]">{message}</p>
          )}

          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onInputChange?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !confirmDisabled) {
                handleConfirm();
              }
            }}
            placeholder={inputPlaceholder}
            className="ui-input w-full rounded-lg px-3 py-2 text-sm"
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={onCancel}
              color="default"
            >
              {cancelLabel}
            </Button>
            <Button
              onClick={handleConfirm}
              color="major"
              disabled={confirmDisabled}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
