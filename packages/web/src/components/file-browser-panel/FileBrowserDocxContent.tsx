/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import { DocxDocumentPreview } from '@/components/document-preview/docx/DocxDocumentPreview';
import { useLocalDocxPreviewSource } from '@/components/document-preview/docx/useLocalDocxPreviewSource';
import { useSendFilePreviewReloadRevision } from '@/components/document-preview/useSendFilePreviewReloadRevision';

interface FileBrowserDocxContentProps {
  path: string;
  displayName: string;
  threadId: string;
  projectPath?: string;
}

/**
 * Renders .docx file content without a PreviewPanelShell wrapper.
 * Intended to be used inside FileBrowserPreviewPane's shared shell.
 */
export function FileBrowserDocxContent({ path, displayName, threadId, projectPath }: FileBrowserDocxContentProps) {
  const reloadRevision = useSendFilePreviewReloadRevision(threadId, path);
  const load = useLocalDocxPreviewSource(path, projectPath, reloadRevision);

  return useMemo(() => {
    if (load.status === 'loading' || load.status === 'idle') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">加载中…</div>;
    }
    if (load.status === 'error') {
      return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">{load.message}</div>;
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <DocxDocumentPreview contentBase64={load.contentBase64} title={displayName} />
      </div>
    );
  }, [displayName, load]);
}
