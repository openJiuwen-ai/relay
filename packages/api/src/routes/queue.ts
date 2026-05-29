/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Queue Management API Routes (F39)
 *
 * GET    /api/threads/:threadId/queue               → 列出队列条目
 * DELETE /api/threads/:threadId/queue/:entryId       → 撤回条目
 * POST   /api/threads/:threadId/queue/next          → 手动触发处理下一条
 * POST   /api/threads/:threadId/queue/:entryId/steer → Steer queued entry（立即执行/提到队首）
 * PATCH  /api/threads/:threadId/queue/:entryId/move → 重排序（上移/下移）
 * DELETE /api/threads/:threadId/queue               → 清空队列
 * POST   /api/threads/:threadId/cancel/:agentId       → F122B AC-B9: Per-agent cancel
 */

import { createAgentId, type AgentId } from '@openjiuwen/relay-shared';
import type { SessionStore } from '@openjiuwen/relay-shared/utils';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { InvocationQueue } from '../domains/agents/services/agents/invocation/InvocationQueue.js';
import type { QueueProcessor } from '../domains/agents/services/agents/invocation/QueueProcessor.js';
import type { TaskProgressStore } from '../domains/agents/services/agents/invocation/TaskProgressStore.js';
import type { ISessionSealer } from '../domains/agents/services/session/SessionSealer.js';
import { SessionManager } from '../domains/agents/services/session/SessionManager.js';
import type { ISessionChainStore } from '../domains/agents/services/stores/ports/SessionChainStore.js';
import type { IMessageStore } from '../domains/agents/services/stores/ports/MessageStore.js';
import type { IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import { buildCancelMessages, type SocketManager } from '../infrastructure/websocket/index.js';
import { resolveUserId } from '../utils/request-identity.js';
import { getMultiMentionOrchestrator } from './callback-multi-mention-routes.js';

interface InvocationTrackerLike {
  has(threadId: string, agentId?: string): boolean;
  getUserId(threadId: string, agentId: string): string | null;
  cancel(
    threadId: string,
    agentId: string,
    requestUserId?: string,
    abortReason?: string,
  ): { cancelled: boolean; agentIds: string[] };
  /** Issue #83: Get all active agentIds for a thread (F5 refresh recovery) */
  getActiveSlots(threadId: string): string[];
}

export interface QueueRoutesOptions {
  threadStore: IThreadStore;
  invocationQueue: InvocationQueue;
  queueProcessor: QueueProcessor;
  invocationTracker: InvocationTrackerLike;
  socketManager: SocketManager;
  sessionStore?: SessionStore;
  sessionChainStore?: ISessionChainStore;
  sessionSealer?: ISessionSealer;
  taskProgressStore?: TaskProgressStore;
  /** F117: MessageStore for marking queued messages as canceled on withdraw/clear */
  messageStore?: IMessageStore;
}

const moveBodySchema = z.object({
  direction: z.enum(['up', 'down']),
});

const steerBodySchema = z.object({
  mode: z.enum(['promote', 'immediate']),
});

/**
 * Auth + ownership guard.
 * Returns { userId, thread } or sends error reply and returns null.
 */
async function guardThreadOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
  threadStore: IThreadStore,
  threadId: string,
): Promise<{ userId: string } | null> {
  const userId = resolveUserId(request, {});
  if (!userId) {
    reply.status(401);
    reply.send({ error: 'Identity required', code: 'AUTH_REQUIRED' });
    return null;
  }

  const thread = await threadStore.get(threadId);
  if (!thread) {
    reply.status(404);
    reply.send({ error: '对话不存在', code: 'THREAD_NOT_FOUND' });
    return null;
  }

  // Default thread (createdBy='system') is public — any authenticated user can access
  if (thread.createdBy !== 'system' && thread.createdBy !== userId) {
    reply.status(403);
    reply.send({ error: '无权访问此对话的队列', code: 'FORBIDDEN' });
    return null;
  }

  return { userId };
}

