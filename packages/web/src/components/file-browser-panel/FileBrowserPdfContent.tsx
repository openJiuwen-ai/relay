/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { PreviewToolbarIconButton } from '@/components/document-preview/PreviewToolbarShared';
import { PdfDocumentPreview } from '@/components/document-preview/pdf/PdfDocumentPreview';
import { useLocalPdfPreviewSource } from '@/components/document-preview/pdf/useLocalPdfPreviewSource';
import { useSendFilePreviewReloadRevision } from '@/components/document-preview/useSendFilePreviewReloadRevision';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { usePreviewShellExtraHeaderSetter } from './FileBrowserPreviewShellHeaderActionsContext';

interface FileBrowserPdfContentProps {
  path: string;
  displayName: string;
  threadId: string;
  projectPath?: string;
}

/**
 * Renders .pdf file content without a PreviewPanelShell wrapper.
 * Intended to be used inside FileBrowserPreviewPane's shared shell.
 */
export function FileBrowserPdfContent({ path, displayName, threadId, projectPath }: FileBrowserPdfContentProps) {
  const setShellHeaderActions = usePreviewShellExtraHeaderSetter();
  const reloadRevision = useSendFilePreviewReloadRevision(threadId, path);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const load = useLocalPdfPreviewSource(path, projectPath, reloadRevision, refreshNonce);
  const addToast = useToastStore((s) => s.addToast);

  const handleRefresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  const handleOpenExternal = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects/open-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
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
  }, [addToast, path, projectPath]);

  useLayoutEffect(() => {
    if (!setShellHeaderActions) return;
    if (load.status !== 'ok') {
      setShellHeaderActions(null);
      return;
    }

    setShellHeaderActions(
      <>
        <PreviewToolbarIconButton title="刷新" onClick={handleRefresh}>
          <img
            src="/images/html-preview-toolbar/refresh.svg"
            alt=""
            width={18}
            height={18}
            className="size-[18px] shrink-0 object-contain select-none"
            draggable={false}
          />
        </PreviewToolbarIconButton>
        <PreviewToolbarIconButton title="在默认程序中打开" onClick={handleOpenExternal}>
          <img
            src="/images/html-preview-toolbar/open-external.svg"
            alt=""
            width={18}
            height={18}
            className="size-[18px] shrink-0 object-contain select-none"
            draggable={false}
          />
        </PreviewToolbarIconButton>
      </>,
    );
    return () => setShellHeaderActions(null);
  }, [setShellHeaderActions, load.status, handleRefresh, handleOpenExternal]);

  return useMemo(() => {
    if (load.status === 'loading' || load.status === 'idle') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">加载中…</div>;
    }
    if (load.status === 'error') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{load.message}</div>;
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <PdfDocumentPreview contentBase64={load.contentBase64} title={displayName} />
      </div>
    );
  }, [displayName, load]);
}
