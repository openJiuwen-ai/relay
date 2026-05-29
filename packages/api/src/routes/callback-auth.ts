/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Callback Authorization Routes — 智能体请求权限 + 查询结果
 * 安全: invocationId + callbackToken 验证 (同 callbacks.ts)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { AuthorizationManager } from '../domains/agents/services/auth/AuthorizationManager.js';
import { EXPIRED_CREDENTIALS_ERROR } from './callback-errors.js';

export interface CallbackAuthRoutesOptions {
  registry: InvocationRegistry;
  authManager: AuthorizationManager;
}

const requestPermissionSchema = z.object({
  invocationId: z.string().min(1),
  callbackToken: z.string().min(1),
  action: z.string().min(1).max(200),
  reason: z.string().min(1).max(2000),
  context: z.string().max(5000).optional(),
});

const permissionStatusSchema = z.object({
  invocationId: z.string().min(1),
  callbackToken: z.string().min(1),
  requestId: z.string().min(1),
});

export const callbackAuthRoutes: FastifyPluginAsync<CallbackAuthRoutesOptions> = async (app, opts) => {
  const { registry, authManager } = opts;

  // POST /api/callbacks/request-permission
  app.post('/api/callbacks/request-permission', async (request, reply) => {
    const parseResult = requestPermissionSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { invocationId, callbackToken, action, reason, context } = parseResult.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const response = await authManager.requestPermission(
      record.agentId,
      record.threadId,
      {
        invocationId,
        action,
        reason,
        ...(context ? { context } : {}),
      },
      record.userId,
    );

    return response;
  });

  // GET /api/callbacks/permission-status
  app.get('/api/callbacks/permission-status', async (request, reply) => {
    const parseResult = permissionStatusSchema.safeParse(request.query);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Missing required query parameters' };
    }

    const { invocationId, callbackToken, requestId } = parseResult.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const status = await authManager.getRequestStatus(requestId);
    if (!status) {
      reply.status(404);
      return { error: 'Permission request not found' };
    }

    // P2 fix: 校验 requestId 严格归属当前 invocation
    if (status.invocationId !== invocationId || status.agentId !== record.agentId || status.threadId !== record.threadId) {
      reply.status(403);
      return { error: 'Permission request belongs to a different invocation' };
    }

    return {
      requestId: status.requestId,
      status: status.status,
      action: status.action,
      createdAt: status.createdAt,
      ...(status.respondReason ? { reason: status.respondReason } : {}),
      ...(status.respondScope ? { scope: status.respondScope } : {}),
      ...(status.respondedAt ? { respondedAt: status.respondedAt } : {}),
    };
  });
};
