/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authorization Management Routes — 用户审批 + 规则管理 + 审计查询
 * 安全: X-Office-Claw-User header
 */

import type { IApprovalRecordStore } from '@openjiuwen/relay-api-server-contracts/storage';
import type { AgentId } from '@openjiuwen/relay-shared';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AuthorizationManager } from '../domains/agents/services/auth/AuthorizationManager.js';
import {
  getJiuwenPermissionBridge,
  type JiuwenPermissionBridge,
} from '../domains/agents/services/auth/JiuwenPermissionBridge.js';
import type { IAuthorizationAuditStore } from '../domains/agents/services/stores/ports/AuthorizationAuditStore.js';
import type { IAuthorizationRuleStore } from '../domains/agents/services/stores/ports/AuthorizationRuleStore.js';
import { userVisibleFields } from '../infrastructure/logger.js';
import type { SocketManager } from '../infrastructure/websocket/index.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';

export interface AuthorizationRoutesOptions {
  authManager: AuthorizationManager;
  ruleStore: IAuthorizationRuleStore;
  auditStore: IAuthorizationAuditStore;
  socketManager: SocketManager;
  approvalRecordStore?: IApprovalRecordStore;
  jiuwenPermissionBridge?: JiuwenPermissionBridge;
}

const respondSchema = z.object({
  requestId: z.string().min(1),
  granted: z.boolean(),
  scope: z.enum(['once', 'thread', 'global']),
  reason: z.string().max(1000).optional(),
});

const addRuleSchema = z.object({
  agentId: z.string().min(1),
  action: z.string().min(1).max(200),
  scope: z.enum(['thread', 'global']),
  decision: z.enum(['allow', 'deny']),
  threadId: z.string().optional(),
  reason: z.string().max(1000).optional(),
});

const recordsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  threadQuery: z.string().optional(),
  includeRuleMatched: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const recordsSettingsSchema = z.object({
  autoCleanupEnabled: z.boolean(),
});

export const authorizationRoutes: FastifyPluginAsync<AuthorizationRoutesOptions> = async (app, opts) => {
  const { authManager, ruleStore, auditStore, socketManager } = opts;
  const approvalRecordStore = opts.approvalRecordStore;
  const jiuwenPermissionBridge = opts.jiuwenPermissionBridge ?? getJiuwenPermissionBridge();

  function requireApprovalRecordStore(reply: FastifyReply): IApprovalRecordStore | null {
    if (approvalRecordStore) return approvalRecordStore;
    reply.status(503);
    return null;
  }

  // POST /api/authorization/respond — 用户审批
  app.post('/api/authorization/respond', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const parseResult = respondSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { requestId, granted, scope, reason } = parseResult.data;
    const updated = await authManager.respond(requestId, granted, scope, userId, reason);
    if (!updated) {
      reply.status(404);
      return { error: 'Request not found or already resolved' };
    }
    request.log.info(
      userVisibleFields('critical', {
        requestId,
        granted,
        scope,
        threadId: updated.threadId,
        agentId: updated.agentId,
      }),
      '[Authorization] user responded to permission request',
    );

    // Broadcast resolution to frontend
    socketManager.broadcastToRoom(`thread:${updated.threadId}`, 'authorization:response', {
      requestId,
      status: updated.status,
      scope,
      ...(reason ? { reason } : {}),
    });

    queueMicrotask(() => {
      let resumeStarted = false;
      jiuwenPermissionBridge
        .submitAuthorizationDecision({
          localRequestId: requestId,
          granted,
          scope,
          reason,
          onMessage: async (message) => {
            if (!resumeStarted && message.type !== 'done') {
              resumeStarted = true;
              socketManager.broadcastToRoom(`thread:${updated.threadId}`, 'intent_mode', {
                threadId: updated.threadId,
                mode: 'execute',
                targetAgents: [updated.agentId],
                invocationId: updated.invocationId,
              });
            }
            socketManager.broadcastAgentMessage(
              {
                ...message,
                invocationId: updated.invocationId,
              },
              updated.threadId,
            );
          },
        })
        .catch((error) => {
          request.log.warn(
            { err: error, requestId, threadId: updated.threadId },
            'failed to bridge authorization response back to Jiuwen',
          );
        });
    });

    return { status: 'ok', record: updated };
  });

  // GET /api/authorization/pending — 待审批列表
  app.get('/api/authorization/pending', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const threadId = (request.query as Record<string, string>).threadId;
    const pending = await authManager.getPending(threadId);
    return { pending };
  });

  // GET /api/authorization/records — 安全审批记录
  app.get('/api/authorization/records', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const store = requireApprovalRecordStore(reply);
    if (!store) {
      return { error: 'Approval record store unavailable' };
    }

    const parseResult = recordsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parseResult.error.issues };
    }

    try {
      return store.list(parseResult.data);
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : 'Failed to list approval records' };
    }
  });

  // GET /api/authorization/records/settings — 审批记录保留设置
  app.get('/api/authorization/records/settings', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const store = requireApprovalRecordStore(reply);
    if (!store) {
      return { error: 'Approval record store unavailable' };
    }

    return store.getSettings();
  });

  // PUT /api/authorization/records/settings — 更新审批记录自动清理开关
  app.put('/api/authorization/records/settings', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const store = requireApprovalRecordStore(reply);
    if (!store) {
      return { error: 'Approval record store unavailable' };
    }

    const parseResult = recordsSettingsSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    return store.updateSettings(parseResult.data);
  });

  // GET /api/authorization/rules — 规则列表
  app.get('/api/authorization/rules', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const query = request.query as Record<string, string>;
    const rules = await ruleStore.list({
      ...(query.agentId ? { agentId: query.agentId as AgentId } : {}),
      ...(query.threadId ? { threadId: query.threadId } : {}),
    });
    return { rules };
  });

  // POST /api/authorization/rules — 手动添加规则
  app.post('/api/authorization/rules', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const parseResult = addRuleSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { agentId, action, scope, decision, threadId, reason } = parseResult.data;
    const rule = await ruleStore.add({
      agentId: agentId as AgentId,
      action,
      scope,
      decision,
      ...(scope === 'thread' && threadId ? { threadId } : {}),
      createdBy: userId,
      ...(reason ? { reason } : {}),
    });

    return { status: 'ok', rule };
  });

  // DELETE /api/authorization/rules/:id — 删除规则
  app.delete('/api/authorization/rules/:id', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const { id } = request.params as { id: string };
    const removed = await ruleStore.remove(id);
    if (!removed) {
      reply.status(404);
      return { error: 'Rule not found' };
    }

    return { status: 'ok' };
  });

  // GET /api/authorization/audit — 审计日志
  app.get('/api/authorization/audit', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const query = request.query as Record<string, string>;
    const entries = await auditStore.list({
      ...(query.agentId ? { agentId: query.agentId as AgentId } : {}),
      ...(query.threadId ? { threadId: query.threadId } : {}),
      ...(query.limit ? { limit: parseInt(query.limit, 10) } : {}),
    });
    return { entries };
  });
};
