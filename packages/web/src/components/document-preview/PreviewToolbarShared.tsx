/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ReactNode } from 'react';
import { useCallback } from 'react';
import { useToastStore } from '@/stores/toastStore';

/** 嵌入预览顶部工具条（与 Html 三按钮同行视觉一致） */
export const PREVIEW_TOOLBAR_ROW_CLASS =
  'flex shrink-0 items-center justify-end gap-0.5 border-b border-[#F0F0F0] bg-white px-1 pb-2 pt-0';

export function PreviewToolbarIconButton({
  title,
  'aria-label': ariaLabel,
  onClick,
  children,
}: {
  title: string;
  'aria-label'?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#434343] transition-colors hover:bg-[#F5F5F7]"
      title={title}
      aria-label={ariaLabel ?? title}
    >
      {children}
    </button>
  );
}

export function CopyDocumentIcon({ className = 'size-[18px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <title>复制</title>
      <path
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

export interface PreviewCopyButtonProps {
  text: string;
  /** toast 明细前缀，例如「HTML」「Markdown」「代码」 */
  copyKindLabel?: string;
  /** 覆盖默认矢量复制图标 */
  icon?: ReactNode;
}

/**
 * 纯文本类预览共用的复制按钮（样式与 Html 预览条中的复制一致）
 */
export function PreviewCopyButton({ text, copyKindLabel = '源代码', icon }: PreviewCopyButtonProps) {
  const addToast = useToastStore((s) => s.addToast);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({
        type: 'success',
        title: '已复制',
        message: `${copyKindLabel}已复制到剪贴板`,
        duration: 2200,
      });
    } catch {
      addToast({ type: 'error', title: '复制失败', message: '无法访问剪贴板', duration: 3500 });
    }
  }, [addToast, copyKindLabel, text]);

  return (
    <PreviewToolbarIconButton title={`复制${copyKindLabel}`} onClick={handleCopy}>
      {icon ?? <CopyDocumentIcon />}
    </PreviewToolbarIconButton>
  );
}
