/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F33 Phase 3: Session Strategy Configuration Routes
 *
 * GET    /api/config/session-strategy           — all variant agents' effective strategy + source
 * PATCH  /api/config/session-strategy/:agentId    — set runtime override (Redis-backed)
 * DELETE /api/config/session-strategy/:agentId    — remove runtime override (fall back to lower sources)
 */

import type { SessionStrategyConfig } from '@openjiuwen/relay-shared';
import { officeClawRegistry } from '@openjiuwen/relay-shared';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { isSessionChainEnabled, sessionStrategySchema } from '../config/office-claw-config-loader.js';
import { getSessionStrategyWithSource } from '../config/session-strategy.js';
import {
  deleteRuntimeOverride,
  getAllRuntimeOverrides,
  setRuntimeOverride,
} from '../config/session-strategy-overrides.js';

/** Providers that support compression event signaling (PreCompact hook) */
const HOOK_CAPABLE_PROVIDERS = new Set(['anthropic']);

function resolveOperator(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  if (Array.isArray(raw)) {
    const first = raw.find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof first === 'string') return first.trim();
  }
  return null;
}

export async function sessionStrategyConfigRoutes(app: FastifyInstance, _opts: FastifyPluginOptions): Promise<void> {
  /**
   * GET /api/config/session-strategy
   * Returns every registered variant agent's effective strategy, source, and override status.
   */
  app.get('/api/config/session-strategy', async () => {
    const allOverrides = getAllRuntimeOverrides();
    const agents = [];

    for (const id of officeClawRegistry.getAllIds()) {
      const agentId = id as string;
      const entry = officeClawRegistry.tryGet(agentId);
      if (!entry) continue;

      const { effective, source } = getSessionStrategyWithSource(agentId);
      const override = allOverrides.get(agentId);

      agents.push({
        agentId,
        displayName: entry.config.displayName,
        provider: entry.config.provider,
        breedId: entry.config.breedId,
        effective,
        source,
        hasOverride: override != null,
        override: override ?? null,
        hybridCapable: HOOK_CAPABLE_PROVIDERS.has(entry.config.provider),
        sessionChainEnabled: isSessionChainEnabled(agentId),
      });
    }

    return { agents };
  });

  /**
   * PATCH /api/config/session-strategy/:agentId
   * Set or update a runtime strategy override for a specific variant agent.
   * The override is deep-merged with the base strategy at read time.
   */
  app.patch<{ Params: { agentId: string } }>('/api/config/session-strategy/:agentId', async (request, reply) => {
    const operator = resolveOperator((request.headers['x-office-claw-user'] ?? request.headers['x-office-claw-user']));
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const { agentId } = request.params;

    // Verify agent exists in registry
    const entry = officeClawRegistry.tryGet(agentId);
    if (!entry) {
      reply.status(404);
      return { error: `Unknown agent ID: "${agentId}"` };
    }

    // Validate the override payload with the shared Zod schema
    const parseResult = sessionStrategySchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid strategy config', details: parseResult.error.issues };
    }

    const override = parseResult.data;
    if (!override || Object.keys(override).length === 0) {
      reply.status(400);
      return { error: 'Empty override — use DELETE to remove an override' };
    }

    // Guard: hybrid requires hook-capable provider
    if (override.strategy === 'hybrid' && !HOOK_CAPABLE_PROVIDERS.has(entry.config.provider)) {
      reply.status(422);
      return {
        error:
          `hybrid strategy requires a hook-capable provider (${[...HOOK_CAPABLE_PROVIDERS].join(', ')}), ` +
          `but "${agentId}" uses provider "${entry.config.provider}"`,
      };
    }

    // Zod .optional() produces `T | undefined` for nested props; our type uses optional-only.
    // Shapes are equivalent at runtime after validation.
    await setRuntimeOverride(agentId, override as unknown as Partial<SessionStrategyConfig>);
    request.log.info({ operator, agentId, override }, 'session strategy override set');

    // Return the new effective config after applying the override
    const { effective, source } = getSessionStrategyWithSource(agentId);
    return {
      agentId,
      effective,
      source,
      override,
    };
  });

  /**
   * DELETE /api/config/session-strategy/:agentId
   * Remove a runtime override for a variant agent — it falls back to lower-priority sources.
   */
  app.delete<{ Params: { agentId: string } }>('/api/config/session-strategy/:agentId', async (request, reply) => {
    const operator = resolveOperator((request.headers['x-office-claw-user'] ?? request.headers['x-office-claw-user']));
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const { agentId } = request.params;

    // Verify agent exists in registry
    if (!officeClawRegistry.tryGet(agentId)) {
      reply.status(404);
      return { error: `Unknown agent ID: "${agentId}"` };
    }

    const existed = await deleteRuntimeOverride(agentId);
    request.log.info({ operator, agentId, deleted: existed }, 'session strategy override delete');
    if (!existed) {
      reply.status(404);
      return { error: `No runtime override exists for "${agentId}"` };
    }

    // Return the new effective config after removing the override
    const { effective, source } = getSessionStrategyWithSource(agentId);
    return { agentId, effective, source, deleted: true };
  });
}
