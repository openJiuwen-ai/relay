/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useLayoutEffect, useState } from 'react';
import { HtmlDocumentPreview } from '@/components/document-preview/HtmlDocumentPreview';
import { HtmlPreviewToolbarActions } from '@/components/document-preview/HtmlPreviewToolbar';
import { MarkdownDocumentPreview } from '@/components/document-preview/MarkdownDocumentPreview';
import { PreviewCopyButton } from '@/components/document-preview/PreviewToolbarShared';
import { useEmbeddedTextPreviewSource } from '@/components/document-preview/useEmbeddedTextPreviewSource';
import { useSendFilePreviewReloadRevision } from '@/components/document-preview/useSendFilePreviewReloadRevision';
import { usePreviewShellExtraHeaderSetter } from './FileBrowserPreviewShellHeaderActionsContext';

interface FileBrowserTextContentProps {
  path: string;
  kind: 'markdown' | 'html';
  displayName: string;
  threadId: string;
  projectPath?: string;
}

/**
 * Renders markdown or html file content without a PreviewPanelShell wrapper.
 * Intended to be used inside FileBrowserPreviewPane's shared shell.
 */
export function FileBrowserTextContent({
  path,
  kind,
  displayName,
  threadId,
  projectPath,
}: FileBrowserTextContentProps) {
  const setShellHeaderActions = usePreviewShellExtraHeaderSetter();
  const reloadRevision = useSendFilePreviewReloadRevision(threadId, path);
  const [htmlRefreshNonce, setHtmlRefreshNonce] = useState(0);
  const load = useEmbeddedTextPreviewSource(path, projectPath, reloadRevision, kind === 'html' ? htmlRefreshNonce : 0);

  const bumpHtmlRefresh = useCallback(() => setHtmlRefreshNonce((n) => n + 1), []);
  const contentSig = load.status === 'ok' ? load.content : '';

  useLayoutEffect(() => {
    if (!setShellHeaderActions) return;
    if (load.status !== 'ok') {
      setShellHeaderActions(null);
      return;
    }
    if (kind === 'markdown') {
      setShellHeaderActions(<PreviewCopyButton text={contentSig} copyKindLabel="Markdown" />);
    } else {
      setShellHeaderActions(
        <HtmlPreviewToolbarActions
          html={contentSig}
          filePath={path}
          projectPath={projectPath}
          onRefresh={bumpHtmlRefresh}
        />,
      );
    }
    return () => setShellHeaderActions(null);
  }, [setShellHeaderActions, load.status, kind, contentSig, path, projectPath, bumpHtmlRefresh]);

  if (load.status === 'loading' || load.status === 'idle') {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">加载中…</div>;
  }
  if (load.status === 'error') {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{load.message}</div>;
  }
  if (kind === 'markdown') {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          <MarkdownDocumentPreview source={load.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <div className="min-h-0 flex flex-1 flex-col">
        <HtmlDocumentPreview html={load.content} title={displayName} />
      </div>
    </div>
  );
}
