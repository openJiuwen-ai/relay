/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

describe('PptTemplateGenerationService prompt-driven flow', () => {
  it('builds a skill prompt and finalizes from scanned template directories', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-generation-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const { PptTemplateGenerationService } = await import('../dist/domains/ppt/templates/PptTemplateGenerationService.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    let capturedPrompt = '';
    const service = new PptTemplateGenerationService({
      store,
      hostRoot,
      invokeSkill: async ({ prompt, outputRoot }) => {
        capturedPrompt = prompt;
        const templateName = '未来科技风';
        const templateDir = join(outputRoot, templateName);
        await mkdir(join(templateDir, 'slides'), { recursive: true });
        await mkdir(join(templateDir, 'temp'), { recursive: true });
        await writeFile(join(templateDir, `${templateName}.md`), '# template\n', 'utf-8');
        await writeFile(join(templateDir, 'slides', 'slide-001.png'), 'fake', 'utf-8');
        await writeFile(join(templateDir, 'temp', 'template_data.json'), '{"ok":true}\n', 'utf-8');
        return { stdout: 'ok' };
      },
    });

    const result = await service.generateFromUpload({
      name: '企业蓝',
      fileName: 'company-template.pptx',
      buffer: Buffer.from('fake-pptx'),
    });

    assert.match(capturedPrompt, /ppt-template-generate skill/);
    assert.match(capturedPrompt, /模板保存根目录/);
    assert.match(capturedPrompt, /slides/);
    assert.match(capturedPrompt, /temp\//);
    assert.match(capturedPrompt, /根据 PPT 风格自行生成模板名称/);
    assert.doesNotMatch(capturedPrompt, /期望模板名称/);
    assert.doesNotMatch(capturedPrompt, /企业蓝/);
    assert.doesNotMatch(capturedPrompt, /template-meta\.json/);
    assert.doesNotMatch(capturedPrompt, /styles\.json/);
    assert.equal(result.name, '未来科技风');
    assert.equal(result.status, 'ready');
    assert.match(result.templateId, /^user:[0-9a-f-]{36}$/i);

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates.length, 1);
    assert.equal(metadata.templates[0].id, result.templateId.slice('user:'.length));
    assert.equal(metadata.templates[0].name, '未来科技风');
    assert.equal(metadata.templates[0].path, '未来科技风/未来科技风.md');
    assert.equal(metadata.templates[0].status, 'ready');
    assert.equal(metadata.templates.some((entry) => entry.status === 'generating'), false);

    await rm(rootDir, { recursive: true, force: true });
  });

  it('marks template as failed when generated artifacts are incomplete', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-generation-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const { PptTemplateGenerationService } = await import('../dist/domains/ppt/templates/PptTemplateGenerationService.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    const service = new PptTemplateGenerationService({
      store,
      hostRoot,
      invokeSkill: async ({ outputRoot }) => {
        const templateName = '残缺模板';
        const templateDir = join(outputRoot, templateName);
        await mkdir(join(templateDir, 'slides'), { recursive: true });
        await writeFile(join(templateDir, `${templateName}.md`), '# template\n', 'utf-8');
        await writeFile(join(templateDir, 'slides', 'slide-001.png'), 'fake', 'utf-8');
        return { stdout: 'ok' };
      },
    });

    await assert.rejects(
      () =>
        service.generateFromUpload({
          name: '企业蓝',
          fileName: 'company-template.pptx',
          buffer: Buffer.from('fake-pptx'),
        }),
      /Generated template directory was not discovered after skill finished/,
    );

    const templates = await store.list('user', true);
    assert.equal(templates.length, 1);
    assert.equal(templates[0].status, 'failed');
    assert.match(templates[0].lastError ?? '', /Generated template directory was not discovered after skill finished/);

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates.length, 1);
    assert.equal(metadata.templates[0].status, 'failed');

    await rm(rootDir, { recursive: true, force: true });
  });

  it('keeps the same template id after generation completes', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-generation-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const { PptTemplateGenerationService } = await import('../dist/domains/ppt/templates/PptTemplateGenerationService.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();
    const beforeTemplates = await store.list('user', true);
    assert.equal(beforeTemplates.length, 0);

    const service = new PptTemplateGenerationService({
      store,
      hostRoot,
      invokeSkill: async ({ outputRoot }) => {
        const templateName = '企业蓝';
        const templateDir = join(outputRoot, templateName);
        await mkdir(join(templateDir, 'slides'), { recursive: true });
        await mkdir(join(templateDir, 'temp'), { recursive: true });
        await writeFile(join(templateDir, `${templateName}.md`), '# template\n', 'utf-8');
        await writeFile(join(templateDir, 'slides', 'slide-001.png'), 'fake', 'utf-8');
        await writeFile(join(templateDir, 'temp', 'template_data.json'), '{"ok":true}\n', 'utf-8');
        return { stdout: 'ok' };
      },
    });

    let placeholderId = '';
    const originalCreateUserTemplate = store.createUserTemplate.bind(store);
    store.createUserTemplate = async (input) => {
      const created = await originalCreateUserTemplate(input);
      placeholderId = created.templateId;
      return created;
    };

    const result = await service.generateFromUpload({
      name: '企业蓝',
      fileName: 'company-template.pptx',
      buffer: Buffer.from('fake-pptx'),
    });

    assert.match(placeholderId, /^user:[0-9a-f-]{36}$/i);
    assert.equal(result.templateId, placeholderId);
    assert.equal(result.status, 'ready');

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates.length, 1);
    assert.equal(metadata.templates[0].id, placeholderId.slice('user:'.length));
    assert.equal(metadata.templates[0].status, 'ready');
    assert.equal(metadata.templates[0].path, '企业蓝/企业蓝.md');

    await rm(rootDir, { recursive: true, force: true });
  });

  it('times out long-running skill invocations and marks the template as failed', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-generation-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const { PptTemplateGenerationError, PptTemplateGenerationService } = await import(
      '../dist/domains/ppt/templates/PptTemplateGenerationService.js'
    );
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    let sawAbort = false;
    const service = new PptTemplateGenerationService({
      store,
      hostRoot,
      generationTimeoutMs: 20,
      progressLogIntervalMs: 1000,
      invokeSkill: async ({ signal }) => {
        await new Promise((resolve) => {
          signal?.addEventListener(
            'abort',
            () => {
              sawAbort = true;
              resolve(undefined);
            },
            { once: true },
          );
        });
        return { stdout: 'should not win race' };
      },
    });

    await assert.rejects(
      () =>
        service.generateFromUpload({
          name: '企业蓝',
          fileName: 'company-template.pptx',
          buffer: Buffer.from('fake-pptx'),
        }),
      (error) => {
        assert.ok(error instanceof PptTemplateGenerationError);
        assert.equal(error.code, 'ppt_template_generation_timeout');
        assert.equal(error.statusCode, 504);
        return true;
      },
    );

    assert.equal(sawAbort, true);
    const templates = await store.list('user', true);
    assert.equal(templates.length, 1);
    assert.equal(templates[0].status, 'failed');
    assert.match(templates[0].lastError ?? '', /timed out/);

    await rm(rootDir, { recursive: true, force: true });
  });

});
