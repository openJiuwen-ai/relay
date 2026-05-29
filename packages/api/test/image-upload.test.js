/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Image upload pipeline tests
 * - saveUploadedImages: file saving + validation
 * - extractImagePaths: URL → absolute path conversion
 * - CLI flag construction for each agent
 * - Multipart POST + contentBlocks in GET response
 */

import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { ensureFakeCliOnPath } from './helpers/fake-cli-path.js';

ensureFakeCliOnPath('claude');
ensureFakeCliOnPath('codex');
ensureFakeCliOnPath('gemini');

describe('saveUploadedImages', () => {
  let uploadDir;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'office-claw-upload-'));
  });

  afterEach(async () => {
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it('saves a valid PNG file and returns metadata', async () => {
    const { saveUploadedImages } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('test.png', 'image/png', Buffer.from('fake-png'));
    const saved = await saveUploadedImages([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.startsWith(resolve(uploadDir)));
    assert.ok(saved[0].urlPath.startsWith('/uploads/'));
    assert.equal(saved[0].content.type, 'image');
    assert.ok(saved[0].content.url.startsWith('/uploads/'));

    // Verify file was written
    const files = await readdir(uploadDir);
    assert.equal(files.length, 1);
    const content = await readFile(join(uploadDir, files[0]));
    assert.equal(content.toString(), 'fake-png');
  });

  it('rejects unsupported MIME types', async () => {
    const { saveUploadedImages, ImageUploadError } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('evil.exe', 'application/octet-stream', Buffer.from('bad'));
    await assert.rejects(
      () => saveUploadedImages([fakeFile], uploadDir),
      (err) => err instanceof ImageUploadError && err.message.includes('Unsupported'),
    );
  });

  it('rejects files exceeding 100MB', async () => {
    const { saveUploadedImages, ImageUploadError } = await import('../dist/routes/image-upload.js');

    const bigBuffer = Buffer.alloc(101 * 1024 * 1024, 0x42); // 101MB
    const fakeFile = createMockFile('huge.png', 'image/png', bigBuffer);
    await assert.rejects(
      () => saveUploadedImages([fakeFile], uploadDir),
      (err) => err instanceof ImageUploadError && err.message.includes('too large'),
    );
  });

  it('rejects more than 5 files', async () => {
    const { saveUploadedImages, ImageUploadError } = await import('../dist/routes/image-upload.js');

    const files = Array.from({ length: 6 }, (_, i) =>
      createMockFile(`img${i}.png`, 'image/png', Buffer.from(`img${i}`)),
    );
    await assert.rejects(
      () => saveUploadedImages(files, uploadDir),
      (err) => err instanceof ImageUploadError && err.message.includes('Too many'),
    );
  });

  it('saves multiple files with unique names', async () => {
    const { saveUploadedImages } = await import('../dist/routes/image-upload.js');

    const files = [
      createMockFile('a.png', 'image/png', Buffer.from('aaa')),
      createMockFile('b.jpg', 'image/jpeg', Buffer.from('bbb')),
    ];
    const saved = await saveUploadedImages(files, uploadDir);

    assert.equal(saved.length, 2);
    assert.notEqual(saved[0].absPath, saved[1].absPath);

    const diskFiles = await readdir(uploadDir);
    assert.equal(diskFiles.length, 2);
  });

  it('uses MIME extension, ignores malicious filename (regression: XSS via .html)', async () => {
    const { saveUploadedImages } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('evil.html', 'image/png', Buffer.from('fake-png'));
    const saved = await saveUploadedImages([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.png'), `expected .png, got ${saved[0].absPath}`);
    assert.ok(saved[0].urlPath.endsWith('.png'), `expected .png URL, got ${saved[0].urlPath}`);
  });

  it('saves a valid image data URL via the shared uploads helper', async () => {
    const { saveDataUrlImage } = await import('../dist/routes/image-upload.js');

    const saved = await saveDataUrlImage(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      uploadDir,
    );

    assert.ok(saved.absPath.startsWith(resolve(uploadDir)));
    assert.ok(saved.urlPath.startsWith('/uploads/'));
    assert.ok(saved.urlPath.endsWith('.png'));
  });

  it('rejects invalid image data URLs', async () => {
    const { ImageUploadError, saveDataUrlImage } = await import('../dist/routes/image-upload.js');

    await assert.rejects(
      () => saveDataUrlImage('not-a-data-url', uploadDir),
      (err) => err instanceof ImageUploadError && err.message.includes('Invalid image data URL'),
    );
  });

  it('rejects GIF image data URLs to preserve the preview screenshot contract', async () => {
    const { ImageUploadError, saveDataUrlImage } = await import('../dist/routes/image-upload.js');

    await assert.rejects(
      () => saveDataUrlImage('data:image/gif;base64,R0lGODlhAQABAAAAACw=', uploadDir),
      (err) => err instanceof ImageUploadError && err.message.includes('Unsupported file type'),
    );
  });

});

describe('saveUploadedAttachments', () => {
  let uploadDir;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'office-claw-attachment-upload-'));
  });

  afterEach(async () => {
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it('saves a valid PDF file and returns metadata', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('report.pdf', 'application/pdf', Buffer.from('fake-pdf'));
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.startsWith(resolve(uploadDir)));
    assert.equal(saved[0].urlPath, '/uploads/report.pdf');
    assert.equal(saved[0].content.type, 'file');
    assert.equal(saved[0].content.fileName, 'report.pdf');
    assert.equal(saved[0].content.mimeType, 'application/pdf');
    assert.equal(saved[0].content.fileSize, 8);

    const files = await readdir(uploadDir);
    assert.equal(files.length, 1);
    assert.deepEqual(files, ['report.pdf']);
    const content = await readFile(join(uploadDir, files[0]));
    assert.equal(content.toString(), 'fake-pdf');
  });

  it('uses MIME extension instead of trusting uploaded filename', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('report.exe', 'application/pdf', Buffer.from('fake-pdf'));
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.pdf'), `expected .pdf, got ${saved[0].absPath}`);
    assert.ok(saved[0].urlPath.endsWith('.pdf'), `expected .pdf URL, got ${saved[0].urlPath}`);
    assert.equal(saved[0].content.fileName, 'report.pdf');
  });

  it('preserves .xlsm for macro-enabled Excel attachments', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile(
      'financial-model.xlsm',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      Buffer.from('fake-xlsm'),
    );
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.xlsm'), `expected .xlsm, got ${saved[0].absPath}`);
    assert.ok(saved[0].urlPath.endsWith('.xlsm'), `expected .xlsm URL, got ${saved[0].urlPath}`);
    assert.equal(saved[0].content.fileName, 'financial-model.xlsm');
    assert.equal(saved[0].content.mimeType, 'application/vnd.ms-excel.sheet.macroenabled.12');
    const files = await readdir(uploadDir);
    assert.deepEqual(files, ['financial-model.xlsm']);
  });

  it('accepts legacy .xls Excel format', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('legacy-data.xls', 'application/vnd.ms-excel', Buffer.from('fake-xls'));
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.xls'), `expected .xls, got ${saved[0].absPath}`);
    assert.ok(saved[0].urlPath.endsWith('.xls'), `expected .xls URL, got ${saved[0].urlPath}`);
    assert.equal(saved[0].content.fileName, 'legacy-data.xls');
    assert.equal(saved[0].content.mimeType, 'application/vnd.ms-excel');
    const files = await readdir(uploadDir);
    assert.deepEqual(files, ['legacy-data.xls']);
  });

  it('accepts .xlsb binary Excel format', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile(
      'binary-data.xlsb',
      'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
      Buffer.from('fake-xlsb'),
    );
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.xlsb'), `expected .xlsb, got ${saved[0].absPath}`);
    assert.ok(saved[0].urlPath.endsWith('.xlsb'), `expected .xlsb URL, got ${saved[0].urlPath}`);
    assert.equal(saved[0].content.fileName, 'binary-data.xlsb');
    assert.equal(saved[0].content.mimeType, 'application/vnd.ms-excel.sheet.binary.macroenabled.12');
    const files = await readdir(uploadDir);
    assert.deepEqual(files, ['binary-data.xlsb']);
  });

  it('accepts legacy .doc Word format', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('legacy-doc.doc', 'application/msword', Buffer.from('fake-doc'));
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.doc'), `expected .doc, got ${saved[0].absPath}`);
    assert.ok(saved[0].urlPath.endsWith('.doc'), `expected .doc URL, got ${saved[0].urlPath}`);
    assert.equal(saved[0].content.fileName, 'legacy-doc.doc');
    assert.equal(saved[0].content.mimeType, 'application/msword');
    const files = await readdir(uploadDir);
    assert.deepEqual(files, ['legacy-doc.doc']);
  });

  it('accepts legacy .ppt PowerPoint format', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('legacy-slides.ppt', 'application/vnd.ms-powerpoint', Buffer.from('fake-ppt'));
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.ppt'), `expected .ppt, got ${saved[0].absPath}`);
    assert.ok(saved[0].urlPath.endsWith('.ppt'), `expected .ppt URL, got ${saved[0].urlPath}`);
    assert.equal(saved[0].content.fileName, 'legacy-slides.ppt');
    assert.equal(saved[0].content.mimeType, 'application/vnd.ms-powerpoint');
    const files = await readdir(uploadDir);
    assert.deepEqual(files, ['legacy-slides.ppt']);
  });

  it('accepts .xls when browser reports generic MIME type', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('legacy-data.xls', 'application/octet-stream', Buffer.from('fake-xls'));
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.xls'), `expected .xls, got ${saved[0].absPath}`);
    assert.equal(saved[0].content.mimeType, 'application/vnd.ms-excel');
    const files = await readdir(uploadDir);
    assert.deepEqual(files, ['legacy-data.xls']);
  });

  it('accepts Markdown attachments when the browser reports a generic MIME type', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const fakeFile = createMockFile('README.md', 'application/octet-stream', Buffer.from('# Readme'));
    const saved = await saveUploadedAttachments([fakeFile], uploadDir);

    assert.equal(saved.length, 1);
    assert.ok(saved[0].absPath.endsWith('.md'), `expected .md, got ${saved[0].absPath}`);
    assert.equal(saved[0].urlPath, '/uploads/README.md');
    assert.equal(saved[0].content.fileName, 'README.md');
    assert.equal(saved[0].content.mimeType, 'text/markdown');
    const files = await readdir(uploadDir);
    assert.deepEqual(files, ['README.md']);
  });

  it('preserves the original attachment name and appends a numeric suffix for duplicates', async () => {
    const { saveUploadedAttachments } = await import('../dist/routes/image-upload.js');

    const first = await saveUploadedAttachments([createMockFile('中文 报告.pdf', 'application/pdf', Buffer.from('one'))], uploadDir);
    const second = await saveUploadedAttachments([createMockFile('中文 报告.pdf', 'application/pdf', Buffer.from('two'))], uploadDir);

    assert.equal(first[0].content.fileName, '中文 报告.pdf');
    assert.equal(second[0].content.fileName, '中文 报告.pdf');
    assert.equal(first[0].urlPath, '/uploads/%E4%B8%AD%E6%96%87%20%E6%8A%A5%E5%91%8A.pdf');
    assert.equal(second[0].urlPath, '/uploads/%E4%B8%AD%E6%96%87%20%E6%8A%A5%E5%91%8A%20(1).pdf');

    const files = await readdir(uploadDir);
    assert.deepEqual(files.sort(), ['中文 报告 (1).pdf', '中文 报告.pdf']);
  });

});

