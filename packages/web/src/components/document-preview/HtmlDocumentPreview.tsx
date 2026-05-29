/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

/**
 * Renders a **single** HTML file from disk in an isolated frame (general preview, not PPT Studio).
 * `sandbox=""` disables scripts/navigation to the parent app; inline CSS still applies.
 */
export function HtmlDocumentPreview({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      className="box-border h-full min-h-[20rem] w-full flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-neutral-white,#fff)]"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts"
      srcDoc={html}
    />
  );
}
