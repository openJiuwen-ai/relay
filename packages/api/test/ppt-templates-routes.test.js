/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';
import Fastify from 'fastify';

describe('pptTemplatesRoutes upload errors', () => {
  it('returns a readable dependency error when generator prerequisites are missing', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const { PptTemplateGenerationError } = await import('../dist/domains/ppt/templates/PptTemplateGenerationService.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => {
          throw new PptTemplateGenerationError({
            code: 'ppt_template_dependency_missing',
            statusCode: 503,
            message: 'VLM_DEPENDENCY_MISSING\n原因: LibreOffice 未安装（PPT 转图片必需）',
            detail: 'VLM_DEPENDENCY_MISSING\n原因: LibreOffice 未安装（PPT 转图片必需）',
          });
        },
      },
    });
    await app.ready();

    const boundary = '----ppt-template-upload';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n企业蓝\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="template.pptx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`,
      ),
      Buffer.from('fake-pptx-binary'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ppt-templates/upload',
      headers: {
        'x-office-claw-user': 'test-user',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(res.statusCode, 503);
    const body = res.json();
    assert.equal(body.error, 'ppt_template_dependency_missing');
    assert.match(body.detail, /LibreOffice 未安装/);

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects builtin template rename and delete via routes', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => {
          throw new Error('not implemented in this test');
        },
      },
    });
    await app.ready();

    const renameRes = await app.inject({
      method: 'PATCH',
      url: '/api/ppt-templates/builtin:light-tech',
      payload: { name: '不允许重命名' },
    });
    assert.equal(renameRes.statusCode, 400);
    assert.equal(renameRes.json().error, 'builtin_template_rename_not_allowed');

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/ppt-templates/builtin:light-tech',
    });
    assert.equal(deleteRes.statusCode, 400);
    assert.equal(deleteRes.json().error, 'builtin_template_delete_not_allowed');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects invalid rename characters via routes', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);
    await store.ensureReady();

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => {
          throw new Error('not implemented in this test');
        },
      },
    });
    await app.ready();

    const created = await store.createUserTemplate({ name: '企业蓝', status: 'ready' });

    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/api/ppt-templates/${encodeURIComponent(created.templateId)}`,
      payload: { name: '../evil<script>' },
    });
    assert.equal(renameRes.statusCode, 422);
    assert.equal(renameRes.json().error, 'invalid_template_name');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects overly long rename names via routes', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);
    await store.ensureReady();

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => {
          throw new Error('not implemented in this test');
        },
      },
    });
    await app.ready();

    const created = await store.createUserTemplate({ name: '企业蓝', status: 'ready' });

    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/api/ppt-templates/${encodeURIComponent(created.templateId)}`,
      payload: { name: '企'.repeat(31) },
    });
    assert.equal(renameRes.statusCode, 422);
    assert.equal(renameRes.json().error, 'invalid_template_name');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects failed template rename via routes', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);
    await store.ensureReady();

    const uploadPath = await store.saveUploadedSource('failed-deck.pptx', Buffer.from('fake-pptx'));
    const created = await store.createUserTemplate({
      name: '失败模板',
      originFileName: 'failed-deck.pptx',
      originFilePath: uploadPath,
      status: 'failed',
      lastError: 'generation failed',
    });

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => {
          throw new Error('not implemented in this test');
        },
      },
    });
    await app.ready();

    const renameRes = await app.inject({
      method: 'PATCH',
      url: `/api/ppt-templates/${encodeURIComponent(created.templateId)}`,
      payload: { name: '不允许改名' },
    });
    assert.equal(renameRes.statusCode, 400);
    assert.equal(renameRes.json().error, 'template_rename_only_allowed_when_ready');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects uploads larger than 100MB via routes', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => ({
          templateId: 'user:should-not-run',
          name: 'should-not-run',
          source: 'user',
          status: 'ready',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      },
    });
    await app.ready();

    const boundary = '----ppt-template-upload-too-large';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n企业蓝\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="template.pptx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`,
      ),
      Buffer.alloc(100 * 1024 * 1024 + 1, 'a'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ppt-templates/upload',
      headers: {
        'x-office-claw-user': 'test-user',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(res.statusCode, 413);
    assert.equal(res.json().error, 'ppt_template_file_too_large');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects .ppt uploads via routes', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => {
          throw new Error('should not be called');
        },
      },
    });
    await app.ready();

    const boundary = '----ppt-template-upload-ppt';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n经典模板\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="classic-template.ppt"\r\nContent-Type: application/vnd.ms-powerpoint\r\n\r\n`,
      ),
      Buffer.from('fake-ppt-binary'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ppt-templates/upload',
      headers: {
        'x-office-claw-user': 'test-user',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'invalid_ppt_template_file');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('accepts upload when fallback name comes from punctuated filename', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async ({ name }) => ({
          templateId: 'user:q2-2026',
          name,
          source: 'user',
          status: 'generating',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      },
    });
    await app.ready();

    const boundary = '----ppt-template-upload-punctuated-name';
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="Q2.2026 项目汇报（终版）.pptx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`,
      ),
      Buffer.from('fake-pptx-binary'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ppt-templates/upload',
      headers: {
        'x-office-claw-user': 'test-user',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.json().template.name, 'Q2.2026 项目汇报（终版）');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects uploads whose original filename is too long', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const app = Fastify();
    const store = new PptTemplateStore(rootDir, rootDir);

    await app.register(pptTemplatesRoutes, {
      store,
      generationService: {
        generateFromUpload: async () => {
          throw new Error('should not be called');
        },
      },
    });
    await app.ready();

    const boundary = '----ppt-template-upload-long-name';
    const longFileName = `${'浅'.repeat(31)}.pptx`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${longFileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`,
      ),
      Buffer.from('fake-pptx-binary'),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await app.inject({
      method: 'POST',
      url: '/api/ppt-templates/upload',
      headers: {
        'x-office-claw-user': 'test-user',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    assert.equal(res.statusCode, 422);
    assert.equal(res.json().error, 'invalid_ppt_template_file_name');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('returns persisted failed template after restart recovery', async () => {
    const { pptTemplatesRoutes } = await import('../dist/routes/ppt-templates.js');
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-templates-routes-'));
    const store = new PptTemplateStore(rootDir, rootDir);
    await store.ensureReady();
    const uploadPath = await store.saveUploadedSource('deck.pptx', Buffer.from('fake-pptx'));
    const created = await store.createUserTemplate({
      name: 'deck',
      originFileName: 'deck.pptx',
      originFilePath: uploadPath,
      status: 'generating',
    });

    const app = Fastify();
    const restartedStore = new PptTemplateStore(rootDir, rootDir);
    await app.register(pptTemplatesRoutes, {
      store: restartedStore,
      generationService: {
        generateFromUpload: async () => {
          throw new Error('not implemented in this test');
        },
      },
    });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/ppt-templates?source=user',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.templates.length, 1);
    assert.equal(body.templates[0].templateId, created.templateId);
    assert.equal(body.templates[0].status, 'failed');
    assert.equal(body.templates[0].lastError, '服务在模板生成过程中退出，任务未完成，请重新上传');

    await app.close();
    await rm(rootDir, { recursive: true, force: true });
  });
});
