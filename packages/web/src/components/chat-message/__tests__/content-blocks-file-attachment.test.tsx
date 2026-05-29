/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContentBlocks } from '../components/ContentBlocks';

describe('ContentBlocks file attachment', () => {
  it('does not render link action when file action is disabled', () => {
    const html = renderToStaticMarkup(
      <ContentBlocks
        showFileAction={false}
        blocks={[
          {
            type: 'file',
            url: '/uploads/demo.docx',
            fileName: 'demo.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        ]}
      />,
    );

    expect(html).toContain('demo.docx');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('<button');
  });

  it('does not render legacy workspace action when file action is disabled', () => {
    const html = renderToStaticMarkup(
      <ContentBlocks
        showFileAction={false}
        blocks={[
          {
            type: 'file',
            url: '/api/workspace/download?worktreeId=wt-1&path=output%2Fdemo.xlsx',
            fileName: 'demo.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ]}
      />,
    );

    expect(html).toContain('demo.xlsx');
    expect(html).not.toContain('<button');
  });

  it('renders download control for uploaded attachments by default', () => {
    const html = renderToStaticMarkup(
      <ContentBlocks
        blocks={[
          {
            type: 'file',
            url: '/uploads/demo.xlsx',
            fileName: 'demo.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ]}
      />,
    );

    expect(html).toContain('demo.xlsx');
    expect(html).toContain('<button');
  });

  it('downgrades legacy workspace files to a non-interactive sunset state', () => {
    const html = renderToStaticMarkup(
      <ContentBlocks
        blocks={[
          {
            type: 'file',
            url: '/api/workspace/download?worktreeId=wt-1&path=output%2Fdemo.xlsx',
            fileName: 'demo.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ]}
      />,
    );

    expect(html).toContain('demo.xlsx');
    expect(html).toContain('历史 workspace 文件，能力已下线');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a');
  });
});
