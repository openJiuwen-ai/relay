/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  PptPathSecurityError,
  resolvePptPathUnderRoot,
  resolvePptProjectRoot,
} from '../domains/ppt/ppt-path-security.js';
import { createPptStudioService, type PptStudioExportRunner } from '../domains/ppt/ppt-studio-service.js';

export interface PptStudioRoutesOptions {
  exportRunner?: PptStudioExportRunner;
}

function replyForError(reply: FastifyReply, error: unknown) {
  if (error instanceof PptPathSecurityError) {
    reply.status(error.code === 'NOT_FOUND' ? 404 : 403);
    return { error: error.message };
  }
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    reply.status(404);
    return { error: 'File not found' };
  }
  if (error instanceof Error) {
    if (
      error.message.includes('No page-N.pptx.html files found') ||
      error.message.includes('PPT pages directory is not a directory')
    ) {
      reply.status(400);
    } else {
      reply.status(500);
    }
    return { error: error.message };
  }
  reply.status(500);
  return { error: 'Internal error' };
}

export const pptStudioRoutes: FastifyPluginAsync<PptStudioRoutesOptions> = async (app, opts) => {
  const service = createPptStudioService({ exportRunner: opts.exportRunner });

  app.get<{
    Querystring: { worktreeId?: string; pagesDir?: string; projectRoot?: string };
  }>('/api/ppt-studio/session', async (request, reply) => {
    const { pagesDir, projectRoot } = request.query ?? {};
    if (!projectRoot?.trim() || !pagesDir) {
      reply.status(400);
      return { error: 'projectRoot and pagesDir required' };
    }

    try {
      return await service.discoverSession(projectRoot.trim(), pagesDir);
    } catch (error) {
      return replyForError(reply, error);
    }
  });

  app.get<{
    Querystring: { worktreeId?: string; path?: string; projectRoot?: string };
  }>('/api/ppt-studio/slide', async (request, reply) => {
    const { path, projectRoot } = request.query ?? {};
    if (!projectRoot?.trim() || !path) {
      reply.status(400);
      return { error: 'projectRoot and path required' };
    }
    if (!/\.pptx\.html$/i.test(path)) {
      reply.status(400);
      return { error: 'Only page-N.pptx.html files are supported' };
    }

    try {
      const slide = await service.readSlideHtml(projectRoot.trim(), path);
      reply.header('content-type', 'text/html; charset=utf-8');
      reply.header('cache-control', 'no-store');
      reply.header('x-ppt-slide-sha256', slide.sha256);
      return reply.send(slide.html);
    } catch (error) {
      return replyForError(reply, error);
    }
  });

  app.get<{
    Querystring: { path?: string; projectRoot?: string };
  }>('/api/ppt-studio/download', async (request, reply) => {
    const { path: filePath, projectRoot } = request.query ?? {};
    if (!projectRoot?.trim() || !filePath) {
      reply.status(400);
      return { error: 'projectRoot and path required' };
    }

    try {
      const root = await resolvePptProjectRoot(projectRoot.trim());
      const abs = await resolvePptPathUnderRoot(root, filePath, { mustExist: true });
      const buf = await readFile(abs);
      reply.header('content-disposition', `attachment; filename="${basename(abs)}"`);
      reply.header('cache-control', 'no-store');
      reply.type('application/vnd.openxmlformats-officedocument.presentationml.presentation');
      return reply.send(buf);
    } catch (error) {
      return replyForError(reply, error);
    }
  });

  app.post<{
    Body: { worktreeId?: string; pagesDir?: string; outputPath?: string; deckTitle?: string; projectRoot?: string };
  }>('/api/ppt-studio/export', async (request, reply) => {
    const { pagesDir, outputPath, deckTitle, projectRoot } = request.body ?? {};
    if (!projectRoot?.trim() || !pagesDir) {
      reply.status(400);
      return { error: 'projectRoot and pagesDir required' };
    }

    try {
      return await service.exportDeck(projectRoot.trim(), pagesDir, outputPath, deckTitle);
    } catch (error) {
      return replyForError(reply, error);
    }
  });
};
