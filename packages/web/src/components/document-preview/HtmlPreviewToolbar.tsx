/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback } from 'react';
import {
  PREVIEW_TOOLBAR_ROW_CLASS,
  PreviewCopyButton,
  PreviewToolbarIconButton,
} from '@/components/document-preview/PreviewToolbarShared';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';

export interface HtmlPreviewToolbarProps {
  html: string;
  filePath: string;
  projectPath?: string;
  onRefresh: () => void;
}

/** 与用户提供的预览条图标一致（.svg，内嵌位图） */
const HTML_PREVIEW_TOOLBAR_ICONS = {
  copy: '/images/html-preview-toolbar/copy.svg',
  refresh: '/images/html-preview-toolbar/refresh.svg',
  openExternal: '/images/html-preview-toolbar/open-external.svg',
} as const;

function HtmlPreviewToolbarRasterIcon({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      width={18}
      height={18}
      className="size-[18px] shrink-0 object-contain select-none"
      draggable={false}
    />
  );
}

/** 用于 PreviewPanelShell.extraHeaderContent：与标题同行，无单独底边 */
export function HtmlPreviewToolbarActions({ html, filePath, projectPath, onRefresh }: HtmlPreviewToolbarProps) {
  const addToast = useToastStore((s) => s.addToast);

  const handleOpenExternal = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects/open-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: filePath,
          ...(projectPath && projectPath !== 'default' ? { projectPath } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        addToast({ type: 'error', title: '打开失败', message: body?.error ?? `HTTP ${res.status}`, duration: 3500 });
        return;
      }
      addToast({ type: 'success', title: '已打开', message: '已在默认程序中打开', duration: 2200 });
    } catch (e) {
      addToast({
        type: 'error',
        title: '打开失败',
        message: e instanceof Error ? e.message : '请求失败',
        duration: 3500,
      });
    }
  }, [addToast, filePath, projectPath]);

  return (
    <>
      <PreviewCopyButton
        text={html}
        copyKindLabel="HTML"
        icon={<HtmlPreviewToolbarRasterIcon src={HTML_PREVIEW_TOOLBAR_ICONS.copy} />}
      />
      <PreviewToolbarIconButton title="刷新" onClick={onRefresh}>
        <HtmlPreviewToolbarRasterIcon src={HTML_PREVIEW_TOOLBAR_ICONS.refresh} />
      </PreviewToolbarIconButton>
      <PreviewToolbarIconButton title="在默认程序中打开" onClick={handleOpenExternal}>
        <HtmlPreviewToolbarRasterIcon src={HTML_PREVIEW_TOOLBAR_ICONS.openExternal} />
      </PreviewToolbarIconButton>
    </>
  );
}

/** 内容区内独立一行工具条（含底部分割线） */
export function HtmlPreviewToolbar(props: HtmlPreviewToolbarProps) {
  return (
    <div className={PREVIEW_TOOLBAR_ROW_CLASS}>
      <HtmlPreviewToolbarActions {...props} />
    </div>
  );
}
