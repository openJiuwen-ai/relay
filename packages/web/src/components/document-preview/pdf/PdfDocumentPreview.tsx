/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';

export function PdfDocumentPreview({ contentBase64, title }: { contentBase64: string; title: string }) {
  const blobUrl = useMemo(() => {
    if (!contentBase64) return null;
    try {
      const binaryString = atob(contentBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error('Failed to create PDF blob URL', e);
      return null;
    }
  }, [contentBase64]);

  if (!blobUrl) {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600">无法预览 PDF 内容</div>;
  }

  return (
    <iframe
      src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
      title={title}
      className="box-border h-full min-h-[20rem] w-full flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-neutral-white,#fff)]"
    />
  );
}
