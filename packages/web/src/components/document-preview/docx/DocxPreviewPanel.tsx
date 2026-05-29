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
import { DocxDocumentPreview } from './DocxDocumentPreview';
import { useLocalDocxPreviewSource } from './useLocalDocxPreviewSource';

function resolveFolderForOpen(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx <= 0) return path;
  return path.slice(0, idx) || path;
}

export type DocxPreviewPanelProps = {
  active: Extract<ActiveDocumentPreview, { kind: 'docx' }>;
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  frameless?: boolean;
};

export function DocxPreviewPanel({ active, fullScreenContainerRef, frameless = false }: DocxPreviewPanelProps) {
  const closeDocumentPreview = useChatStore((s) => s.closeDocumentPreview);
  const projectPath = active.projectPath && active.projectPath !== 'default' ? active.projectPath : undefined;
  const reloadRevision = useSendFilePreviewReloadRevision(active.threadId, active.path);
  const load = useLocalDocxPreviewSource(active.path, projectPath, reloadRevision);

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
    return (
      <div className={frameless ? 'flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-1 flex-col px-4 py-3'}>
        <DocxDocumentPreview contentBase64={load.contentBase64} title={active.displayName} />
      </div>
    );
  }, [active.displayName, frameless, load]);

  if (frameless) {
    return (
      <div
        data-testid="document-docx-preview-panel"
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      >
        {body}
      </div>
    );
  }

  return (
    <PreviewPanelShell
      panelTestId="document-docx-preview-panel"
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
