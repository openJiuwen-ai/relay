/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import Fastify from 'fastify';

async function createApp(options) {
  const app = Fastify();
  const { inspirationRoutes } = await import('../dist/routes/inspiration.js');
  await app.register(inspirationRoutes, options);
  return app;
}

test('default inspiration store reads bundled assets from the API package asset directory', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'inspiration-default-assets-'));
  const assetRoot = join(rootDir, 'packages', 'api', 'assets', 'inspiration');
  const productRoot = join(assetRoot, 'products');
  await mkdir(productRoot, { recursive: true });
  await writeFile(join(productRoot, 'default-source.md'), '# bundled default source\n', 'utf8');
  await writeFile(
    join(assetRoot, 'preset.json'),
    JSON.stringify({
      templates: [
        {
          id: 'tpl-default-assets-001',
          name: 'API 资产目录预置',
          title: 'API 资产目录预置标题',
          thumbnailUrl: '/images/inspiration-products/default.svg',
          category: '精选',
          description: '验证默认灵感广场预置从 API 包资源目录读取。',
          prompt: '读取 API 包内置预置产物。',
          skills: [],
          agents: [{ id: 'office', name: '通用助手', catId: 'office' }],
          products: [
            {
              id: 'prod-default-assets-001',
              name: 'default-source.md',
              type: 'markdown',
              relativePath: 'default-source.md',
            },
          ],
          createdAt: '2026-05-20T00:00:00Z',
          updatedAt: '2026-05-20T00:00:00Z',
        },
      ],
    }),
    'utf8',
  );

  const previousConfigRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;
  process.env.OFFICE_CLAW_CONFIG_ROOT = rootDir;
  const defaultAssetApp = await createApp();

  try {
    const list = await defaultAssetApp.inject({
      method: 'GET',
      url: '/api/inspiration/templates',
    });
    assert.equal(list.statusCode, 200);
    assert.deepEqual(
      list.json().data.templates.map((template) => template.id),
      ['tpl-default-assets-001'],
    );

    const product = await defaultAssetApp.inject({
      method: 'GET',
      url: '/api/inspiration/products/default-source.md',
    });
    assert.equal(product.statusCode, 200);
    assert.equal(product.body, '# bundled default source\n');
  } finally {
    await defaultAssetApp.close();
    if (previousConfigRoot === undefined) {
      delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    } else {
      process.env.OFFICE_CLAW_CONFIG_ROOT = previousConfigRoot;
    }
  }
});

