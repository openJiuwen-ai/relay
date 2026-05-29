/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const DOC_COMPONENTS = {
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
} satisfies Components;

export function MarkdownDocumentPreview({ source, className }: { source: string; className?: string }) {
  const remarkPlugins = useMemo(() => [remarkGfm, remarkBreaks], []);
  return (
    <div
      className={`markdown-content prose prose-base max-w-none font-sans break-words leading-relaxed ${className ?? ''}`}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={DOC_COMPONENTS}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
