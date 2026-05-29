/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ReactNode } from 'react';
import type { ActiveDocumentPreview } from '@/components/document-preview/document-preview-types';
import { DocxPreviewPanel } from '@/components/document-preview/docx/DocxPreviewPanel';
import { HtmlPreviewPanel } from '@/components/document-preview/HtmlPreviewPanel';
import { MarkdownPreviewPanel } from '@/components/document-preview/MarkdownPreviewPanel';
import { XlsxPreviewPanel } from '@/components/document-preview/xlsx/XlsxPreviewPanel';
import type { ProductRef } from '../types';

interface InspirationProductPreviewProps {
  product: ProductRef | null;
}

function toActiveDocumentPreview(product: ProductRef): ActiveDocumentPreview | null {
  const base = {
    path: product.path,
    displayName: product.name,
    threadId: 'inspiration-preview',
  };

  switch (product.type) {
    case 'html':
      return { ...base, kind: 'html' };
    case 'markdown':
      return { ...base, kind: 'markdown' };
    case 'word':
      return { ...base, kind: 'docx' };
    case 'excel':
      return { ...base, kind: 'xlsx' };
    case 'image':
      return null;
  }
}

export function InspirationProductPreview({ product }: InspirationProductPreviewProps) {
  if (!product) {
    return null;
  }

  const title = <div className="mb-3 shrink-0 text-sm font-medium text-[var(--text-primary)]">{product.name}</div>;

  if (product.type === 'image') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden">
        {title}
        {/* biome-ignore lint/performance/noImgElement: Vite app renders API-served dynamic product images. */}
        <img
          src={product.path}
          alt={product.name}
          className="max-h-full max-w-full object-contain"
          onError={(event) => {
            event.currentTarget.src = '/images/inspiration-products/default.svg';
          }}
        />
      </div>
    );
  }

  const active = toActiveDocumentPreview(product);
  if (!active) return null;

  let preview: ReactNode = null;
  switch (active.kind) {
    case 'html':
      preview = <HtmlPreviewPanel active={active} frameless />;
      break;
    case 'markdown':
      preview = <MarkdownPreviewPanel active={active} frameless />;
      break;
    case 'docx':
      preview = <DocxPreviewPanel active={active} frameless />;
      break;
    case 'xlsx':
      preview = <XlsxPreviewPanel active={active} frameless />;
      break;
    case 'pdf':
      preview = null;
  }

  if (!preview) return null;
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      {title}
      <div className="min-h-0 flex-1">{preview}</div>
    </div>
  );
}
