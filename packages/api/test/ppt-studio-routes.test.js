/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import Fastify from 'fastify';

describe('ppt studio routes', () => {
  let app;
  let tempRoot;
  const pagesDir = 'output/demo/pages';
  const outputPath = 'output/demo/final-deck.pptx';
  const exportCalls = [];

  before(async () => {
    const { pptStudioRoutes } = await import('../dist/routes/ppt-studio.js');

    tempRoot = await mkdtemp(join(tmpdir(), 'ppt-studio-routes-'));

    await mkdir(join(tempRoot, pagesDir), { recursive: true });
    await writeFile(
      join(tempRoot, pagesDir, 'page-2.pptx.html'),
      `<!doctype html>
<html>
  <head><title>Second Slide</title></head>
  <body>
    <section class="ppt-slide" data-slide-id="slide-two">
      <h1 data-slide-id="slide-two" data-block-id="title-2" data-block-type="title">Second Slide</h1>
    </section>
  </body>
</html>`,
      'utf-8',
    );
    await writeFile(
      join(tempRoot, pagesDir, 'page-1.pptx.html'),
      `<!doctype html>
<html>
  <head><title>Q1 Roadmap</title></head>
  <body>
    <section class="ppt-slide" data-slide-id="slide-one">
      <h1 data-slide-id="slide-one" data-block-id="title-1" data-block-type="title">Q1 Roadmap</h1>
      <div data-slide-id="slide-one" data-block-id="chart-main" data-block-type="chart">Chart</div>
      <div data-slide-id="slide-one" data-block-id="chart-main" data-block-type="chart">Duplicate anchor</div>
    </section>
  </body>
</html>`,
      'utf-8',
    );

    app = Fastify();
    await app.register(pptStudioRoutes, {
      exportRunner: async ({ inputDir, outputPath: resolvedOutputPath }) => {
        exportCalls.push({ inputDir, outputPath: resolvedOutputPath });
        await writeFile(resolvedOutputPath, Buffer.from('pptx-output'));
        return { stdout: 'exported', stderr: '' };
      },
    });
    await app.ready();
  });

  after(async () => {
    await app?.close();
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  });

  it('GET /api/ppt-studio/session scans page HTML files into slide metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/ppt-studio/session?projectRoot=${encodeURIComponent(tempRoot)}&pagesDir=${encodeURIComponent(pagesDir)}`,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.worktreeId, undefined);
    assert.equal(body.pagesDir, pagesDir);
    assert.equal(body.status, 'editable');
    assert.equal(body.slides.length, 2);

    assert.equal(body.slides[0].pageNumber, 1);
    assert.equal(body.slides[0].slideId, 'slide-one');
    assert.equal(body.slides[0].htmlPath, `${pagesDir}/page-1.pptx.html`);
    assert.equal(body.slides[0].title, 'Q1 Roadmap');
    assert.equal(body.slides[0].blockCount, 2);
    assert.equal(body.slides[0].sha256.length, 64);
    assert.match(body.slides[0].url, /^\/api\/ppt-studio\/slide\?/);

    assert.equal(body.slides[1].pageNumber, 2);
    assert.equal(body.slides[1].slideId, 'slide-two');
  });

  it('GET /api/ppt-studio/slide serves slide HTML with the preview bridge injected', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/ppt-studio/slide?projectRoot=${encodeURIComponent(tempRoot)}&path=${encodeURIComponent(
        `${pagesDir}/page-1.pptx.html`,
      )}`,
    });

    assert.equal(res.statusCode, 200);
    assert.match(String(res.headers['content-type']), /^text\/html/);
    assert.equal(String(res.headers['x-ppt-slide-sha256']).length, 64);
    assert.ok(res.body.includes('Q1 Roadmap'));
    assert.ok(res.body.includes('data-cat-cafe-bridge="true"'));
    assert.ok(res.body.includes('screenshot-request'));
  });

  it('POST /api/ppt-studio/export explicitly exports current HTML pages to a PPTX file', async () => {
    exportCalls.length = 0;
    const res = await app.inject({
      method: 'POST',
      url: '/api/ppt-studio/export',
      payload: { projectRoot: tempRoot, pagesDir, outputPath },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.worktreeId, undefined);
    assert.equal(body.pagesDir, pagesDir);
    assert.equal(body.outputPath, outputPath);
    assert.equal(
      body.downloadUrl,
      `/api/ppt-studio/download?projectRoot=${encodeURIComponent(tempRoot)}&path=${encodeURIComponent(outputPath)}`,
    );
    assert.equal(body.size, 11);
    assert.equal(exportCalls.length, 1);
    assert.ok(exportCalls[0].inputDir.replace(/\\/g, '/').endsWith('output/demo/pages'));
    assert.ok(exportCalls[0].outputPath.replace(/\\/g, '/').endsWith('output/demo/final-deck.pptx'));

    const exported = await stat(join(tempRoot, outputPath));
    assert.equal(exported.isFile(), true);
  });

  it('rejects workspace traversal in session scans', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/ppt-studio/session?projectRoot=${encodeURIComponent(tempRoot)}&pagesDir=${encodeURIComponent('../outside')}`,
    });

    assert.equal(res.statusCode, 403);
  });
});
