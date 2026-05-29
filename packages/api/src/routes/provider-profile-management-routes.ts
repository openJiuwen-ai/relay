/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import {
  type ACPModelAccessMode,
  activateProviderProfile,
  createProviderProfile,
  deleteProviderProfile,
  type ProviderProfileAuthType,
  type ProviderProfileKind,
  type ProviderProfileMode,
  type ProviderProfileProvider,
  readProviderProfiles,
  updateProviderProfile,
} from '../config/provider-profiles.js';
import {
  filterBootstrapBindingsForAllowedClients,
  filterProviderProfilesForVisibility,
  getClientLabels,
  getVisibleBuiltinAuthClients,
} from '../utils/client-visibility.js';
import { resolveUserId } from '../utils/request-identity.js';
import {
  activateBodySchema,
  createBodySchema,
  projectQuerySchema,
  resolveProjectRoot,
  type ProviderProfilesRoutesOptions,
  updateBodySchema,
} from './provider-profiles.shared.js';

function resolveProviderSelector(selector: string | undefined, fallback: string): ProviderProfileProvider {
  return (selector?.trim() || fallback) as ProviderProfileProvider;
}

export const providerProfileManagementRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app) => {
  app.get('/api/provider-profiles', async (request, reply) => {
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

    const data = await readProviderProfiles(projectRoot);
    return {
      projectPath: projectRoot,
      ...data,
      providers: filterProviderProfilesForVisibility(data.providers),
      bootstrapBindings: filterBootstrapBindingsForAllowedClients(data.bootstrapBindings),
      visibleBuiltinClients: getVisibleBuiltinAuthClients(),
      clientLabels: getClientLabels(),
    };
  });

  app.post('/api/provider-profiles', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = createBodySchema.safeParse(request.body);
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
      const profile = await createProviderProfile(projectRoot, {
        ...(parsed.data.kind != null ? { kind: parsed.data.kind as ProviderProfileKind } : {}),
        ...(parsed.data.provider != null ? { provider: parsed.data.provider } : {}),
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.displayName != null ? { displayName: parsed.data.displayName } : {}),
        ...(parsed.data.mode != null ? { mode: parsed.data.mode as ProviderProfileMode } : {}),
        ...(parsed.data.authType != null ? { authType: parsed.data.authType as ProviderProfileAuthType } : {}),
        ...(parsed.data.protocol != null ? { protocol: parsed.data.protocol } : {}),
        ...(parsed.data.baseUrl ? { baseUrl: parsed.data.baseUrl } : {}),
        ...(parsed.data.apiKey ? { apiKey: parsed.data.apiKey } : {}),
        ...(parsed.data.models != null ? { models: parsed.data.models } : {}),
        ...(parsed.data.command != null ? { command: parsed.data.command } : {}),
        ...(parsed.data.args != null ? { args: parsed.data.args } : {}),
        ...(parsed.data.cwd != null ? { cwd: parsed.data.cwd } : {}),
        ...(parsed.data.env != null ? { env: parsed.data.env } : {}),
        ...(parsed.data.modelAccessMode != null ? { modelAccessMode: parsed.data.modelAccessMode } : {}),
        ...(parsed.data.defaultModelProfileRef != null ? { defaultModelProfileRef: parsed.data.defaultModelProfileRef } : {}),
        ...(parsed.data.setActive != null ? { setActive: parsed.data.setActive } : {}),
      });
      return { projectPath: projectRoot, profile };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.patch('/api/provider-profiles/:profileId', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = updateBodySchema.safeParse(request.body);
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
      const profile = await updateProviderProfile(
        projectRoot,
        resolveProviderSelector(parsed.data.provider, params.profileId),
        params.profileId,
        {
          ...(parsed.data.kind != null ? { kind: parsed.data.kind as ProviderProfileKind } : {}),
          ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
          ...(parsed.data.displayName != null ? { displayName: parsed.data.displayName } : {}),
          ...(parsed.data.mode != null ? { mode: parsed.data.mode as ProviderProfileMode } : {}),
          ...(parsed.data.authType != null ? { authType: parsed.data.authType as ProviderProfileAuthType } : {}),
          ...(parsed.data.protocol != null ? { protocol: parsed.data.protocol } : {}),
          ...(parsed.data.baseUrl != null ? { baseUrl: parsed.data.baseUrl } : {}),
          ...(parsed.data.apiKey != null ? { apiKey: parsed.data.apiKey } : {}),
          ...(parsed.data.models != null ? { models: parsed.data.models } : {}),
          ...(parsed.data.command != null ? { command: parsed.data.command } : {}),
          ...(parsed.data.args != null ? { args: parsed.data.args } : {}),
          ...(parsed.data.cwd !== undefined ? { cwd: parsed.data.cwd } : {}),
          ...(parsed.data.env !== undefined ? { env: parsed.data.env } : {}),
          ...(parsed.data.modelAccessMode != null
            ? { modelAccessMode: parsed.data.modelAccessMode as ACPModelAccessMode }
            : {}),
          ...(parsed.data.defaultModelProfileRef !== undefined
            ? { defaultModelProfileRef: parsed.data.defaultModelProfileRef }
            : {}),
        },
      );
      return { projectPath: projectRoot, profile };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.delete('/api/provider-profiles/:profileId', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = activateBodySchema.safeParse(request.body ?? {});
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
      await deleteProviderProfile(
        projectRoot,
        resolveProviderSelector(parsed.data.provider, params.profileId),
        params.profileId,
      );
      return { ok: true };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post('/api/provider-profiles/:profileId/activate', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const parsed = activateBodySchema.safeParse(request.body);
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
      await activateProviderProfile(
        projectRoot,
        resolveProviderSelector(parsed.data.provider, params.profileId),
        params.profileId,
      );
      return { ok: true, profileId: params.profileId };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
};
