/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { IBacklogStore } from '../domains/agents/services/stores/ports/BacklogStore.js';
import type { IWorkflowSopStore } from '../domains/agents/services/stores/ports/WorkflowSopStore.js';
import { VersionConflictError } from '../domains/agents/services/stores/ports/WorkflowSopStore.js';
import { callbackAuthSchema } from './callback-auth-schema.js';
import { EXPIRED_CREDENTIALS_ERROR } from './callback-errors.js';

const updateWorkflowSopCallbackSchema = callbackAuthSchema.extend({
  backlogItemId: z.string().min(1),
  featureId: z.string().min(1),
  stage: z.enum(['kickoff', 'impl', 'quality_gate', 'review', 'merge', 'completion']).optional(),
  batonHolder: z.string().min(1).optional(),
  nextSkill: z.string().nullable().optional(),
  resumeCapsule: z
    .object({
      goal: z.string().optional(),
      done: z.array(z.string()).optional(),
      currentFocus: z.string().optional(),
    })
    .optional(),
  checks: z
    .object({
      remoteMainSynced: z.enum(['attested', 'verified', 'unknown']).optional(),
      qualityGatePassed: z.enum(['attested', 'verified', 'unknown']).optional(),
      reviewApproved: z.enum(['attested', 'verified', 'unknown']).optional(),
      visionGuardDone: z.enum(['attested', 'verified', 'unknown']).optional(),
    })
    .optional(),
  expectedVersion: z.number().int().optional(),
});

export function registerCallbackWorkflowSopRoutes(
  app: FastifyInstance,
  deps: {
    registry: InvocationRegistry;
    workflowSopStore: IWorkflowSopStore;
    backlogStore: IBacklogStore;
  },
): void {
  const { registry, workflowSopStore, backlogStore } = deps;

  app.post('/api/callbacks/update-workflow-sop', async (request, reply) => {
    const parsed = updateWorkflowSopCallbackSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, backlogItemId, featureId, ...rest } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    // Verify backlog item exists and belongs to this user (P1-2: user scope)
    const item = await backlogStore.get(backlogItemId, record.userId);
    if (!item) {
      reply.status(404);
      return { error: 'Backlog item not found' };
    }

    // Extract updatedBy from invocation context (agent's unique handle)
    const updatedBy = record.agentId ?? 'unknown';

    try {
      const input = {
        ...(rest.stage !== undefined ? { stage: rest.stage } : {}),
        ...(rest.batonHolder !== undefined ? { batonHolder: rest.batonHolder } : {}),
        ...(rest.nextSkill !== undefined ? { nextSkill: rest.nextSkill } : {}),
        ...(rest.resumeCapsule !== undefined ? { resumeCapsule: rest.resumeCapsule } : {}),
        ...(rest.checks !== undefined ? { checks: rest.checks } : {}),
        ...(rest.expectedVersion !== undefined ? { expectedVersion: rest.expectedVersion } : {}),
      } as import('@openjiuwen/relay-shared').UpdateWorkflowSopInput;

      const sop = await workflowSopStore.upsert(backlogItemId, featureId, input, updatedBy);
      return sop;
    } catch (err) {
      if (err instanceof VersionConflictError) {
        reply.status(409);
        return { error: 'Version conflict', currentState: err.currentState };
      }
      throw err;
    }
  });
}
