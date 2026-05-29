/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import './helpers/setup-agent-registry.js';

import { parseMultipart } from '../dist/routes/parse-multipart.js';

test('parseMultipart drains file stream before waiting for remaining parts and rejects image uploads', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'office-claw-parse-multipart-'));
  let fileConsumed = false;
  let releaseIterator = false;

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello with image' };

      yield {
        type: 'file',
        fieldname: 'images',
        filename: 'cat.png',
        mimetype: 'image/png',
        toBuffer: async () => {
          fileConsumed = true;
          return Buffer.from('fake-png');
        },
      };

      while (!fileConsumed && !releaseIterator) {
        await delay(5);
      }

      yield { type: 'field', fieldname: 'threadId', value: 'thread-test' };
    },
  };

  try {
    const parsed = await Promise.race([
      parseMultipart(request, uploadDir),
      (async () => {
        await delay(300);
        throw new Error('parseMultipart timed out waiting for file stream drain');
      })(),
    ]);

    assert.ok('error' in parsed, 'expected image upload rejection');
    assert.equal(parsed.error, '该附件类型暂不支持');
  } finally {
    releaseIterator = true;
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('parseMultipart accepts mentionRefs as JSON form field', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'cat-cafe-parse-multipart-mention-'));

    const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: '@office 帮我写诗' };
      yield {
        type: 'field',
        fieldname: 'mentionRefs',
        value: JSON.stringify([{ catId: 'office', mention: '@office' }]),
      };
    },
  };

  try {
    const parsed = await parseMultipart(request, uploadDir);
    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.deepEqual(parsed.mentionRefs, [{ catId: 'office', mention: '@office' }]);
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('parseMultipart returns file contentBlocks for attachments', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'office-claw-parse-multipart-files-'));

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello with file' };
      yield {
        type: 'file',
        fieldname: 'attachments',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        toBuffer: async () => Buffer.from('fake-pdf'),
      };
    },
  };

  try {
    const parsed = await parseMultipart(request, uploadDir);
    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.equal(parsed.contentBlocks.length, 2);
    assert.equal(parsed.contentBlocks[0].type, 'text');
    assert.equal(parsed.contentBlocks[1].type, 'file');
    assert.equal(parsed.contentBlocks[1].url, '/uploads/report.pdf');
    assert.equal(parsed.contentBlocks[1].fileName, 'report.pdf');
    assert.equal(parsed.contentBlocks[1].mimeType, 'application/pdf');
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('parseMultipart accepts macro-enabled Excel attachments', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'cat-cafe-parse-multipart-xlsm-'));

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello with xlsm' };
      yield {
        type: 'file',
        fieldname: 'attachments',
        filename: 'model.xlsm',
        mimetype: 'application/vnd.ms-excel.sheet.macroEnabled.12',
        toBuffer: async () => Buffer.from('fake-xlsm'),
      };
    },
  };

  try {
    const parsed = await parseMultipart(request, uploadDir);
    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.equal(parsed.contentBlocks.length, 2);
    assert.equal(parsed.contentBlocks[1].type, 'file');
    assert.equal(parsed.contentBlocks[1].url, '/uploads/model.xlsm');
    assert.equal(parsed.contentBlocks[1].fileName, 'model.xlsm');
    assert.equal(parsed.contentBlocks[1].mimeType, 'application/vnd.ms-excel.sheet.macroenabled.12');
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('parseMultipart accepts Markdown attachments when the browser sends text/plain', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'cat-cafe-parse-multipart-md-'));

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello with markdown' };
      yield {
        type: 'file',
        fieldname: 'attachments',
        filename: 'notes.md',
        mimetype: 'text/plain',
        toBuffer: async () => Buffer.from('# Notes'),
      };
    },
  };

  try {
    const parsed = await parseMultipart(request, uploadDir);
    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.equal(parsed.contentBlocks.length, 2);
    assert.equal(parsed.contentBlocks[1].type, 'file');
    assert.equal(parsed.contentBlocks[1].url, '/uploads/notes.md');
    assert.equal(parsed.contentBlocks[1].fileName, 'notes.md');
    assert.equal(parsed.contentBlocks[1].mimeType, 'text/markdown');
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('parseMultipart stores attachments in the resolved workspace target when available', async () => {
  const uploadDir = await mkdtemp(join(tmpdir(), 'office-claw-parse-multipart-workspace-'));
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'office-claw-parse-workspace-root-'));

  const request = {
    parts: async function* () {
      yield { type: 'field', fieldname: 'content', value: 'hello workspace file' };
      yield { type: 'field', fieldname: 'threadId', value: 'thread-workspace' };
      yield {
        type: 'file',
        fieldname: 'attachments',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        toBuffer: async () => Buffer.from('fake-pdf'),
      };
    },
  };

  try {
    const parsed = await parseMultipart(request, uploadDir, async (threadId) => ({
      kind: 'workspace',
      worktreeId: 'workspace_test_123',
      workspaceRoot,
      directoryPath: '',
    }));

    assert.ok(!('error' in parsed), 'expected multipart parse success');
    assert.equal(parsed.threadId, 'thread-workspace');
    assert.equal(parsed.contentBlocks.length, 2);

    const fileBlock = parsed.contentBlocks.find((block) => block.type === 'file');
    assert.ok(fileBlock, 'expected file block');
    assert.match(fileBlock.url, /^\/api\/workspace\/download\?/);
    const params = new URLSearchParams(fileBlock.url.split('?')[1]);
    assert.equal(params.get('path'), 'report.pdf');
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
