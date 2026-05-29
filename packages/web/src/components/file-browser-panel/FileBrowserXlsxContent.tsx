/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import { useSendFilePreviewReloadRevision } from '@/components/document-preview/useSendFilePreviewReloadRevision';
import { useLocalXlsxPreviewSource } from '@/components/document-preview/xlsx/useLocalXlsxPreviewSource';
import { useXlsxSheetParse } from '@/components/document-preview/xlsx/useXlsxSheetParse';
import { XlsxDocumentPreview } from '@/components/document-preview/xlsx/XlsxDocumentPreview';

interface FileBrowserXlsxContentProps {
  path: string;
  displayName: string;
  threadId: string;
  projectPath?: string;
}

/**
 * Renders .xlsx/.xls file content without a PreviewPanelShell wrapper.
 * Intended to be used inside FileBrowserPreviewPane's shared shell.
 */
export function FileBrowserXlsxContent({ path, displayName, threadId, projectPath }: FileBrowserXlsxContentProps) {
  const reloadRevision = useSendFilePreviewReloadRevision(threadId, path);
  const load = useLocalXlsxPreviewSource(path, projectPath, reloadRevision);
  const fetchBase64 = load.status === 'ok' ? load.contentBase64 : null;
  const parse = useXlsxSheetParse(fetchBase64);

  return useMemo(() => {
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
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <XlsxDocumentPreview key={fetchBase64} sheets={parse.sheets} title={displayName} />
      </div>
    );
  }, [displayName, fetchBase64, load, parse]);
}
