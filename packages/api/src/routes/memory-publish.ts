/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Memory Publish Route
 * POST /api/memory/publish — transition memory governance state
 *
 * Phase 5.0 Step 2a: 发布门禁
 */

import { agentIdSchema } from '@openjiuwen/relay-shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AuditEventTypes, getEventAuditLog } from '../domains/agents/services/orchestration/EventAuditLog.js';
import type { IMemoryGovernanceStore } from '../domains/agents/services/stores/ports/MemoryGovernanceStore.js';
import { GovernanceConflictError } from '../domains/agents/services/stores/ports/MemoryGovernanceStore.js';

export interface MemoryPublishRoutesOptions {
  governanceStore: IMemoryGovernanceStore;
}

const publishSchema = z.object({
  entryId: z.string().min(1),
  action: z.enum(['submit_review', 'approve', 'archive', 'rollback']),
  actor: z.union([z.literal('user'), agentIdSchema()]),
});

/** Map publish action → audit event type */
const ACTION_TO_AUDIT: Record<string, string> = {
  submit_review: AuditEventTypes.MEMORY_PUBLISH_SUBMITTED,
  approve: AuditEventTypes.MEMORY_PUBLISH_APPROVED,
  archive: AuditEventTypes.MEMORY_PUBLISH_ARCHIVED,
  rollback: AuditEventTypes.MEMORY_PUBLISH_ROLLBACK,
};

export const memoryPublishRoutes: FastifyPluginAsync<MemoryPublishRoutesOptions> = async (app, opts) => {
  app.post('/api/memory/publish', async (request, reply) => {
    const parseResult = publishSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { entryId, action, actor } = parseResult.data;

    try {
      let before = opts.governanceStore.get(entryId);

      // Only submit_review can auto-create a draft.
      // Other actions on missing entries → 404 (not 409).
      if (!before) {
        if (action !== 'submit_review') {
          reply.status(404);
          return { error: `Entry ${entryId} not found`, action };
        }
        before = opts.governanceStore.create(entryId, actor);
      }

      const previousStatus = before.status;
      const after = opts.governanceStore.transition(entryId, action, actor);

      // Write audit log (best-effort)
      let auditId: string | undefined;
      try {
        const auditType = ACTION_TO_AUDIT[action] ?? `memory_publish_${action}`;
        const event = await getEventAuditLog().append({
          type: auditType,
          data: { entryId, previousStatus, currentStatus: after.status, actor },
        });
        auditId = event.id;
      } catch {
        // Audit failure should not block the transition
      }

      return {
        entryId,
        previousStatus,
        currentStatus: after.status,
        ...(auditId ? { auditId } : {}),
      };
    } catch (err) {
      if (err instanceof GovernanceConflictError) {
        reply.status(409);
        return {
          error: err.message,
          currentStatus: err.currentStatus,
          action: err.action,
        };
      }
      throw err;
    }
  });
};
