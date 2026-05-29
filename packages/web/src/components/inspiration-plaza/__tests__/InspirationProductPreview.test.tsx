/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspirationProductPreview } from '../components/InspirationProductPreview';
import type { ProductRef } from '../types';

const panelMocks = vi.hoisted(() => ({
  html: vi.fn(({ active }: { active: { displayName: string; kind: string } }) =>
    React.createElement('div', { 'data-testid': 'html-preview-panel' }, `${active.displayName}:${active.kind}`),
  ),
  markdown: vi.fn(({ active }: { active: { displayName: string; kind: string } }) =>
    React.createElement('div', { 'data-testid': 'markdown-preview-panel' }, `${active.displayName}:${active.kind}`),
  ),
  docx: vi.fn(({ active }: { active: { displayName: string; kind: string } }) =>
    React.createElement('div', { 'data-testid': 'docx-preview-panel' }, `${active.displayName}:${active.kind}`),
  ),
  xlsx: vi.fn(({ active }: { active: { displayName: string; kind: string } }) =>
    React.createElement('div', { 'data-testid': 'xlsx-preview-panel' }, `${active.displayName}:${active.kind}`),
  ),
}));

vi.mock('@/components/document-preview/HtmlPreviewPanel', () => ({
  HtmlPreviewPanel: panelMocks.html,
}));
vi.mock('@/components/document-preview/MarkdownPreviewPanel', () => ({
  MarkdownPreviewPanel: panelMocks.markdown,
}));
vi.mock('@/components/document-preview/docx/DocxPreviewPanel', () => ({
  DocxPreviewPanel: panelMocks.docx,
}));
vi.mock('@/components/document-preview/xlsx/XlsxPreviewPanel', () => ({
  XlsxPreviewPanel: panelMocks.xlsx,
}));

describe('InspirationProductPreview', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    for (const mock of Object.values(panelMocks)) mock.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders nothing when product is empty', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationProductPreview, { product: null }));
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders HTML product through the HTML preview panel', async () => {
    const htmlProduct: ProductRef = {
      id: 'prod-1',
      name: 'HTML产品',
      type: 'html',
      path: 'http://example.com/product.html',
      previewContent: '<html><body><h1>Test</h1></body></html>',
    };

    await act(async () => {
      root.render(React.createElement(InspirationProductPreview, { product: htmlProduct }));
    });

    expect(container.querySelector('[data-testid="html-preview-panel"]')?.textContent).toBe('HTML产品:html');
    expect(panelMocks.html.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        active: expect.objectContaining({
          displayName: 'HTML产品',
          path: 'http://example.com/product.html',
          kind: 'html',
          threadId: 'inspiration-preview',
        }),
        frameless: true,
      }),
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders markdown product through the Markdown preview panel', async () => {
    const mdProduct: ProductRef = {
      id: 'prod-2',
      name: 'Markdown文档',
      type: 'markdown',
      path: 'http://example.com/doc.md',
      previewContent: '# Markdown content here',
    };

    await act(async () => {
      root.render(React.createElement(InspirationProductPreview, { product: mdProduct }));
    });

    expect(container.querySelector('[data-testid="markdown-preview-panel"]')?.textContent).toBe(
      'Markdown文档:markdown',
    );
    expect(panelMocks.markdown.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        active: expect.objectContaining({
          displayName: 'Markdown文档',
          path: 'http://example.com/doc.md',
          kind: 'markdown',
          threadId: 'inspiration-preview',
        }),
        frameless: true,
      }),
    );
  });

  it('renders image products directly', async () => {
    const imageProduct: ProductRef = {
      id: 'prod-3',
      name: '图片产品',
      type: 'image',
      path: 'http://example.com/image.png',
    };

    await act(async () => {
      root.render(React.createElement(InspirationProductPreview, { product: imageProduct }));
    });

    expect(container.textContent).toContain('图片产品');
    const image = container.querySelector('img');
    expect(image?.getAttribute('src')).toBe(imageProduct.path);
    expect(image?.getAttribute('alt')).toBe(imageProduct.name);
    expect(panelMocks.html).not.toHaveBeenCalled();
    expect(panelMocks.markdown).not.toHaveBeenCalled();
    expect(panelMocks.docx).not.toHaveBeenCalled();
    expect(panelMocks.xlsx).not.toHaveBeenCalled();
  });

  it('maps word products into docx document preview', async () => {
    const wordProduct: ProductRef = {
      id: 'prod-4',
      name: 'Word文档',
      type: 'word',
      path: 'http://example.com/doc.docx',
    };

    await act(async () => {
      root.render(React.createElement(InspirationProductPreview, { product: wordProduct }));
    });

    expect(container.querySelector('[data-testid="docx-preview-panel"]')?.textContent).toBe('Word文档:docx');
    expect(panelMocks.docx.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        active: expect.objectContaining({
          displayName: 'Word文档',
          path: 'http://example.com/doc.docx',
          kind: 'docx',
          threadId: 'inspiration-preview',
        }),
        frameless: true,
      }),
    );
  });

  it('maps excel products into xlsx document preview', async () => {
    const excelProduct: ProductRef = {
      id: 'prod-5',
      name: 'Excel表格',
      type: 'excel',
      path: 'http://example.com/data.xlsx',
    };

    await act(async () => {
      root.render(React.createElement(InspirationProductPreview, { product: excelProduct }));
    });

    expect(container.querySelector('[data-testid="xlsx-preview-panel"]')?.textContent).toBe('Excel表格:xlsx');
    expect(panelMocks.xlsx.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        active: expect.objectContaining({
          displayName: 'Excel表格',
          path: 'http://example.com/data.xlsx',
          kind: 'xlsx',
          threadId: 'inspiration-preview',
        }),
        frameless: true,
      }),
    );
  });

  it('renders the provided product from detail product path data', async () => {
    const product: ProductRef = {
      id: 'prod-1',
      name: '产品一',
      type: 'html',
      path: 'http://example.com/1.html',
      previewContent: '<p>First</p>',
    };

    await act(async () => {
      root.render(React.createElement(InspirationProductPreview, { product }));
    });

    expect(container.textContent).toContain('产品一');
  });
});
