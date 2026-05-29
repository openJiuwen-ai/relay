/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { OverflowTooltip } from './OverflowTooltip';

type MessageCopyButtonProps = {
  text: string;
  alwaysVisible: boolean;
  className?: string;
};

const COPIED_TEXT_RESET_MS = 1500;

export function MessageCopyButton({ text, alwaysVisible, className }: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = useCallback(() => {
    if (!resetTimerRef.current) return;
    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  }, []);

  useEffect(() => clearResetTimer, [clearResetTimer]);

  const handleCopy = useCallback(async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearResetTimer();
      resetTimerRef.current = setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, COPIED_TEXT_RESET_MS);
    } catch {
      // ignore clipboard failures silently
    }
  }, [clearResetTimer, text]);

  const visibilityClass = alwaysVisible
    ? 'opacity-100 pointer-events-auto'
    : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto';

  return (
    <div
      data-testid="message-copy-button-wrapper"
      className={`mt-[8px] mb-[8px] ${visibilityClass} transition-opacity ${className ?? ''}`.trim()}
    >
      <OverflowTooltip content={copied ? '已复制' : '复制'} forceShow className="relative inline-flex" gap={2}>
        <button
          type="button"
          aria-label={copied ? '已复制' : '复制'}
          onClick={() => void handleCopy()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-[8px] transition-colors hover:bg-[rgba(0,0,0,0.04)] focus-visible:bg-[rgba(0,0,0,0.04)]"
          data-testid="message-copy-button"
        >
          <img src="/icons/copy.svg" alt="" aria-hidden="true" className="h-4 w-4" />
        </button>
      </OverflowTooltip>
    </div>
  );
}