describe('extractImagePaths', () => {
  it('extracts absolute paths from /uploads/ URLs', async () => {
    const { extractImagePaths } = await import('../dist/domains/agents/services/agents/providers/image-paths.js');

    const blocks = [
      { type: 'text', text: 'hello' },
      { type: 'image', url: '/uploads/1234-abcd.png' },
      { type: 'image', url: '/uploads/5678-efgh.jpg' },
    ];

    const paths = extractImagePaths(blocks);
    assert.equal(paths.length, 2);
    assert.ok(paths[0].endsWith('1234-abcd.png'));
    assert.ok(paths[1].endsWith('5678-efgh.jpg'));
  });

  it('returns empty array for undefined contentBlocks', async () => {
    const { extractImagePaths } = await import('../dist/domains/agents/services/agents/providers/image-paths.js');
    assert.deepEqual(extractImagePaths(undefined), []);
  });

  it('ignores non-image blocks', async () => {
    const { extractImagePaths } = await import('../dist/domains/agents/services/agents/providers/image-paths.js');

    const blocks = [
      { type: 'text', text: 'hello' },
      { type: 'code', language: 'js', code: 'x=1' },
    ];
    assert.deepEqual(extractImagePaths(blocks), []);
  });

  it('uses custom uploadDir when provided (regression: env vs opts mismatch)', async () => {
    const { extractImagePaths } = await import('../dist/domains/agents/services/agents/providers/image-paths.js');
    const { resolve } = await import('node:path');

    const blocks = [{ type: 'image', url: '/uploads/test.png' }];
    const paths = extractImagePaths(blocks, '/custom/upload/dir');
    assert.equal(paths.length, 1);
    assert.equal(paths[0], resolve('/custom/upload/dir', 'test.png'));
  });

  it('extracts workspace-backed image paths when the worktree root is registered', async () => {
    const { extractImagePaths } = await import('../dist/domains/agents/services/agents/providers/image-paths.js');
    const { ensureRegisteredWorktreeRoot } = await import('../dist/domains/workspace/workspace-security.js');

    const workspaceRoot = await mkdtemp(join(tmpdir(), 'office-claw-workspace-image-root-'));
    const entry = ensureRegisteredWorktreeRoot(workspaceRoot, 'workspace');
    const blocks = [
      {
        type: 'image',
        url: `/api/workspace/file/raw?worktreeId=${encodeURIComponent(entry.id)}&path=${encodeURIComponent('images/demo.png')}`,
      },
    ];

    try {
      const paths = extractImagePaths(blocks);
      assert.equal(paths.length, 1);
      assert.equal(paths[0], resolve(workspaceRoot, 'images', 'demo.png'));
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('extractUploadRefs', () => {
  it('extracts uploaded file paths from /uploads/ URLs', async () => {
    const { extractUploadRefs } = await import('../dist/domains/agents/services/agents/providers/image-paths.js');

    const blocks = [
      {
        type: 'file',
        url: '/uploads/%E4%B8%AD%E6%96%87%20%E6%8A%A5%E5%91%8A%20(1).pdf',
        fileName: '中文 报告.pdf',
        mimeType: 'application/pdf',
      },
    ];

    const refs = extractUploadRefs(blocks);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].kind, 'file');
    assert.ok(refs[0].path.endsWith('中文 报告 (1).pdf'));
    assert.equal(refs[0].fileName, '中文 报告.pdf');
  });

  it('extracts workspace-backed file paths when the worktree root is registered', async () => {
    const { extractUploadRefs } = await import('../dist/domains/agents/services/agents/providers/image-paths.js');
    const { ensureRegisteredWorktreeRoot } = await import('../dist/domains/workspace/workspace-security.js');

    const workspaceRoot = await mkdtemp(join(tmpdir(), 'office-claw-workspace-file-root-'));
    const entry = ensureRegisteredWorktreeRoot(workspaceRoot, 'workspace');
    const blocks = [
      {
        type: 'file',
        url: `/api/workspace/download?worktreeId=${encodeURIComponent(entry.id)}&path=${encodeURIComponent('docs/report.pdf')}`,
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
      },
    ];

    try {
      const refs = extractUploadRefs(blocks);
      assert.equal(refs.length, 1);
      assert.equal(refs[0].kind, 'file');
      assert.equal(refs[0].path, resolve(workspaceRoot, 'docs', 'report.pdf'));
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

describe('Claude CLI image fallback', () => {
  it('does not use unsupported --images flag, grants image dir access, and appends local path hints', async () => {
    const spawnArgs = [];
    const mockSpawnFn = (cmd, args, opts) => {
      spawnArgs.push({ cmd, args: [...args], opts });
      return createMockProcess([]);
    };

    const { ClaudeAgentService } = await import('../dist/domains/agents/services/agents/providers/ClaudeAgentService.js');
    const service = new ClaudeAgentService({ spawnFn: mockSpawnFn });

    for await (const _ of service.invoke('test', {
      contentBlocks: [
        { type: 'text', text: 'look at this' },
        { type: 'image', url: '/uploads/photo.png' },
      ],
    })) {
      // consume
    }

    assert.equal(spawnArgs.length, 1);
    const args = spawnArgs[0].args;
    const imgIdx = args.indexOf('--images');
    assert.equal(imgIdx, -1, 'should not pass unsupported --images flag');
    const addDirIdx = args.indexOf('--add-dir');
    assert.ok(addDirIdx >= 0, 'should pass --add-dir for image directory');
    const prompt = args.find((a) => typeof a === 'string' && a.includes('[Local image path:'));
    assert.ok(prompt, 'prompt should include local image path hint');
    assert.ok(prompt.includes('photo.png'));
  });

  it('grants file dir access and appends local file path hints for attachments', async () => {
    const spawnArgs = [];
    const mockSpawnFn = (cmd, args, opts) => {
      spawnArgs.push({ cmd, args: [...args], opts });
      return createMockProcess([]);
    };

    const { ClaudeAgentService } = await import('../dist/domains/agents/services/agents/providers/ClaudeAgentService.js');
    const service = new ClaudeAgentService({ spawnFn: mockSpawnFn });

    for await (const _ of service.invoke('read this document', {
      contentBlocks: [
        {
          type: 'file',
          url: '/uploads/file-1234-report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
        },
      ],
    })) {
      // consume
    }

    assert.equal(spawnArgs.length, 1);
    const args = spawnArgs[0].args;
    const addDirIdx = args.indexOf('--add-dir');
    assert.ok(addDirIdx >= 0, 'should pass --add-dir for attachment directory');
    const prompt = args.find((a) => typeof a === 'string' && a.includes('[Local file path:'));
    assert.ok(prompt, 'prompt should include local file path hint');
    assert.ok(prompt.includes('file-1234-report.pdf'));
    assert.ok(prompt.includes('(report.pdf)'));
  });
});

describe('Codex CLI image text fallback', () => {
  it('uses native --image arguments instead of prompt text fallback', async () => {
    const spawnArgs = [];
    const mockSpawnFn = (cmd, args, opts) => {
      spawnArgs.push({ cmd, args: [...args], opts });
      return createMockProcess([]);
    };

    const { CodexAgentService } = await import('../dist/domains/agents/services/agents/providers/CodexAgentService.js');
    const service = new CodexAgentService({ spawnFn: mockSpawnFn });

    for await (const _ of service.invoke('review this', {
      contentBlocks: [{ type: 'image', url: '/uploads/screenshot.png' }],
    })) {
      // consume
    }

    assert.equal(spawnArgs.length, 1);
    const args = spawnArgs[0].args;
    const imageIdx = args.indexOf('--image');
    assert.ok(imageIdx >= 0, 'should pass --image for codex exec');
    assert.ok(String(args[imageIdx + 1]).includes('screenshot.png'));
  });
});

describe('Gemini CLI image fallback', () => {
  it('does not use -i interactive flag, includes image dir, and appends local path hints', async () => {
    const spawnArgs = [];
    const mockSpawnFn = (cmd, args, opts) => {
      spawnArgs.push({ cmd, args: [...args], opts });
      return createMockProcess([]);
    };

    const { GeminiAgentService } = await import('../dist/domains/agents/services/agents/providers/GeminiAgentService.js');
    const service = new GeminiAgentService({
      adapter: 'gemini-cli',
      spawnFn: mockSpawnFn,
    });

    for await (const _ of service.invoke('describe this', {
      contentBlocks: [{ type: 'image', url: '/uploads/cat-photo.jpg' }],
    })) {
      // consume
    }

    assert.equal(spawnArgs.length, 1);
    const args = spawnArgs[0].args;
    const imgIdx = args.indexOf('-i');
    assert.equal(imgIdx, -1, 'should not pass -i (interactive prompt) for images');
    const includeDirIdx = args.indexOf('--include-directories');
    assert.ok(includeDirIdx >= 0, 'should include image directory for tool access');
    const prompt = args.find((a) => typeof a === 'string' && a.includes('[Local image path:'));
    assert.ok(prompt, 'prompt should include local image path hint');
    assert.ok(prompt.includes('cat-photo.jpg'));
  });
});

describe('contentBlocks in GET /api/messages', () => {
  let app;
  let messageStore;

  beforeEach(async () => {
    const { MessageStore } = await import('../dist/domains/agents/services/stores/ports/MessageStore.js');
    const { InvocationRegistry } = await import(
      '../dist/domains/agents/services/agents/invocation/InvocationRegistry.js'
    );
    const { ThreadStore } = await import('../dist/domains/agents/services/stores/ports/ThreadStore.js');
    const { messagesRoutes } = await import('../dist/routes/messages.js');

    messageStore = new MessageStore();
    app = Fastify();
    await app.register(messagesRoutes, {
      registry: new InvocationRegistry(),
      messageStore,
      socketManager: { broadcastAgentMessage: () => {} },
      threadStore: new ThreadStore(),
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns contentBlocks when present', async () => {
    messageStore.append({
      userId: 'default-user',
      agentId: null,
      content: 'check this image',
      contentBlocks: [
        { type: 'text', text: 'check this image' },
        { type: 'image', url: '/uploads/test.png' },
      ],
      mentions: ['opus'],
      timestamp: 1000,
    });

    const res = await app.inject({ method: 'GET', url: '/api/messages' });
    const body = JSON.parse(res.body);
    assert.equal(body.messages.length, 1);
    assert.ok(body.messages[0].contentBlocks);
    assert.equal(body.messages[0].contentBlocks.length, 2);
    assert.equal(body.messages[0].contentBlocks[0].type, 'text');
    assert.equal(body.messages[0].contentBlocks[1].type, 'image');
  });

  it('omits contentBlocks when not present', async () => {
    messageStore.append({
      userId: 'default-user',
      agentId: null,
      content: 'text only',
      mentions: [],
      timestamp: 1000,
    });

    const res = await app.inject({ method: 'GET', url: '/api/messages' });
    const body = JSON.parse(res.body);
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].contentBlocks, undefined);
  });
});

describe('POST /api/uploads/images/from-data-url', () => {
  let app;
  let uploadDir;

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'cat-cafe-upload-route-'));
    const { uploadsRoutes } = await import('../dist/routes/uploads.js');
    app = Fastify();
    await app.register(uploadsRoutes, { uploadDir });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it('returns a /uploads URL for valid image data URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/images/from-data-url',
      payload: {
        dataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.match(body.url, /^\/uploads\/.+\.png$/);

    const filename = body.url.replace('/uploads/', '');
    const content = await readFile(join(uploadDir, filename));
    assert.ok(content.byteLength > 0);
  });

  it('rejects malformed data URLs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/images/from-data-url',
      payload: { dataUrl: 'bogus' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, '上传失败，请检查文件是否正确或重试');
  });

  it('rejects GIF data URLs with a 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/images/from-data-url',
      payload: { dataUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
    });

    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, '上传失败，请检查文件是否正确或重试');
  });

  it('rejects requests missing dataUrl with a 400 instead of 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/uploads/images/from-data-url',
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, '上传失败，请检查文件是否正确或重试');
  });
});

