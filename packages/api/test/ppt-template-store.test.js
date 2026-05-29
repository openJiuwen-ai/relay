/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it } from 'node:test';

describe('PptTemplateStore discovered user templates', () => {
  it('allows renaming and deleting discovered templates backed by root template-meta.json', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    const templateDir = join(rootDir, 'enterprise-blue');
    await mkdir(join(templateDir, 'slides'), { recursive: true });
    await mkdir(join(templateDir, 'temp'), { recursive: true });
    await writeFile(join(templateDir, 'enterprise-blue.md'), '# template\n', 'utf-8');
    await writeFile(join(templateDir, 'slides', 'slide-001.png'), 'fake', 'utf-8');
    await writeFile(join(templateDir, 'temp', 'template_data.json'), '{"ok":true}\n', 'utf-8');
    await writeFile(
      join(rootDir, 'template-meta.json'),
      `${JSON.stringify(
        {
          templates: [
            {
              id: 'enterprise-blue',
              name: 'enterprise-blue',
              path: 'enterprise-blue/enterprise-blue.md',
              source: 'enterprise-blue.pptx',
              createdAt: '2026-04-27T00:00:00.000Z',
              updatedAt: '2026-04-27T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const discovered = await store.get('user:enterprise-blue');
    assert.equal(discovered?.name, 'enterprise-blue');

    const renamed = await store.updateUserTemplate('user:enterprise-blue', { name: '企业蓝-重命名' });
    assert.equal(renamed?.name, '企业蓝-重命名');
    assert.equal(basename(renamed?.templateDir ?? ''), '企业蓝-重命名');

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates.length, 1);
    assert.equal(metadata.templates[0].name, '企业蓝-重命名');
    assert.equal(metadata.templates[0].path, '企业蓝-重命名/企业蓝-重命名.md');

    const directoryMetaRaw = await readFile(join(rootDir, '企业蓝-重命名', 'template-meta.json'), 'utf-8');
    const directoryMeta = JSON.parse(directoryMetaRaw);
    assert.equal(directoryMeta.id, 'enterprise-blue');
    assert.equal(directoryMeta.name, '企业蓝-重命名');

    await readFile(join(rootDir, '企业蓝-重命名', '企业蓝-重命名.md'), 'utf-8');

    const removed = await store.deleteUserTemplate('user:enterprise-blue');
    assert.equal(removed?.templateId, 'user:enterprise-blue');

    await assert.rejects(() => readFile(join(rootDir, '企业蓝-重命名', '企业蓝-重命名.md'), 'utf-8'));
    await rm(rootDir, { recursive: true, force: true });
  });

  it('ignores indexed templates whose registered main file is outside the controlled root', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    const templateDir = join(rootDir, '坏模板');
    await mkdir(templateDir, { recursive: true });
    await writeFile(join(templateDir, '坏模板.md'), '# template\n', 'utf-8');
    await writeFile(
      join(rootDir, 'template-meta.json'),
      `${JSON.stringify(
        {
          templates: [
            {
              id: 'bad-template',
              name: '坏模板',
              path: 'D:/outside/template-dir/坏模板.md',
              source: 'bad-template.pptx',
              createdAt: '2026-04-27T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const template = await store.get('user:bad-template');
    assert.equal(template, null);
    const templates = await store.list('user', true);
    assert.equal(templates.length, 0);

    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects builtin template rename and delete in store', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    await assert.rejects(() => store.updateUserTemplate('builtin:light-tech', { name: '新名字' }), {
      name: 'BuiltinTemplateMutationNotAllowedError',
    });
    await assert.rejects(() => store.deleteUserTemplate('builtin:light-tech'), {
      name: 'BuiltinTemplateMutationNotAllowedError',
    });

    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects invalid template names only during rename mutations', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    const uploaded = await store.createUserTemplate({ name: '../evil<script>' });
    assert.equal(uploaded.name, '../evil<script>');

    const created = await store.createUserTemplate({ name: '企业蓝', status: 'ready' });
    await assert.rejects(() => store.updateUserTemplate(created.templateId, { name: '../evil<script>' }), {
      name: 'InvalidTemplateNameError',
    });

    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects overly long template names when creating user templates', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    await assert.rejects(() => store.createUserTemplate({ name: '企'.repeat(31) }), {
      name: 'InvalidTemplateNameError',
    });

    await rm(rootDir, { recursive: true, force: true });
  });

  it('stores uploaded sources under short generated filenames', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    const uploadPath = await store.saveUploadedSource('enterprise-blue.pptx', Buffer.from('fake-pptx'));
    assert.equal(basename(uploadPath).endsWith('.pptx'), true);
    assert.equal(basename(uploadPath).includes('enterprise-blue'), false);

    await rm(rootDir, { recursive: true, force: true });
  });

  it('persists generating and failed transient templates into root template-meta.json', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    const uploadPath = await store.saveUploadedSource('enterprise-blue.pptx', Buffer.from('fake-pptx'));
    const created = await store.createUserTemplate({
      name: '企业蓝',
      originFileName: 'enterprise-blue.pptx',
      originFilePath: uploadPath,
      status: 'generating',
    });

    let metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    let metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates.length, 1);
    assert.equal(metadata.templates[0].id, created.templateId.slice('user:'.length));
    assert.equal(metadata.templates[0].status, 'generating');
    assert.equal(metadata.templates[0].originFileName, 'enterprise-blue.pptx');
    assert.match(metadata.templates[0].originFilePath, /^_uploads\//);

    const failed = await store.markGenerationFailed(created.templateId, 'skill interrupted');
    assert.equal(failed?.status, 'failed');

    metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates[0].status, 'failed');
    assert.equal(metadata.templates[0].lastError, 'skill interrupted');

    await rm(rootDir, { recursive: true, force: true });
  });

  it('recovers persisted generating templates as failed on restart', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();
    const uploadPath = await store.saveUploadedSource('deck.pptx', Buffer.from('fake-pptx'));
    const created = await store.createUserTemplate({
      name: 'deck',
      originFileName: 'deck.pptx',
      originFilePath: uploadPath,
      status: 'generating',
    });

    const restartedStore = new PptTemplateStore(rootDir, hostRoot);
    await restartedStore.ensureReady();

    const recovered = await restartedStore.get(created.templateId);
    assert.equal(recovered?.status, 'failed');
    assert.equal(recovered?.lastError, '服务在模板生成过程中退出，任务未完成，请重新上传');

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates[0].status, 'failed');
    assert.equal(metadata.templates[0].lastError, '服务在模板生成过程中退出，任务未完成，请重新上传');

    await rm(rootDir, { recursive: true, force: true });
  });

  it('deletes recovered failed template files after restart', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');

    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();
    const uploadPath = await store.saveUploadedSource('deck.pptx', Buffer.from('fake-pptx'));
    const templateDir = join(rootDir, 'deck');
    await mkdir(templateDir, { recursive: true });

    await store.createUserTemplate({
      name: 'deck',
      originFileName: 'deck.pptx',
      originFilePath: uploadPath,
      templateDir,
      status: 'failed',
      lastError: 'generation failed',
    });

    const restartedStore = new PptTemplateStore(rootDir, hostRoot);
    await restartedStore.ensureReady();
    const recoveredTemplates = await restartedStore.list('user', true);
    assert.equal(recoveredTemplates.length, 1);
    const removed = await restartedStore.deleteUserTemplate(recoveredTemplates[0].templateId);
    assert.equal(removed?.templateId, recoveredTemplates[0].templateId);

    await assert.rejects(() => stat(uploadPath));
    await assert.rejects(() => stat(templateDir));

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.deepEqual(metadata.templates, []);

    await rm(rootDir, { recursive: true, force: true });
  });

  it('bootstraps root template-meta.json from existing template folders', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const templateDir = join(rootDir, 'legacy-template');
    await mkdir(join(templateDir, 'slides'), { recursive: true });
    await mkdir(join(templateDir, 'temp'), { recursive: true });
    await writeFile(join(templateDir, 'legacy-template.md'), '# template\n', 'utf-8');
    await writeFile(join(templateDir, 'slides', 'slide-001.png'), 'fake', 'utf-8');
    await writeFile(join(templateDir, 'temp', 'template_data.json'), '{"ok":true}\n', 'utf-8');
    await writeFile(
      join(templateDir, 'template-meta.json'),
      `${JSON.stringify(
        {
          id: 'legacy-id',
          name: '旧模板名',
          path: 'legacy-template/legacy-template.md',
          source: 'legacy-template.pptx',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    const template = await store.get('user:legacy-id');
    assert.equal(template?.name, 'legacy-template');

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates.length, 1);
    assert.equal(metadata.templates[0].id, 'legacy-id');
    assert.equal(metadata.templates[0].name, 'legacy-template');
    assert.equal(metadata.templates[0].path, 'legacy-template/legacy-template.md');
    assert.equal(metadata.templates[0].source, undefined);
    assert.notEqual(metadata.templates[0].createdAt, '2020-01-01T00:00:00.000Z');

    await rm(rootDir, { recursive: true, force: true });
  });

  it('preserves uuid template ids when rebuilding root index from template directories', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();

    await mkdir(join(rootDir, '企业蓝', 'slides'), { recursive: true });
    await mkdir(join(rootDir, '企业蓝', 'temp'), { recursive: true });
    await writeFile(join(rootDir, '企业蓝', '企业蓝.md'), '# template\n', 'utf-8');
    await writeFile(join(rootDir, '企业蓝', 'slides', 'slide-001.png'), 'fake', 'utf-8');
    await writeFile(join(rootDir, '企业蓝', 'temp', 'template_data.json'), '{"ok":true}\n', 'utf-8');
    const created = await store.createUserTemplate({
      name: '企业蓝',
      templateDir: join(rootDir, '企业蓝'),
      status: 'generating',
    });
    const finalized = await store.finalizeGeneratedTemplate(created.templateId, { expectedName: '企业蓝' });
    assert.equal(finalized?.templateId, created.templateId);

    const directoryMetaRaw = await readFile(join(rootDir, '企业蓝', 'template-meta.json'), 'utf-8');
    const directoryMeta = JSON.parse(directoryMetaRaw);
    assert.equal(directoryMeta.id, created.templateId.slice('user:'.length));

    await unlink(join(rootDir, 'template-meta.json'));

    const restartedStore = new PptTemplateStore(rootDir, hostRoot);
    await restartedStore.ensureReady();

    const rebuilt = await restartedStore.get(created.templateId);
    assert.equal(rebuilt?.templateId, created.templateId);
    assert.equal(rebuilt?.name, '企业蓝');

    const rebuiltMetadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const rebuiltMetadata = JSON.parse(rebuiltMetadataRaw);
    assert.equal(rebuiltMetadata.templates.length, 1);
    assert.equal(rebuiltMetadata.templates[0].id, created.templateId.slice('user:'.length));

    await rm(rootDir, { recursive: true, force: true });
  });

  it('reports generation output snapshot for newly added ready template directories', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, rootDir);
    await store.ensureReady();

    const beforeDirs = await store.getPersistedTemplateDirs();
    const templateDir = join(rootDir, '企业蓝');
    await mkdir(join(templateDir, 'slides'), { recursive: true });
    await mkdir(join(templateDir, 'temp'), { recursive: true });
    await writeFile(join(templateDir, '企业蓝.md'), '# template\n', 'utf-8');
    await writeFile(join(templateDir, 'slides', 'slide-001.png'), 'fake', 'utf-8');
    await writeFile(join(templateDir, 'temp', 'template_data.json'), '{"ok":true}\n', 'utf-8');

    const snapshot = await store.getGenerationOutputSnapshot(beforeDirs);
    assert.equal(snapshot.templateDirCount, 1);
    assert.equal(snapshot.addedTemplateDirCount, 1);
    assert.equal(snapshot.readyTemplateDirCount, 1);
    assert.deepEqual(snapshot.addedTemplateDirs, ['企业蓝']);

    await rm(rootDir, { recursive: true, force: true });
  });

  it('does not upgrade recovered failed template into ready from incomplete output folder', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ppt-template-store-'));
    const hostRoot = rootDir;
    const templateDir = join(rootDir, 'incomplete-template');
    await mkdir(join(templateDir, 'slides'), { recursive: true });
    await writeFile(join(templateDir, 'incomplete-template.md'), '# template\n', 'utf-8');
    await writeFile(join(templateDir, 'slides', 'slide-001.png'), 'fake', 'utf-8');

    const { PptTemplateStore } = await import('../dist/domains/ppt/templates/PptTemplateStore.js');
    const store = new PptTemplateStore(rootDir, hostRoot);
    await store.ensureReady();
    const uploadPath = await store.saveUploadedSource('incomplete-template.pptx', Buffer.from('fake-pptx'));
    const created = await store.createUserTemplate({
      name: 'incomplete-template',
      originFileName: 'incomplete-template.pptx',
      originFilePath: uploadPath,
      status: 'generating',
      templateDir,
    });

    const restartedStore = new PptTemplateStore(rootDir, hostRoot);
    await restartedStore.ensureReady();

    const template = await restartedStore.get(created.templateId);
    assert.equal(template?.status, 'failed');
    assert.equal(template?.templateDir?.endsWith('incomplete-template'), true);

    const metadataRaw = await readFile(join(rootDir, 'template-meta.json'), 'utf-8');
    const metadata = JSON.parse(metadataRaw);
    assert.equal(metadata.templates.length, 1);
    assert.equal(metadata.templates[0].status, 'failed');
    assert.equal(metadata.templates[0].path, undefined);

    await rm(rootDir, { recursive: true, force: true });
  });
});
