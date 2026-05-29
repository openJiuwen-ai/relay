/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocxPreviewPanel } from '../docx/DocxPreviewPanel';
import { HtmlPreviewPanel } from '../HtmlPreviewPanel';
import { MarkdownPreviewPanel } from '../MarkdownPreviewPanel';
import { XlsxPreviewPanel } from '../xlsx/XlsxPreviewPanel';

const mockState = vi.hoisted(() => ({
  closeDocumentPreview: vi.fn(),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: { closeDocumentPreview: () => void }) => unknown) =>
    selector({ closeDocumentPreview: mockState.closeDocumentPreview }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/components/document-preview/useSendFilePreviewReloadRevision', () => ({
  useSendFilePreviewReloadRevision: () => 0,
}));

vi.mock('@/components/document-preview/useEmbeddedTextPreviewSource', () => ({
  useEmbeddedTextPreviewSource: () => ({ status: 'ok', content: '# Preview' }),
}));

vi.mock('@/components/document-preview/docx/useLocalDocxPreviewSource', () => ({
  useLocalDocxPreviewSource: () => ({ status: 'ok', contentBase64: 'ZG9jeA==' }),
}));

vi.mock('@/components/document-preview/xlsx/useLocalXlsxPreviewSource', () => ({
  useLocalXlsxPreviewSource: () => ({ status: 'ok', contentBase64: 'eGxzeA==' }),
}));

vi.mock('@/components/document-preview/xlsx/useXlsxSheetParse', () => ({
  useXlsxSheetParse: () => ({ status: 'ok', sheets: [{ name: 'Sheet1', headers: ['A'], rows: [] }] }),
}));

vi.mock('@/components/document-preview/HtmlDocumentPreview', () => ({
  HtmlDocumentPreview: () => <div data-testid="mock-html-document" />,
}));

vi.mock('@/components/document-preview/MarkdownDocumentPreview', () => ({
  MarkdownDocumentPreview: () => <div data-testid="mock-markdown-document" />,
}));

vi.mock('@/components/document-preview/docx/DocxDocumentPreview', () => ({
  DocxDocumentPreview: () => <div data-testid="mock-docx-document" />,
}));

vi.mock('@/components/document-preview/xlsx/XlsxDocumentPreview', () => ({
  XlsxDocumentPreview: () => <div data-testid="mock-xlsx-document" />,
}));

describe('document preview panels frameless mode', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders frameless previews without shell chrome or content padding', async () => {
    const previews = [
      {
        panelTestId: 'document-html-preview-panel',
        contentTestId: 'mock-html-document',
        element: (
          <HtmlPreviewPanel
            active={{ kind: 'html', path: '/tmp/demo.html', displayName: 'HTML', threadId: 'thread-1' }}
            frameless
          />
        ),
      },
      {
        panelTestId: 'document-markdown-preview-panel',
        contentTestId: 'mock-markdown-document',
        element: (
          <MarkdownPreviewPanel
            active={{ kind: 'markdown', path: '/tmp/demo.md', displayName: 'Markdown', threadId: 'thread-1' }}
            frameless
          />
        ),
      },
      {
        panelTestId: 'document-docx-preview-panel',
        contentTestId: 'mock-docx-document',
        element: (
          <DocxPreviewPanel
            active={{ kind: 'docx', path: '/tmp/demo.docx', displayName: 'Word', threadId: 'thread-1' }}
            frameless
          />
        ),
      },
      {
        panelTestId: 'document-xlsx-preview-panel',
        contentTestId: 'mock-xlsx-document',
        element: (
          <XlsxPreviewPanel
            active={{ kind: 'xlsx', path: '/tmp/demo.xlsx', displayName: 'Excel', threadId: 'thread-1' }}
            frameless
          />
        ),
      },
    ];

    for (const preview of previews) {
      await act(async () => {
        root.render(preview.element);
      });

      const panel = container.querySelector(`[data-testid="${preview.panelTestId}"]`) as HTMLElement | null;
      expect(panel).not.toBeNull();
      expect(panel?.querySelector('header')).toBeNull();
      expect(panel?.querySelector(`[data-testid="${preview.contentTestId}"]`)).not.toBeNull();
      expect(panel?.className).not.toContain('shadow');
      expect(panel?.className).not.toContain('border-l');

      const descendantClassNames = Array.from(panel?.querySelectorAll('[class]') ?? [])
        .map((node) => (node as HTMLElement).className)
        .join(' ');
      expect(descendantClassNames).not.toMatch(/\bp[xy]-[346]\b/);
    }
  });
});
