/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { resolve } from 'node:path';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import {
  PptTemplateGenerationError,
  PptTemplateGenerationService,
} from '../domains/ppt/templates/PptTemplateGenerationService.js';
import {
  PptTemplateStore,
  assertValidPptTemplateName,
  assertValidPptTemplateNameLength,
  assertValidPptUploadFileNameLength,
} from '../domains/ppt/templates/PptTemplateStore.js';
import { resolveOfficeClawHostRoot } from '../utils/office-claw-root.js';
import { resolveTrustedUserId } from '../utils/request-identity.js';

const MAX_PPT_TEMPLATE_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_PPT_EXTENSIONS = new Set(['.pptx']);

function getStore(): PptTemplateStore {
  const hostRoot = resolveOfficeClawHostRoot(process.cwd());
  return new PptTemplateStore(resolve(hostRoot, '.office-claw', 'ppt-template'), hostRoot);
}

function isTemplateNameConflictError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TemplateNameConflictError';
}

function isInvalidTemplateNameError(error: unknown): boolean {
  return error instanceof Error && error.name === 'InvalidTemplateNameError';
}

function isInvalidUploadFileNameError(error: unknown): boolean {
  return error instanceof Error && error.name === 'InvalidPptTemplateUploadFileNameError';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface PptTemplatesRoutesOptions {
  store?: PptTemplateStore;
  generationService?: PptTemplateGenerationService;
}

export const pptTemplatesRoutes: FastifyPluginAsync<PptTemplatesRoutesOptions> = async (app, opts) => {
  const hostRoot = resolveOfficeClawHostRoot(process.cwd());
  const store = opts.store ?? new PptTemplateStore(resolve(hostRoot, '.office-claw', 'ppt-template'), hostRoot);
  const generationService = opts.generationService;
  await store.ensureReady();

  if (!generationService) {
    throw new Error('pptTemplatesRoutes requires generationService; direct script fallback has been removed');
  }

  await app.register(multipart, {
    attachFieldsToBody: false,
    limits: { fileSize: MAX_PPT_TEMPLATE_FILE_SIZE, files: 1 },
  });

  app.get('/api/ppt-templates', async (request, reply) => {
    const query = request.query as { source?: 'builtin' | 'user' | 'all'; includeGenerating?: string };
    const source = query.source ?? 'all';
    const includeGenerating = query.includeGenerating !== 'false';
    if (!['builtin', 'user', 'all'].includes(source)) {
      reply.status(400);
      return { error: 'Invalid source' };
    }
    const templates = await store.list(source, includeGenerating);
    const builtinCount = templates.filter((template) => template.source === 'builtin').length;
    const userCount = templates.filter((template) => template.source === 'user').length;
    return {
      templates,
      total: templates.length,
      builtinCount,
      userCount,
      source,
      includeGenerating,
    };
  });

  app.get('/api/ppt-templates/:templateId', async (request, reply) => {
    const params = request.params as { templateId: string };
    const template = await store.get(params.templateId);
    if (!template) {
      reply.status(404);
      return { error: 'template_not_found' };
    }
    return { template };
  });

  app.post('/api/ppt-templates/upload', async (request, reply) => {
    const userId = resolveTrustedUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    if (!request.isMultipart()) {
      reply.status(400);
      return { error: 'Expected multipart/form-data' };
    }
    const part = await request.file();
    if (!part) {
      reply.status(400);
      return { error: 'Missing file' };
    }
    const fileName = part.filename ?? 'upload.pptx';
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')).toLowerCase() : '';
    if (!ALLOWED_PPT_EXTENSIONS.has(ext)) {
      reply.status(422);
      return { error: 'invalid_ppt_template_file', detail: 'Only .pptx files are supported' };
    }
    try {
      assertValidPptUploadFileNameLength(fileName);
    } catch (error) {
      if (isInvalidUploadFileNameError(error)) {
        reply.status(422);
        return { error: 'invalid_ppt_template_file_name', detail: getErrorMessage(error) };
      }
      throw error;
    }

    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const requestedNameRaw = fields.name?.value;
    const requestedName = typeof requestedNameRaw === 'string' ? requestedNameRaw.trim() : '';
    const fallbackName = fileName.replace(/\.pptx$/i, '').trim() || '未命名模板';
    const templateName = requestedName || fallbackName;
    try {
      assertValidPptTemplateNameLength(templateName);
    } catch (error) {
      if (isInvalidTemplateNameError(error)) {
        reply.status(422);
        return { error: 'invalid_template_name', detail: getErrorMessage(error) };
      }
      throw error;
    }
    app.log.info({ userId, fileName, templateName }, '[ppt-templates/upload] request accepted');

    try {
      const buffer = await part.toBuffer();
      app.log.info({ userId, fileName, templateName, size: buffer.length }, '[ppt-templates/upload] file buffered');
      const generated = await generationService.generateFromUpload({
        name: templateName,
        fileName,
        buffer,
      });
      app.log.info(
        { userId, fileName, templateName, templateId: generated.templateId, status: generated.status },
        '[ppt-templates/upload] generation completed',
      );

      reply.status(200);
      return {
        template: generated,
      };
    } catch (error) {
      if (isTemplateNameConflictError(error)) {
        reply.status(409);
        return { error: 'template_name_conflict' };
      }
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) {
        reply.status(413);
        return { error: 'ppt_template_file_too_large', detail: 'Only PPT files smaller than 100MB are supported' };
      }
      if (isInvalidUploadFileNameError(error)) {
        reply.status(422);
        return { error: 'invalid_ppt_template_file_name', detail: getErrorMessage(error) };
      }
      if (isInvalidTemplateNameError(error)) {
        reply.status(422);
        return { error: 'invalid_template_name', detail: getErrorMessage(error) };
      }
      if (error instanceof PptTemplateGenerationError) {
        reply.status(error.statusCode);
        return { error: error.code, detail: error.detail ?? error.message };
      }
      throw error;
    }
  });

  app.patch('/api/ppt-templates/:templateId', async (request, reply) => {
    const params = request.params as { templateId: string };
    const body = request.body as { name?: unknown } | undefined;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      reply.status(400);
      return { error: 'Missing name' };
    }
    try {
      assertValidPptTemplateName(name);
    } catch (error) {
      if (isInvalidTemplateNameError(error)) {
        reply.status(422);
        return { error: 'invalid_template_name', detail: getErrorMessage(error) };
      }
      throw error;
    }
    const existing = await store.get(params.templateId);
    if (!existing) {
      reply.status(404);
      return { error: 'template_not_found' };
    }
    if (existing.source !== 'user') {
      reply.status(400);
      return { error: 'builtin_template_rename_not_allowed' };
    }
    if (existing.status !== 'ready') {
      reply.status(400);
      return { error: 'template_rename_only_allowed_when_ready' };
    }

    try {
      const updated = await store.updateUserTemplate(params.templateId, {
        name,
      });
      if (!updated) {
        reply.status(404);
        return { error: 'template_not_found' };
      }
      return { template: updated };
    } catch (error) {
      if (isTemplateNameConflictError(error)) {
        reply.status(409);
        return { error: 'template_name_conflict' };
      }
      if (isInvalidTemplateNameError(error)) {
        reply.status(422);
        return { error: 'invalid_template_name', detail: getErrorMessage(error) };
      }
      throw error;
    }
  });

  app.delete('/api/ppt-templates/:templateId', async (request, reply) => {
    const params = request.params as { templateId: string };
    const existing = await store.get(params.templateId);
    if (!existing) {
      reply.status(404);
      return { error: 'template_not_found' };
    }
    if (existing.source !== 'user') {
      reply.status(400);
      return { error: 'builtin_template_delete_not_allowed' };
    }
    const removed = await store.deleteUserTemplate(params.templateId);
    return { deleted: Boolean(removed), templateId: params.templateId };
  });
};