export const queueRoutes: FastifyPluginAsync<QueueRoutesOptions> = async (app, opts) => {
  const {
    threadStore,
    invocationQueue,
    queueProcessor,
    invocationTracker,
    socketManager,
    messageStore,
    sessionStore,
    sessionChainStore,
    sessionSealer,
    taskProgressStore,
  } = opts;
  const sessionManager = new SessionManager(sessionStore);

  // GET /api/threads/:threadId/queue
  app.get<{ Params: { threadId: string } }>('/api/threads/:threadId/queue', async (request, reply) => {
    const { threadId } = request.params;
    const guard = await guardThreadOwnership(request, reply, threadStore, threadId);
    if (!guard) return;

    return {
      queue: invocationQueue.list(threadId, guard.userId),
      paused: queueProcessor.isPaused(threadId),
      pauseReason: queueProcessor.getPauseReason(threadId),
      // Issue #83: Expose active invocation slots for F5 refresh recovery.
      // Frontend can use this to restore processing state even when drafts expire.
      activeInvocations: invocationTracker.getActiveSlots(threadId),
    };
  });

  // DELETE /api/threads/:threadId/queue/:entryId
  app.delete<{ Params: { threadId: string; entryId: string }; Querystring: { deleteMessage?: string } }>(
    '/api/threads/:threadId/queue/:entryId',
    async (request, reply) => {
      const { threadId, entryId } = request.params;
      const guard = await guardThreadOwnership(request, reply, threadStore, threadId);
      if (!guard) return;

      // Check if entry exists and is not processing
      const entries = invocationQueue.list(threadId, guard.userId);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) {
        reply.status(404);
        return { error: '队列条目不存在', code: 'ENTRY_NOT_FOUND' };
      }
      if (entry.status === 'processing') {
        reply.status(409);
        return { error: '条目正在处理中，无法撤回', code: 'ENTRY_PROCESSING' };
      }

      // F117: Collect message IDs before removing (entry contains messageId + mergedMessageIds)
      const messageIds = [entry.messageId, ...(entry.mergedMessageIds ?? [])].filter(Boolean) as string[];

      const removed = invocationQueue.remove(threadId, guard.userId, entryId);
      // F122B B6 P2: Clean up completion hook to prevent leak when entry removed before execution
      queueProcessor.unregisterEntryCompleteHook?.(entryId);

      // F117: Mark queued messages as canceled + emit message_deleted
      if (messageStore) {
        for (const msgId of messageIds) {
          try {
            await messageStore.markCanceled(msgId);
            socketManager.emitToUser(guard.userId, 'message_deleted', {
              messageId: msgId,
              threadId,
              deletedBy: guard.userId,
            });
          } catch (error) {
            request.log.warn(
              { threadId, entryId, messageId: msgId, error },
              '[queue] markCanceled failed for removed queue entry; continuing',
            );
          }
        }
      }

      socketManager.emitToUser(guard.userId, 'queue_updated', {
        threadId,
        queue: invocationQueue.list(threadId, guard.userId),
        action: 'removed',
      });

      return { removed };
    },
  );

  // POST /api/threads/:threadId/queue/next
  app.post<{ Params: { threadId: string } }>('/api/threads/:threadId/queue/next', async (request, reply) => {
    const { threadId } = request.params;
    const guard = await guardThreadOwnership(request, reply, threadStore, threadId);
    if (!guard) return;

    const result = await queueProcessor.processNext(threadId, guard.userId);
    return result;
  });

  // POST /api/threads/:threadId/queue/:entryId/steer
  app.post<{ Params: { threadId: string; entryId: string } }>(
    '/api/threads/:threadId/queue/:entryId/steer',
    async (request, reply) => {
      const { threadId, entryId } = request.params;
      const guard = await guardThreadOwnership(request, reply, threadStore, threadId);
      if (!guard) return;

      const parseResult = steerBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return { error: 'Invalid body', details: parseResult.error.issues };
      }

      const entries = invocationQueue.list(threadId, guard.userId);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) {
        reply.status(404);
        return { error: '队列条目不存在', code: 'ENTRY_NOT_FOUND' };
      }
      if (entry.status === 'processing') {
        reply.status(409);
        return { error: '条目正在处理中，无法 steer', code: 'ENTRY_PROCESSING' };
      }

      const { mode } = parseResult.data;
      if (mode === 'promote') {
        invocationQueue.promote(threadId, guard.userId, entryId);
        socketManager.emitToUser(guard.userId, 'queue_updated', {
          threadId,
          queue: invocationQueue.list(threadId, guard.userId),
          action: 'steer_promote',
        });
        return { ok: true };
      }

      // mode === 'immediate'
      const steerAgentId = entry.targetAgents[0] ?? 'unknown';
      if (invocationTracker.has(threadId, steerAgentId)) {
        const activeUserId = invocationTracker.getUserId(threadId, steerAgentId);
        if (activeUserId && activeUserId !== guard.userId) {
          reply.status(409);
          return { error: '当前有其他用户的调用在执行，无法立即执行', code: 'INVOCATION_ACTIVE' };
        }
        const cancelResult = invocationTracker.cancel(threadId, steerAgentId, guard.userId, 'preempted');
        // Broadcast cancel+done so frontend clears old invocation's "正在回复中" state.
        // Without this, activeInvocations retains the old invocationId permanently.
        // Scope to steerAgentId only — cancelResult.agentIds may include co-dispatched cats
        // whose separate invocations should not be terminated.
        if (cancelResult.cancelled) {
          const scopedResult = { ...cancelResult, agentIds: [steerAgentId] };
          for (const m of buildCancelMessages(scopedResult)) {
            socketManager.broadcastAgentMessage(m, threadId);
          }
        }
        // F108 P1-4 fix: abort only the target agent's dispatches, not the entire thread
        getMultiMentionOrchestrator().abortBySlot(threadId, steerAgentId as AgentId);
        if (!cancelResult.cancelled && invocationTracker.has(threadId, steerAgentId)) {
          reply.status(409);
          return { error: '当前调用无法取消，无法立即执行', code: 'INVOCATION_CANCEL_FAILED' };
        }
        queueProcessor.clearPause(threadId, steerAgentId);
        queueProcessor.releaseSlot(threadId, steerAgentId);
      }

      invocationQueue.promote(threadId, guard.userId, entryId);
      socketManager.emitToUser(guard.userId, 'queue_updated', {
        threadId,
        queue: invocationQueue.list(threadId, guard.userId),
        action: 'steer_immediate',
      });

      const result = await queueProcessor.processNext(threadId, guard.userId);
      if (!result.started) {
        reply.status(409);
        return { error: '队列繁忙，暂无法立即执行', code: 'QUEUE_BUSY' };
      }

      return result;
    },
  );

  // PATCH /api/threads/:threadId/queue/:entryId/move
  app.patch<{ Params: { threadId: string; entryId: string } }>(
    '/api/threads/:threadId/queue/:entryId/move',
    async (request, reply) => {
      const { threadId, entryId } = request.params;
      const guard = await guardThreadOwnership(request, reply, threadStore, threadId);
      if (!guard) return;

      const parseResult = moveBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return { error: 'Invalid body', details: parseResult.error.issues };
      }

      // Check if entry is processing
      const entries = invocationQueue.list(threadId, guard.userId);
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) {
        reply.status(404);
        return { error: '队列条目不存在', code: 'ENTRY_NOT_FOUND' };
      }
      if (entry.status === 'processing') {
        reply.status(409);
        return { error: '正在处理中的条目不可移动', code: 'ENTRY_PROCESSING' };
      }

      invocationQueue.move(threadId, guard.userId, entryId, parseResult.data.direction);
      socketManager.emitToUser(guard.userId, 'queue_updated', {
        threadId,
        queue: invocationQueue.list(threadId, guard.userId),
        action: 'reordered',
      });

      return { ok: true };
    },
  );

  // DELETE /api/threads/:threadId/queue
  app.delete<{ Params: { threadId: string } }>('/api/threads/:threadId/queue', async (request, reply) => {
    const { threadId } = request.params;
    const guard = await guardThreadOwnership(request, reply, threadStore, threadId);
    if (!guard) return;

    // F117: Collect message IDs from non-processing entries for cancelation
    // Skip 'processing' entries — their invocation is already running and will markDelivered itself
    const entriesBeforeClear = invocationQueue.list(threadId, guard.userId);
    const allMessageIds: string[] = [];
    for (const e of entriesBeforeClear) {
      if (e.status === 'processing') continue;
      queueProcessor.unregisterEntryCompleteHook?.(e.id);
      if (e.messageId) allMessageIds.push(e.messageId);
      if (e.mergedMessageIds) allMessageIds.push(...e.mergedMessageIds);
    }

    const cleared = invocationQueue.clearQueued(threadId, guard.userId);

    // F117: Mark all queued messages as canceled + emit message_deleted
    if (messageStore) {
      for (const msgId of allMessageIds) {
        try {
          await messageStore.markCanceled(msgId);
          socketManager.emitToUser(guard.userId, 'message_deleted', {
            messageId: msgId,
            threadId,
            deletedBy: guard.userId,
          });
        } catch (error) {
          request.log.warn(
            { threadId, messageId: msgId, error },
            '[queue] markCanceled failed during clear; continuing',
          );
        }
      }
    }

    socketManager.emitToUser(guard.userId, 'queue_updated', {
      threadId,
      queue: invocationQueue.list(threadId, guard.userId),
      action: 'cleared',
    });

    return { cleared };
  });

  // POST /api/threads/:threadId/cancel/:agentId — F122B AC-B9: Per-agent cancel
  app.post<{ Params: { threadId: string; agentId: string } }>(
    '/api/threads/:threadId/cancel/:agentId',
    async (request, reply) => {
      const { threadId, agentId } = request.params;
      const guard = await guardThreadOwnership(request, reply, threadStore, threadId);
      if (!guard) return;

      if (!invocationTracker.has(threadId, agentId)) {
        const taskSnapshot = taskProgressStore ? await taskProgressStore.getSnapshot(threadId, agentId as AgentId) : null;
        if (taskSnapshot?.status !== 'interrupted' || taskSnapshot.interruptReason !== 'recoverable_pause') {
          reply.status(404);
          return { error: '该智能体当前未在执行', code: 'AGENT_NOT_ACTIVE' };
        }

        await sessionManager.delete(guard.userId, agentId as AgentId, threadId).catch(() => {});
        if (sessionChainStore && sessionSealer) {
          try {
            const activeSession = await sessionChainStore.getActive(agentId as AgentId, threadId);
            if (activeSession) {
              const sealResult = await sessionSealer.requestSeal({
                sessionId: activeSession.id,
                reason: 'interrupted_run_abandoned',
              });
              if (sealResult.accepted) {
                await sessionSealer.finalize({ sessionId: activeSession.id });
              }
            }
          } catch {
            // Best-effort: dropping the bound ACP session is enough to force session/new next turn.
          }
        }
        if (taskProgressStore) {
          await taskProgressStore.setSnapshot({
            ...taskSnapshot,
            updatedAt: Date.now(),
            interruptReason: 'canceled',
          });
        }
        socketManager.broadcastAgentMessage(
          {
            type: 'system_info',
            agentId: createAgentId(agentId),
            content: '⏹ 已放弃上次中断运行，下次调用将新建会话',
            timestamp: Date.now(),
          },
          threadId,
        );
        return { ok: true, cancelled: true, mode: 'drop_interrupted_session' };
      }

      const cancelResult = invocationTracker.cancel(threadId, agentId, guard.userId, 'user_stop');
      if (cancelResult.cancelled) {
        const scopedResult = { ...cancelResult, agentIds: [agentId] };
        for (const m of buildCancelMessages(scopedResult)) {
          socketManager.broadcastAgentMessage(m, threadId);
        }
        queueProcessor.clearPause(threadId, agentId);
        queueProcessor.releaseSlot(threadId, agentId);
      }

      return { ok: true, cancelled: cancelResult.cancelled };
    },
  );
};
