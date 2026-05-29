/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type RefObject, useCallback, useMemo } from 'react';
import { PreviewPanelShell } from '@/components/preview-panels/PreviewPanelShell';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import type { ActiveDocumentPreview } from '../document-preview-types';
import { useSendFilePreviewReloadRevision } from '../useSendFilePreviewReloadRevision';
import { useLocalXlsxPreviewSource } from './useLocalXlsxPreviewSource';
import { useXlsxSheetParse } from './useXlsxSheetParse';
import { XlsxDocumentPreview } from './XlsxDocumentPreview';

function resolveFolderForOpen(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx <= 0) return path;
  return path.slice(0, idx) || path;
}

export type XlsxPreviewPanelProps = {
  active: Extract<ActiveDocumentPreview, { kind: 'xlsx' }>;
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  frameless?: boolean;
};

export function XlsxPreviewPanel({ active, fullScreenContainerRef, frameless = false }: XlsxPreviewPanelProps) {
  const closeDocumentPreview = useChatStore((s) => s.closeDocumentPreview);
  const projectPath = active.projectPath && active.projectPath !== 'default' ? active.projectPath : undefined;
  const reloadRevision = useSendFilePreviewReloadRevision(active.threadId, active.path);
  const load = useLocalXlsxPreviewSource(active.path, projectPath, reloadRevision);
  const fetchBase64 = load.status === 'ok' ? load.contentBase64 : null;
  const parse = useXlsxSheetParse(fetchBase64);

  const handleOpenFolder = useCallback(async () => {
    const folder = resolveFolderForOpen(active.path);
    try {
      await apiFetch('/api/projects/open-local-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: folder,
          ...(projectPath ? { projectPath } : {}),
        }),
      });
    } catch {
      // best-effort
    }
  }, [active.path, projectPath]);

  const body = useMemo(() => {
    if (load.status === 'loading' || load.status === 'idle') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">加载中…</div>;
    }
    if (load.status === 'error') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{load.message}</div>;
    }
    if (parse.status === 'error') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{parse.message}</div>;
    }
    if (parse.status === 'parsing' || parse.status === 'idle') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-400">解析中…</div>;
    }
    return (
      <div className={frameless ? 'flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-1 flex-col px-4 py-3'}>
        <XlsxDocumentPreview key={fetchBase64} sheets={parse.sheets} title={active.displayName} />
      </div>
    );
  }, [active.displayName, fetchBase64, frameless, load, parse]);

  if (frameless) {
    return (
      <div
        data-testid="document-xlsx-preview-panel"
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      >
        {body}
      </div>
    );
  }

  return (
    <PreviewPanelShell
      panelTestId="document-xlsx-preview-panel"
      title={active.displayName}
      fullScreenContainerRef={fullScreenContainerRef}
      onRequestClose={closeDocumentPreview}
      onOpenFolder={handleOpenFolder}
      folderButtonTitle="打开文件所在文件夹"
    >
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </PreviewPanelShell>
  );
}
