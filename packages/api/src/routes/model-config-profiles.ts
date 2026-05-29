/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createProjectModelConfigSource,
  deleteProjectModelConfigSource,
  isModelConfigProviderFallbackEnabled,
  maskModelConfigApiKey,
  readProjectModelConfigProfileViews,
  updateProjectModelConfigSource,
} from '../config/model-config-profiles.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import {
  type ProviderProfilesRoutesOptions,
  projectQuerySchema,
  resolveProjectRoot,
} from './provider-profiles.shared.js';

const createModelConfigSourceBodySchema = z.object({
  projectPath: z.string().optional(),
  sourceId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().optional(),
  accessMode: z.enum(['huawei_maas_access']).optional(),
  baseUrl: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  headers: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
  models: z.array(z.string().trim().min(1)).min(1),
  serviceType: z.enum(['maas', 'claw-plan', 'coding-plan']).optional(),
});

const updateModelConfigSourceBodySchema = z.object({
  projectPath: z.string().optional(),
  displayName: z.string().trim().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().nullable().optional(),
  accessMode: z.enum(['huawei_maas_access']).optional(),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().trim().optional(),
  headers: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
  models: z.array(z.string().trim().min(1)).optional(),
  serviceType: z.enum(['maas', 'claw-plan', 'coding-plan']).optional(),
});

export const modelConfigProfilesRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app) => {
  app.get('/api/model-config-profiles', async (request, reply) => {
    const parsed = projectQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parsed.error.issues };
    }
    const projectRoot = parsed.data.projectPath
      ? await resolveProjectRoot(parsed.data.projectPath)
      : resolveActiveProjectRoot();
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }
    const providers = await readProjectModelConfigProfileViews(projectRoot);
    return {
      projectPath: 'global',
      fallbackToProviderProfiles: isModelConfigProviderFallbackEnabled(),
      exists: providers !== null,
      providers: (providers ?? []).map((profile) => ({ ...profile, source: 'model_config' as const })),
    };
  });

  app.post('/api/model-config-profiles', async (request, reply) => {
    const parsed = createModelConfigSourceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid body', details: parsed.error.issues };
    }

    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    try {
      const created = await createProjectModelConfigSource(projectRoot, {
        id: parsed.data.sourceId,
        ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        ...(parsed.data.icon ? { icon: parsed.data.icon } : {}),
        ...(parsed.data.accessMode ? { accessMode: parsed.data.accessMode } : {}),
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
        ...(parsed.data.headers ? { headers: parsed.data.headers } : {}),
        models: parsed.data.models,
        ...(parsed.data.serviceType ? { serviceType: parsed.data.serviceType } : {}),
      });

      reply.status(201);
      return {
        provider: {
          id: created.id,
          provider: created.id,
          displayName: created.displayName?.trim() || created.id,
          name: created.displayName?.trim() || created.id,
          description: created.description,
          icon: created.icon,
          authType: 'api_key',
          kind: 'api_key',
          builtin: false,
          mode: 'api_key',
          protocol: 'openai',
          models: created.models,
          hasApiKey: true,
          apiKey: maskModelConfigApiKey(created.apiKey),
          serviceType: created.serviceType,
          source: 'model_config' as const,
        },
      };
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.delete('/api/model-config-profiles/:sourceId', async (request, reply) => {
    const params = z.object({ sourceId: z.string().trim().min(1) }).safeParse(request.params);
    if (!params.success) {
      reply.status(400);
      return { error: 'Invalid params', details: params.error.issues };
    }

    const parsed = projectQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parsed.error.issues };
    }

    const projectRoot = parsed.data.projectPath
      ? await resolveProjectRoot(parsed.data.projectPath)
      : resolveActiveProjectRoot();
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    try {
      const deleted = await deleteProjectModelConfigSource(projectRoot, params.data.sourceId);
      if (!deleted) {
        reply.status(404);
        return { error: `model config source "${params.data.sourceId}" not found` };
      }
      return { success: true };
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.put('/api/model-config-profiles/:sourceId', async (request, reply) => {
    const params = z.object({ sourceId: z.string().trim().min(1) }).safeParse(request.params);
    if (!params.success) {
      reply.status(400);
      return { error: 'Invalid params', details: params.error.issues };
    }

    const parsed = updateModelConfigSourceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid body', details: parsed.error.issues };
    }

    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    try {
      const updateInput: {
        displayName?: string | null;
        description?: string | null;
        icon?: string | null;
        accessMode?: 'huawei_maas_access';
        baseUrl?: string;
        apiKey?: string;
        headers?: Record<string, string>;
        models?: string[];
        serviceType?: 'maas' | 'claw-plan' | 'coding-plan';
      } = {};

      if (parsed.data.displayName !== undefined) updateInput.displayName = parsed.data.displayName;
      if (parsed.data.description !== undefined) updateInput.description = parsed.data.description;
      if (parsed.data.icon !== undefined) updateInput.icon = parsed.data.icon;
      if (parsed.data.accessMode !== undefined) updateInput.accessMode = parsed.data.accessMode;
      if (parsed.data.baseUrl !== undefined) updateInput.baseUrl = parsed.data.baseUrl;
      if (parsed.data.apiKey !== undefined && parsed.data.apiKey.length > 0) {
        updateInput.apiKey = parsed.data.apiKey;
      }
      if (parsed.data.headers !== undefined) updateInput.headers = parsed.data.headers;
      if (parsed.data.models !== undefined) updateInput.models = parsed.data.models;
      if (parsed.data.serviceType !== undefined) updateInput.serviceType = parsed.data.serviceType;

      const updated = await updateProjectModelConfigSource(projectRoot, params.data.sourceId, updateInput);

      return {
        provider: {
          id: updated.id,
          provider: updated.id,
          displayName: updated.displayName?.trim() || updated.id,
          name: updated.displayName?.trim() || updated.id,
          description: updated.description,
          icon: updated.icon,
          authType: 'api_key',
          kind: 'api_key',
          builtin: false,
          mode: 'api_key',
          protocol: 'openai',
          models: updated.models,
          hasApiKey: true,
          apiKey: maskModelConfigApiKey(updated.apiKey),
          serviceType: updated.serviceType,
          source: 'model_config' as const,
        },
      };
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
};
