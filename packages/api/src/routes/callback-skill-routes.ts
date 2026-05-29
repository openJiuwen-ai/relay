/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import { createSkillCatalogService } from '../domains/agents/services/skillhub/SkillCatalogService.js';
import { callbackAuthSchema } from './callback-auth-schema.js';
import { EXPIRED_CREDENTIALS_ERROR } from './callback-errors.js';

interface CallbackSkillRoutesDeps {
  registry: InvocationRegistry;
}

const listSkillsQuerySchema = callbackAuthSchema.extend({
  query: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const loadSkillQuerySchema = callbackAuthSchema.extend({
  name: z.string().trim().min(1).max(200),
});

export async function registerCallbackSkillRoutes(
  app: FastifyInstance,
  deps: CallbackSkillRoutesDeps,
): Promise<void> {
  const { registry } = deps;
  const catalog = createSkillCatalogService();

  app.get('/api/callbacks/skills/list', async (request, reply) => {
    const parsed = listSkillsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query parameters', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, query, limit } = parsed.data;
    if (!registry.verify(invocationId, callbackToken)) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    return catalog.listSkills({ query, limit });
  });

  app.get('/api/callbacks/skills/load', async (request, reply) => {
    const parsed = loadSkillQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query parameters', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, name } = parsed.data;
    if (!registry.verify(invocationId, callbackToken)) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const skill = await catalog.loadSkill(name);
    if (!skill) {
      reply.status(404);
      return { error: `Skill not found: ${name}` };
    }

    return skill;
  });
}
