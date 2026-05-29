/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useRef, useState } from 'react';

function base64ToDocxBlob(b64: string): Blob {
  const bin = atob(b64);
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** Renders .docx via [docx-preview](https://github.com/VolodymyrBaydalka/docxjs); general preview, not PPT Studio. */
export function DocxDocumentPreview({ contentBase64, title }: { contentBase64: string; title: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleHostRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const body = bodyRef.current;
    const styleHost = styleHostRef.current;
    if (!body || !styleHost || !contentBase64) return undefined;

    let cancelled = false;
    setRenderError(null);
    body.replaceChildren();
    styleHost.replaceChildren();

    void (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        const blob = base64ToDocxBlob(contentBase64);
        await renderAsync(blob, body, styleHost, {
          className: 'docx-oc-preview',
          inWrapper: true,
          breakPages: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderHeaders: true,
          renderFooters: true,
        });
      } catch (e) {
        if (!cancelled) setRenderError(e instanceof Error ? e.message : 'Word 预览失败');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contentBase64]);

  if (renderError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-red-600" role="alert">
        {renderError}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" aria-label={title}>
      <div ref={styleHostRef} className="docx-oc-styles flex-shrink-0" />
      <div ref={bodyRef} className="docx-oc-body min-h-0 flex-1 overflow-auto" />
    </div>
  );
}
