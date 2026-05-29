/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { Button } from './shared/Button';
import { IconButton } from './shared/IconButton';
import { useEffect, useRef, useState } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** If set, shows a text input that must match this value to confirm */
  requireInput?: string;
  inputPlaceholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  color?: 'danger' | 'major';
  onConfirm: () => void;
  onCancel: () => void;
}

function CloseIcon() {
  return <MaskIcon name="close" className="h-4 w-4" />;
}

export function ConfirmDialog({
  open,
  title,
  message,
  requireInput,
  inputPlaceholder,
  confirmLabel = '确认',
  cancelLabel = '取消',
  color = 'major',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
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

  const canConfirm = requireInput ? inputValue === requireInput : true;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="relative bg-[var(--modal-surface)] rounded-[8px] shadow-xl p-6 max-w-[400px] w-full mx-4">
        <IconButton
          label="close"
          size="sm"
          onClick={onCancel}
          className="absolute right-5 top-5 text-[var(--text-label-secondary)] transition-colors hover:text-[var(--text-primary)]"
          icon={<CloseIcon />}
        />
        <div className="mb-2 pr-10">
          <h3 className="text-base font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-[var(--modal-text-muted)] mb-4 whitespace-pre-wrap break-all">{message}</p>
        {requireInput && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={inputPlaceholder}
            className="ui-input w-full rounded-lg px-3 py-2 text-sm mb-4"
          />
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} variant="default">
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm} variant={color}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