describe('inspiration routes', () => {
  let app;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  test('list endpoint returns the template-card contract without product paths', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inspiration/templates?keyword=%E7%90%86%E8%B4%A2',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const [template] = body.data.templates;

    assert.equal(typeof template.id, 'string');
    assert.equal(typeof template.imagePath, 'string');
    assert.equal(typeof template.name, 'string');
    assert.equal(typeof template.description, 'string');
    assert.equal(Array.isArray(template.skills), true);
    assert.equal(Array.isArray(template.agents), true);
    assert.equal(Array.isArray(template.tags), true);
    assert.equal('productPath' in template, false);
    assert.equal('product' in template, false);
    assert.equal('products' in template, false);
    assert.equal('thumbnailUrl' in template, false);
    assert.equal('title' in template, false);
  });

  test('default preset list only contains templates with bundled artifacts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inspiration/templates',
    });

    assert.equal(res.statusCode, 200);
    const templates = res.json().data.templates;
    assert.deepEqual(templates.map((template) => template.id).sort(), [
      'tpl-data-004',
      'tpl-expert-003',
      'tpl-finance-001',
      'tpl-schedule-004',
      'tpl-viz-002',
      'tpl-viz-004',
    ]);
    assert.equal(res.json().data.total, 6);
  });

  test('preset list returns API-backed thumbnails for templates with bundled thumbnail images', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inspiration/templates',
    });

    assert.equal(res.statusCode, 200);
    const templates = res.json().data.templates;
    const expected = new Map([
      ['tpl-data-004', '/api/inspiration/thumbnails/churn-warning-analysis-thumbnail.png'],
      ['tpl-viz-002', '/api/inspiration/thumbnails/user-behavior-visualization-thumbnail.png'],
      ['tpl-viz-004', '/api/inspiration/thumbnails/sales-management-dashboard-thumbnail.png'],
    ]);

    for (const [id, imagePath] of expected) {
      const template = templates.find((entry) => entry.id === id);
      assert.equal(template?.imagePath, imagePath, id);
    }
  });

  test('detail endpoint extends the list contract with API-backed productPath', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inspiration/templates/tpl-finance-001',
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    const template = body.data;

    assert.equal(template.id, 'tpl-finance-001');
    assert.equal(template.productPath, '/api/inspiration/products/middle-class-finance-plan.md');
    assert.equal(template.product.path, template.productPath);
    assert.equal(template.product.type, 'markdown');
    assert.equal(typeof template.prompt, 'string');
    assert.equal(typeof template.imagePath, 'string');
    assert.equal(Array.isArray(template.tags), true);
  });

  test('artifact-backed preset prompts are available from the inspiration detail endpoint', async () => {
    const expected = [
      {
        id: 'tpl-schedule-004',
        productPath: '/api/inspiration/products/entropy-lidan-framework.md',
        productType: 'markdown',
      },
      {
        id: 'tpl-expert-003',
        productPath: '/api/inspiration/products/cart-upsell-review-report.md',
        productType: 'markdown',
      },
      {
        id: 'tpl-data-004',
        productPath: '/api/inspiration/products/churn-warning-analysis.png',
        productType: 'image',
      },
      {
        id: 'tpl-viz-002',
        productPath: '/api/inspiration/products/user-behavior-visualization.html',
        productType: 'html',
      },
      {
        id: 'tpl-viz-004',
        productPath: '/api/inspiration/products/sales-management-dashboard.html',
        productType: 'html',
      },
      {
        id: 'tpl-finance-001',
        productPath: '/api/inspiration/products/middle-class-finance-plan.md',
        productType: 'markdown',
      },
    ];

    for (const item of expected) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/inspiration/templates/${item.id}`,
      });

      assert.equal(res.statusCode, 200, item.id);
      const template = res.json().data;
      assert.equal(template.productPath, item.productPath);
      assert.equal(template.product.path, item.productPath);
      assert.equal(template.product.type, item.productType);
    }
  });

  test('product endpoint serves bundled inspiration artifacts from the API', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inspiration/products/middle-class-finance-plan.md',
    });

    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'], /^text\/markdown/);
    assert.match(res.body, /普通中产家庭理财规划方案/);
  });

  test('thumbnail endpoint serves bundled inspiration thumbnails from the API', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inspiration/thumbnails/user-behavior-visualization-thumbnail.png',
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.equal(Buffer.from(res.rawPayload).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  });

  test('routes can use an injected production preset store', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'inspiration-store-'));
    const productRoot = join(rootDir, 'inspiration-products');
    const thumbnailRoot = join(rootDir, 'inspiration-thumbnails');
    const presetPath = join(rootDir, 'inspiration-preset.json');
    await mkdir(productRoot, { recursive: true });
    await mkdir(thumbnailRoot, { recursive: true });
    await writeFile(join(productRoot, 'custom.md'), '# custom artifact\n', 'utf8');
    await writeFile(
      join(thumbnailRoot, 'custom-thumbnail.png'),
      Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
    );
    await writeFile(
      presetPath,
      JSON.stringify({
        templates: [
          {
            id: 'tpl-custom-001',
            name: '自定义预置',
            title: '自定义预置标题',
            thumbnailUrl: '/images/inspiration-products/default.svg',
            thumbnailRelativePath: 'custom-thumbnail.png',
            category: '精选',
            description: '用于验证注入式生产预置存储。',
            prompt: '生成一个自定义产物。',
            skills: [{ id: 'skill-custom', name: '自定义技能' }],
            agents: [{ id: 'office', name: '通用助手', catId: 'office' }],
            products: [
              {
                id: 'prod-custom-001',
                name: 'custom.md',
                type: 'markdown',
                relativePath: 'custom.md',
              },
            ],
            createdAt: '2026-05-19T00:00:00Z',
            updatedAt: '2026-05-19T00:00:00Z',
          },
        ],
      }),
      'utf8',
    );

    const { InspirationTemplateStore } = await import('../dist/domains/inspiration/InspirationTemplateStore.js');
    const customApp = await createApp({
      store: new InspirationTemplateStore({ presetPath, productRoot, thumbnailRoot }),
    });

    try {
      const detail = await customApp.inject({
        method: 'GET',
        url: '/api/inspiration/templates/tpl-custom-001',
      });
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.json().data.imagePath, '/api/inspiration/thumbnails/custom-thumbnail.png');
      assert.equal(detail.json().data.productPath, '/api/inspiration/products/custom.md');

      const product = await customApp.inject({
        method: 'GET',
        url: '/api/inspiration/products/custom.md',
      });
      assert.equal(product.statusCode, 200);
      assert.equal(product.body, '# custom artifact\n');

      const thumbnail = await customApp.inject({
        method: 'GET',
        url: '/api/inspiration/thumbnails/custom-thumbnail.png',
      });
      assert.equal(thumbnail.statusCode, 200);
      assert.equal(thumbnail.headers['content-type'], 'image/png');
    } finally {
      await customApp.close();
    }
  });
});