describe('multipart image target routing', () => {
  let app;
  let uploadDir;
  const routeExecutionCalls = [];
  const broadcastedAgentMessages = [];

  beforeEach(async () => {
    uploadDir = await mkdtemp(join(tmpdir(), 'office-claw-image-target-'));
    routeExecutionCalls.length = 0;
    broadcastedAgentMessages.length = 0;

    const { MessageStore } = await import('../dist/domains/agents/services/stores/ports/MessageStore.js');
    const { InvocationRegistry } = await import(
      '../dist/domains/agents/services/agents/invocation/InvocationRegistry.js'
    );
    const { InvocationRecordStore } = await import(
      '../dist/domains/agents/services/stores/ports/InvocationRecordStore.js'
    );
    const { messagesRoutes } = await import('../dist/routes/messages.js');

    const messageStore = new MessageStore();
    const mockRouter = {
      async resolveTargetsAndIntent() {
        return {
          targetAgents: ['opus'],
          intent: { intent: 'execute', explicit: false, promptTags: [] },
        };
      },
      async *routeExecution(_userId, _content, _threadId, _userMessageId, targetAgents, _intent, routeOptions) {
        routeExecutionCalls.push({
          targetAgents: [...targetAgents],
          contentBlocks: routeOptions?.contentBlocks,
          uploadDir: routeOptions?.uploadDir,
        });
        yield { type: 'done', agentId: targetAgents[0], timestamp: Date.now(), isFinal: true };
      },
      async ackCollectedCursors() {},
    };

    app = Fastify();
    await app.register(messagesRoutes, {
      registry: new InvocationRegistry(),
      messageStore,
      socketManager: {
        broadcastAgentMessage: (msg) => {
          broadcastedAgentMessages.push(msg);
        },
        broadcastToRoom: () => {},
      },
      router: mockRouter,
      invocationRecordStore: new InvocationRecordStore(),
      uploadDir,
    });
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it('rejects multipart image messages before routing', async () => {
    const boundary = '----office-claw-test-boundary';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="content"\r\n\r\n请看图\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="clip.png"\r\nContent-Type: image/png\r\n\r\nfake-png-bytes\r\n`,
      ),
      Buffer.from(`--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/messages',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-office-claw-user': 'alice',
      },
      payload,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error, '该附件类型暂不支持');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(routeExecutionCalls.length, 0);
  });
});

// --- Test Helpers ---

function createMockFile(filename, mimetype, buffer) {
  return {
    filename,
    mimetype,
    toBuffer: async () => buffer,
  };
}

function createMockProcess(events) {
  const { Readable } = require('node:stream');

  const stdoutData = `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
  const stdout = Readable.from(stdoutData);
  const stderr = Readable.from('');

  return {
    stdout,
    stderr,
    on: (event, cb) => {
      if (event === 'close') setTimeout(() => cb(0, null), 10);
      if (event === 'error') {
        /* no-op */
      }
      return { stdout, stderr, on: () => ({}) };
    },
    kill: () => true,
    killed: false,
    pid: 12345,
  };
}
