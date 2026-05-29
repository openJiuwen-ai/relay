/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type RefObject, useCallback, useMemo, useState } from 'react';
import { PreviewPanelShell } from '@/components/preview-panels/PreviewPanelShell';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import type { ActiveDocumentPreview } from './document-preview-types';
import { HtmlDocumentPreview } from './HtmlDocumentPreview';
import { HtmlPreviewToolbarActions } from './HtmlPreviewToolbar';
import { useEmbeddedTextPreviewSource } from './useEmbeddedTextPreviewSource';
import { useSendFilePreviewReloadRevision } from './useSendFilePreviewReloadRevision';

function resolveFolderForOpen(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx <= 0) return path;
  return path.slice(0, idx) || path;
}

export type HtmlPreviewPanelProps = {
  active: Extract<ActiveDocumentPreview, { kind: 'html' }>;
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  frameless?: boolean;
};

export function HtmlPreviewPanel({ active, fullScreenContainerRef, frameless = false }: HtmlPreviewPanelProps) {
  const closeDocumentPreview = useChatStore((s) => s.closeDocumentPreview);
  const projectPath = active.projectPath && active.projectPath !== 'default' ? active.projectPath : undefined;
  const reloadRevision = useSendFilePreviewReloadRevision(active.threadId, active.path);
  const [htmlRefreshNonce, bumpHtmlRefresh] = useState(0);
  const onRefreshHtmlPreview = useCallback(() => bumpHtmlRefresh((n) => n + 1), []);
  const load = useEmbeddedTextPreviewSource(active.path, projectPath, reloadRevision, htmlRefreshNonce);

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

  const okHtmlSig = load.status === 'ok' ? load.content : '';
  const extraHeaderContent = useMemo(() => {
    if (load.status !== 'ok') return null;
    return (
      <HtmlPreviewToolbarActions
        html={okHtmlSig}
        filePath={active.path}
        projectPath={projectPath}
        onRefresh={onRefreshHtmlPreview}
      />
    );
  }, [load.status, okHtmlSig, active.path, projectPath, onRefreshHtmlPreview]);

  const body = useMemo(() => {
    if (load.status === 'loading' || load.status === 'idle') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">加载中…</div>;
    }
    if (load.status === 'error') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{load.message}</div>;
    }
    return (
      <div className={frameless ? 'flex min-h-0 flex-1 flex-col' : 'flex min-h-0 flex-1 flex-col px-4 py-3'}>
        <div className="min-h-0 flex flex-1 flex-col">
          <HtmlDocumentPreview html={load.content} title={active.displayName} />
        </div>
      </div>
    );
  }, [active.displayName, frameless, load]);

  if (frameless) {
    return (
      <div
        data-testid="document-html-preview-panel"
        className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      >
        {body}
      </div>
    );
  }

  return (
    <PreviewPanelShell
      panelTestId="document-html-preview-panel"
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
