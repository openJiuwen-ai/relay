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
import type { ActiveDocumentPreview } from './document-preview-types';
import { MarkdownDocumentPreview } from './MarkdownDocumentPreview';
import { PreviewCopyButton } from './PreviewToolbarShared';
import { useEmbeddedTextPreviewSource } from './useEmbeddedTextPreviewSource';
import { useSendFilePreviewReloadRevision } from './useSendFilePreviewReloadRevision';

function resolveFolderForOpen(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx <= 0) return path;
  return path.slice(0, idx) || path;
}

export interface MarkdownPreviewPanelProps {
  active: Extract<ActiveDocumentPreview, { kind: 'markdown' }>;
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  frameless?: boolean;
}

export function MarkdownPreviewPanel({ active, fullScreenContainerRef, frameless = false }: MarkdownPreviewPanelProps) {
  const closeDocumentPreview = useChatStore((s) => s.closeDocumentPreview);
  const projectPath = active.projectPath && active.projectPath !== 'default' ? active.projectPath : undefined;
  const reloadRevision = useSendFilePreviewReloadRevision(active.threadId, active.path);
  const load = useEmbeddedTextPreviewSource(active.path, projectPath, reloadRevision);

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

  const markdownCopySig = load.status === 'ok' ? load.content : '';
  const extraHeaderContent = useMemo(() => {
    if (load.status !== 'ok') return null;
    return <PreviewCopyButton text={markdownCopySig} copyKindLabel="Markdown" />;
  }, [load.status, markdownCopySig]);

  const body = useMemo(() => {
    if (load.status === 'loading' || load.status === 'idle') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">加载中…</div>;
    }
    if (load.status === 'error') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{load.message}</div>;
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={frameless ? 'min-h-0 flex-1 overflow-auto' : 'min-h-0 flex-1 overflow-auto px-6 py-4'}>
          <MarkdownDocumentPreview source={load.content} />
        </div>
      </div>
    );
  }, [frameless, load]);

  if (frameless) {
    return (
      <div
        data-testid="document-markdown-preview-panel"
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      >
        {body}
      </div>
    );
  }

  return (
    <PreviewPanelShell
      panelTestId="document-markdown-preview-panel"
      title={active.displayName}
      fullScreenContainerRef={fullScreenContainerRef}
      onRequestClose={closeDocumentPreview}
      onOpenFolder={handleOpenFolder}
      folderButtonTitle="打开文件所在文件夹"
      extraHeaderContent={extraHeaderContent}
    >
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
    </PreviewPanelShell>
  );
}
