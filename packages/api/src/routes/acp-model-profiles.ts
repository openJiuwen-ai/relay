/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import {
  createAcpModelProfile,
  deleteAcpModelProfile,
  getAcpModelProfile,
  readAcpModelProfiles,
  updateAcpModelProfile,
} from '../config/acp-model-profiles.js';
import { resolveUserId } from '../utils/request-identity.js';
import {
  createAcpModelProfileBodySchema,
  projectQueryBodySchema,
  projectQuerySchema,
  resolveProjectRoot,
  updateAcpModelProfileBodySchema,
} from './provider-profiles.shared.js';

export const acpModelProfilesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/acp-model-profiles', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = projectQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parsed.error.issues };
    }
    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    const data = await readAcpModelProfiles(projectRoot);
    return {
      projectPath: projectRoot,
      ...data,
    };
  });

  app.post('/api/acp-model-profiles', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = createAcpModelProfileBodySchema.safeParse(request.body);
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
      const profile = await createAcpModelProfile(projectRoot, {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.displayName != null ? { displayName: parsed.data.displayName } : {}),
        provider: parsed.data.provider,
        model: parsed.data.model,
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
        ...(parsed.data.sslVerify !== undefined ? { sslVerify: parsed.data.sslVerify } : {}),
        ...(parsed.data.temperature !== undefined ? { temperature: parsed.data.temperature } : {}),
        ...(parsed.data.topP !== undefined ? { topP: parsed.data.topP } : {}),
        ...(parsed.data.maxTokens !== undefined ? { maxTokens: parsed.data.maxTokens } : {}),
        ...(parsed.data.contextWindow !== undefined ? { contextWindow: parsed.data.contextWindow } : {}),
        ...(parsed.data.connectTimeoutSeconds !== undefined
          ? { connectTimeoutSeconds: parsed.data.connectTimeoutSeconds }
          : {}),
      });
      return { projectPath: projectRoot, profile };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.patch('/api/acp-model-profiles/:profileId', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = updateAcpModelProfileBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid body', details: parsed.error.issues };
    }
    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    const params = request.params as { profileId: string };
    try {
      const profile = await updateAcpModelProfile(projectRoot, params.profileId, {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.displayName != null ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.provider != null ? { provider: parsed.data.provider } : {}),
        ...(parsed.data.model != null ? { model: parsed.data.model } : {}),
        ...(parsed.data.baseUrl != null ? { baseUrl: parsed.data.baseUrl } : {}),
        ...(parsed.data.apiKey != null ? { apiKey: parsed.data.apiKey } : {}),
        ...(parsed.data.sslVerify !== undefined ? { sslVerify: parsed.data.sslVerify } : {}),
        ...(parsed.data.temperature !== undefined ? { temperature: parsed.data.temperature } : {}),
        ...(parsed.data.topP !== undefined ? { topP: parsed.data.topP } : {}),
        ...(parsed.data.maxTokens !== undefined ? { maxTokens: parsed.data.maxTokens } : {}),
        ...(parsed.data.contextWindow !== undefined ? { contextWindow: parsed.data.contextWindow } : {}),
        ...(parsed.data.connectTimeoutSeconds !== undefined
          ? { connectTimeoutSeconds: parsed.data.connectTimeoutSeconds }
          : {}),
      });
      return { projectPath: projectRoot, profile };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.delete('/api/acp-model-profiles/:profileId', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = projectQueryBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid body', details: parsed.error.issues };
    }
    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    const params = request.params as { profileId: string };
    try {
      const existing = await getAcpModelProfile(projectRoot, params.profileId);
      if (!existing) {
        reply.status(404);
        return { error: 'Profile not found' };
      }
      await deleteAcpModelProfile(projectRoot, params.profileId);
      return { ok: true };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
};
