/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { InspirationTemplateStore } from '../domains/inspiration/InspirationTemplateStore.js';
import type { ProductType, TemplateCategory } from '../domains/inspiration/types.js';
import { resolveOfficeClawHostRoot } from '../utils/office-claw-root.js';

export interface InspirationRoutesOptions {
  store?: InspirationTemplateStore;
}

export function resolveDefaultInspirationAssetPaths(hostRoot = resolveOfficeClawHostRoot(process.cwd())) {
  const assetRoot = resolve(hostRoot, 'packages', 'api', 'assets', 'inspiration');
  return {
    presetPath: resolve(assetRoot, 'preset.json'),
    productRoot: resolve(assetRoot, 'products'),
    thumbnailRoot: resolve(assetRoot, 'thumbnails'),
  };
}

function createDefaultStore(): InspirationTemplateStore {
  return new InspirationTemplateStore(resolveDefaultInspirationAssetPaths());
}

export const inspirationRoutes: FastifyPluginAsync<InspirationRoutesOptions> = async (app, opts) => {
  const store = opts.store ?? createDefaultStore();

  // 获取灵感模板列表
  app.get('/api/inspiration/templates', async (request, _reply) => {
    const query = request.query as { category?: string; keyword?: string; productType?: string };
    const category = (query.category as TemplateCategory | '全部') || '全部';
    const keyword = query.keyword || '';
    const productType = (query.productType as ProductType | '全部') || '全部';

    const templates = await store.searchTemplates(keyword, category, productType);

    return {
      code: 0,
      message: 'success',
      data: {
        templates,
        total: templates.length,
      },
    };
  });

  // 获取灵感模板详情
  app.get('/api/inspiration/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const template = await store.getTemplateById(id);

    if (!template) {
      reply.status(404);
      return {
        code: 404,
        message: '模板不存在',
        data: null,
      };
    }

    return {
      code: 0,
      message: 'success',
      data: template,
    };
  });

  // 获取预置灵感产物
  app.get('/api/inspiration/products/*', async (request, reply) => {
    const { '*': productPath } = request.params as { '*': string };
    const file = await store.getProductFile(productPath);
    if (!file) {
      reply.status(404);
      return {
        code: 404,
        message: '产物不存在',
        data: null,
      };
    }

    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.type(file.contentType).send(createReadStream(file.filePath));
  });

  // 获取预置灵感缩略图
  app.get('/api/inspiration/thumbnails/*', async (request, reply) => {
    const { '*': thumbnailPath } = request.params as { '*': string };
    const file = await store.getThumbnailFile(thumbnailPath);
    if (!file) {
      reply.status(404);
      return {
        code: 404,
        message: '缩略图不存在',
        data: null,
      };
    }

    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.type(file.contentType).send(createReadStream(file.filePath));
  });
};
