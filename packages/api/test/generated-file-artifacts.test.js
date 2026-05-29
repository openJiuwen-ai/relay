/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('generated-file-artifacts', () => {
  test('appends path disclosure for generated legacy workspace files', async () => {
    const { appendGeneratedFileLocationDisclosure } = await import(
      '../dist/domains/agents/services/agents/routing/generated-file-artifacts.js'
    );

    const content = appendGeneratedFileLocationDisclosure('文档已生成。', [
      {
        id: 'f1',
        kind: 'file',
        v: 1,
        url: '/api/workspace/download?worktreeId=wt-1&path=output%2Freport.docx',
        fileName: 'report.docx',
        workspacePath: 'output/report.docx',
      },
    ]);

    assert.match(content, /文件位置：/);
  assert.match(content, /report\.docx: output\/report\.docx/);
  assert.doesNotMatch(content, /\/api\/workspace\/download\?/);
});

test('does not duplicate disclosure when content already contains canonical location', async () => {
    const { appendGeneratedFileLocationDisclosure } = await import(
      '../dist/domains/agents/services/agents/routing/generated-file-artifacts.js'
    );

    const content = appendGeneratedFileLocationDisclosure('已保存 report.docx，位置: output/report.docx', [
      {
        id: 'f1',
        kind: 'file',
        v: 1,
        url: '/api/workspace/download?worktreeId=wt-1&path=output%2Freport.docx',
        fileName: 'report.docx',
        workspacePath: 'output/report.docx',
      },
    ]);

  assert.match(content, /已保存 report\.docx，位置: output\/report\.docx/);
  assert.doesNotMatch(content, /文件位置：/);
});

  test('dedupes duplicate file artifacts before appending disclosure', async () => {
    const { appendGeneratedFileLocationDisclosure } = await import(
      '../dist/domains/agents/services/agents/routing/generated-file-artifacts.js'
    );

    const content = appendGeneratedFileLocationDisclosure('', [
      {
        id: 'f1',
        kind: 'file',
        v: 1,
        url: '/uploads/report.pdf',
        fileName: 'report.pdf',
      },
      {
        id: 'f2',
        kind: 'file',
        v: 1,
        url: '/uploads/report.pdf',
        fileName: 'report.pdf',
      },
    ]);

    assert.equal(content, '文件位置：\n- report.pdf: /uploads/report.pdf');
  });
});
