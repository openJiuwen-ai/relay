/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Uploads Static File Route
 * Serves uploaded images from the uploads directory.
 */

import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyPluginAsync } from 'fastify';
import { ImageUploadError, saveDataUrlImage } from './image-upload.js';

export interface UploadsRoutesOptions {
  uploadDir: string;
}

export const uploadsRoutes: FastifyPluginAsync<UploadsRoutesOptions> = async (app, opts) => {
  app.post<{ Body: { dataUrl: string } }>('/api/uploads/images/from-data-url', async (request, reply) => {
    try {
      const saved = await saveDataUrlImage(request.body.dataUrl, opts.uploadDir);
      return { url: saved.urlPath };
    } catch (error) {
      if (error instanceof ImageUploadError) {
        return reply.status(400).send({ error: '上传失败，请检查文件是否正确或重试' });
      }
      throw error;
    }
  });

  await app.register(fastifyStatic, {
    root: resolve(opts.uploadDir),
    prefix: '/uploads/',
    decorateReply: false,
  });
};
