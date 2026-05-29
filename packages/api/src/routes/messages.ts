/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Messages API Routes
 * POST /api/messages - 发送消息 (JSON or multipart with images)
 * GET /api/messages - 获取历史消息
 *
 * IMPORTANT: threadId 约束
 * 生产代码应显式包含 threadId（sendMessageSchema 字段 threadId）。
 * 兼容行为：未传 threadId 时会降级到 'default' thread（历史行为）。
 * 跨线程鉴权、InvocationTracker、消息存储都依赖正确的 threadId。
 * 前端应先确保 thread 存在（POST /api/threads）再发消息。
 *
 * ADR-008 S1: 消息写入与猫调用执行解耦。
 * POST 流程: 原子创建 InvocationRecord → 写入用户消息 → 回填 → reply 202 → background 执行
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import multipart from '@fastify/multipart';
import type { StoredMessage } from '@openjiuwen/relay-api-server-contracts/storage';
import type { AgentId, MessageContent } from '@openjiuwen/relay-shared';
import type { SessionStore } from '@openjiuwen/relay-shared/utils';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveFrontendBaseUrl } from '../config/frontend-origin.js';
import { getDefaultAgentId } from '../config/office-claw-config-loader.js';
import type { InvocationQueue } from '../domains/agents/services/agents/invocation/InvocationQueue.js';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { InvocationTracker } from '../domains/agents/services/agents/invocation/InvocationTracker.js';
import type { QueueProcessor } from '../domains/agents/services/agents/invocation/QueueProcessor.js';
import type { PersistenceContext } from '../domains/agents/services/agents/routing/route-helpers.js';
import type { AgentRouter } from '../domains/agents/services/index.js';
import { getPushNotificationService } from '../domains/agents/services/push/PushNotificationService.js';
import type { DeliveryCursorStore } from '../domains/agents/services/stores/ports/DeliveryCursorStore.js';
import type { IDraftStore } from '../domains/agents/services/stores/ports/DraftStore.js';
import type { IInvocationRecordStore } from '../domains/agents/services/stores/ports/InvocationRecordStore.js';
import type { IMessageStore } from '../domains/agents/services/stores/ports/MessageStore.js';
import { type IThreadStore, resolveThreadProjectPath } from '../domains/agents/services/stores/ports/ThreadStore.js';
import { isScheduledTriggerPlaceholder, isSystemUserMessage } from '../domains/agents/services/stores/visibility.js';
import { mergeTokenUsage, type TokenUsage } from '../domains/agents/services/types.js';
import { buildPptModeSystemPrompt, type PptMessageContext } from '../domains/ppt/ppt-context.js';
import type { PptTemplateStore } from '../domains/ppt/templates/PptTemplateStore.js';
import { createModuleLogger, userVisibleFields } from '../infrastructure/logger.js';
import { buildCancelMessages, type SocketManager } from '../infrastructure/websocket/index.js';

/** F088 ISSUE-15: Minimal outbound delivery interface — avoids importing full OutboundDeliveryHook. */
interface OutboundDeliveryHookLike {
  deliver(
    threadId: string,
    content: string,
    agentId?: string,
    richBlocks?: unknown[],
    threadMeta?: { threadShortId: string; threadTitle?: string; deepLinkUrl?: string },
    origin?: string,
    triggerMessageId?: string,
    presentation?: {
      headerTitle?: string;
      suppressAgentPrefix?: boolean;
      suppressOriginDecoration?: boolean;
      stripLeadingHeaderFromFormattedBody?: boolean;
    },
  ): Promise<void>;
  notifyDeliveryBatchDone?(threadId: string, chainDone: boolean): Promise<void>;
}

/** F088 ISSUE-15: Minimal streaming hook interface. */
interface StreamingHookLike {
  onStreamStart(threadId: string, agentId?: string, invocationId?: string): Promise<void>;
  onStreamChunk(threadId: string, accumulatedText: string, invocationId?: string): Promise<void>;
  onStreamEnd(threadId: string, finalText: string, invocationId?: string): Promise<void>;
  cleanupPlaceholders?(threadId: string, invocationId?: string): Promise<void>;
  notifyDeliveryBatchDone?(threadId: string, chainDone: boolean): Promise<void>;
}

import { normalizeErrorMessage } from '../utils/normalize-error.js';
import { resolveGatewayIdentity, resolveTrustedUserId, resolveUserId } from '../utils/request-identity.js';
import { sendMessageSchema } from './messages.schema.js';
import { parseMultipart } from './parse-multipart.js';

const STREAM_START_TIMEOUT_MS = 5_000;

/**
 * Dependencies injected via Fastify plugin options.
 * socketManager is injected to avoid circular import from index.ts.
 */
export interface MessagesRoutesOptions {
  registry: InvocationRegistry;
  messageStore: IMessageStore;
  socketManager: SocketManager;
  router: AgentRouter;
  sessionStore?: SessionStore;
  deliveryCursorStore?: DeliveryCursorStore;
  threadStore?: IThreadStore;
  uploadDir?: string;
  invocationTracker?: InvocationTracker;
  invocationRecordStore?: IInvocationRecordStore;
  /** #80: Streaming draft store for F5 recovery */
  draftStore?: IDraftStore;
  /** F39: Message queue for delivery-mode routing */
  invocationQueue?: InvocationQueue;
  /** F39: Queue processor for auto-dequeue on invocation complete */
  queueProcessor?: QueueProcessor;
  /** F088 ISSUE-15: Outbound delivery hook for connector platforms (late-bound after gateway bootstrap) */
  outboundHook?: OutboundDeliveryHookLike;
  /** F088 ISSUE-15: Streaming hook for connector platforms (late-bound after gateway bootstrap) */
  streamingHook?: StreamingHookLike;
  /** PPT template lookup for style-aware prompt enrichment. */
  pptTemplateStore?: Pick<PptTemplateStore, 'get' | 'resolveTemplatePromptPaths'>;
}

const log = createModuleLogger('routes/messages');

function normalizePromptPath(value: string): string {
  return value.replace(/\\/g, '/');
}

const getMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).default(50),
  /** Cursor: "timestamp:id" or legacy plain timestamp */
  before: z.string().optional(),
  threadId: z.string().min(1).max(100).optional(),
});

const streamStoppedBodySchema = z.object({
  invocationIds: z.array(z.string().min(1)).max(64),
});

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_FILES = 5;
const DECISION_NOTIFICATION_RE = /\b(review|lgtm|merge|pr)\b/i;

function compareStoredMessages(
  left: { timestamp: number; id: string; deliveredAt?: number },
  right: { timestamp: number; id: string; deliveredAt?: number },
): number {
  const leftTs = typeof left.deliveredAt === 'number' ? left.deliveredAt : left.timestamp;
  const rightTs = typeof right.deliveredAt === 'number' ? right.deliveredAt : right.timestamp;
  return leftTs - rightTs || left.id.localeCompare(right.id);
}

function extractAttachmentNamesFromContentBlocks(contentBlocks?: MessageContent[]): string[] | undefined {
  if (!contentBlocks || contentBlocks.length === 0) return undefined;
  const names = contentBlocks
    .filter((block): block is Extract<MessageContent, { type: 'file' }> => block.type === 'file')
    .map((block) => block.fileName)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  return names.length > 0 ? names : undefined;
}

export function shouldMarkDecisionNotification(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    DECISION_NOTIFICATION_RE.test(content) ||
    content.includes('合入') ||
    content.includes('审批') ||
    content.includes('批准') ||
    content.includes('决策') ||
    content.includes('请确认') ||
    content.includes('是否允许') ||
    lower.includes('can merge')
  );
}

export const messagesRoutes: FastifyPluginAsync<MessagesRoutesOptions> = async (app, opts) => {
  const uploadDir = opts.uploadDir ?? process.env.UPLOAD_DIR ?? './uploads';

  // Register multipart parser for image uploads
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  });

  /** 用户停止后把 userStopped 写入草稿与已落库的 stream 消息，刷新后仍显示停止态 */
  app.post('/api/threads/:threadId/stream-stopped', async (request, reply) => {
    const userId = resolveTrustedUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const parsed = streamStoppedBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parsed.error.issues };
    }
    const { threadId } = request.params as { threadId: string };
    const { invocationIds } = parsed.data;

    if (opts.threadStore) {
      const thread = await opts.threadStore.get(threadId);
      if (!thread || thread.deletedAt) {
        reply.status(404);
        return { error: 'THREAD_NOT_FOUND' };
      }
    }

    const uniqueIds = [...new Set(invocationIds)];
    if (uniqueIds.length === 0) {
      return reply.status(204).send();
    }

    if (opts.draftStore) {
      const drafts = await opts.draftStore.getByThread(userId, threadId);
      for (const invId of uniqueIds) {
        const d = drafts.find((x) => x.invocationId === invId);
        if (d) {
          await opts.draftStore.upsert({ ...d, userStopped: true });
        }
      }
    }

    const msgs = await opts.messageStore.getByThread(threadId, 500, userId);
    for (const m of msgs) {
      if (m.deletedAt || m._tombstone) continue;
      if (!m.agentId || m.agentId === 'system') continue;
      if (m.source) continue;
      if (m.origin !== 'stream') continue;
      const inv = m.extra?.stream?.invocationId;
      if (!inv || !uniqueIds.includes(inv)) continue;
      if (m.extra?.stream?.userStopped) continue;

      const base = m.extra ?? {};
      const stream = base.stream ?? { invocationId: inv };
      const nextExtra: NonNullable<StoredMessage['extra']> = {
        ...base,
        stream: { ...stream, invocationId: stream.invocationId ?? inv, userStopped: true },
      };
      await opts.messageStore.updateExtra(m.id, nextExtra);
    }

    return reply.status(204).send();
  });

  // Shared AgentRouter injected via opts (created in index.ts)
  const router = opts.router;

  // POST /api/messages - 发送消息（WebSocket 广播）
  app.post('/api/messages', async (request, reply) => {
    let content: string;
    let threadId: string | undefined;
    let contentBlocks: MessageContent[] | undefined;
    let idempotencyKey: string | undefined;
    let resumeAgentId: AgentId | undefined;
    let mentionRefs: Array<{ catId: AgentId; mention: string }> | undefined;
    let interactiveAsk: boolean | undefined;
    let pptContext: PptMessageContext | undefined;
    let pptTemplateId: string | undefined;
    // F35: Whisper fields
    let whisperVisibility: 'whisper' | undefined;
    let whisperRecipients: readonly AgentId[] | undefined;

    // F39: Delivery mode
    let deliveryMode: 'immediate' | 'queue' | 'force' | undefined;

    if (request.isMultipart()) {
      // Parse multipart: text fields + image files
      const parsed = await parseMultipart(request, uploadDir);
      if ('error' in parsed) {
        reply.status(400);
        return { error: parsed.error };
      }
      ({ content, threadId, contentBlocks } = parsed);
      if ('idempotencyKey' in parsed && parsed.idempotencyKey) {
        idempotencyKey = parsed.idempotencyKey;
      }
      if ('resumeAgentId' in parsed && parsed.resumeAgentId) {
        resumeAgentId = parsed.resumeAgentId as AgentId;
      }
      if ('mentionRefs' in parsed && parsed.mentionRefs) {
        mentionRefs = parsed.mentionRefs as Array<{ catId: AgentId; mention: string }>;
      }
      if ('interactive_ask' in parsed) {
        interactiveAsk = parsed.interactive_ask;
      }
      if ('pptContext' in parsed && parsed.pptContext) {
        pptContext = parsed.pptContext;
      }
      if ('pptTemplateId' in parsed && parsed.pptTemplateId) {
        pptTemplateId = parsed.pptTemplateId;
      }
      // F35: Extract whisper fields from multipart
      if (parsed.visibility === 'whisper' && parsed.whisperTo) {
        whisperVisibility = 'whisper';
        whisperRecipients = parsed.whisperTo as AgentId[];
      }
      // F39: Extract deliveryMode from multipart
      if (parsed.deliveryMode) {
        deliveryMode = parsed.deliveryMode;
      }
    } else {
      // JSON mode (backwards compatible)
      const parseResult = sendMessageSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return { error: 'Invalid request body', details: parseResult.error.issues };
      }
      ({ content, threadId, idempotencyKey } = parseResult.data);
      contentBlocks = parseResult.data.contentBlocks as MessageContent[] | undefined;
      deliveryMode = parseResult.data.deliveryMode;
      resumeAgentId = parseResult.data.resumeAgentId as AgentId | undefined;
      mentionRefs = parseResult.data.mentionRefs as Array<{ catId: AgentId; mention: string }> | undefined;
      interactiveAsk = parseResult.data.interactive_ask;
      pptContext = parseResult.data.pptContext;
      pptTemplateId = parseResult.data.pptTemplateId;
      // F35: Extract whisper fields from parsed body
      if (parseResult.data.visibility === 'whisper') {
        whisperVisibility = 'whisper';
        whisperRecipients = parseResult.data.whisperTo as AgentId[] | undefined;
      }
    }

    const userId = resolveTrustedUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }
    const gatewayIdentity = resolveGatewayIdentity(request) ?? { userId };

    // Default to 'default' thread for lobby (prevents global broadcast)
    const resolvedThreadId = threadId ?? 'default';

    // Ensure thread exists and auto-title on first message
    if (resolvedThreadId !== 'default' && opts.threadStore) {
      const thread = await opts.threadStore.get(resolvedThreadId);

      if (!thread || thread.deletedAt) {
        // Thread doesn't exist or soft-deleted — reject to prevent orphaned messages (#21 + Phase D)
        reply.status(400);
        return {
          error: '对话不存在',
          detail: '请先创建对话后再发送消息。如果对话已被删除，请新建一个。',
          code: 'THREAD_NOT_FOUND',
        };
      } else if (thread.title === null) {
        // Auto-title existing untitled thread
        const autoTitle = content.length > 240 ? `${content.slice(0, 240)}...` : content;
        await opts.threadStore.updateTitle(resolvedThreadId, autoTitle);
        opts.socketManager.broadcastToRoom(`thread:${resolvedThreadId}`, 'thread_updated', {
          threadId: resolvedThreadId,
          title: autoTitle,
        });
      }
    }

    // Delete guard check (read-only, no side effects — safe before idempotency check)
    if (opts.invocationTracker?.isDeleting(resolvedThreadId)) {
      reply.status(409);
      return {
        error: '对话正在删除中',
        detail: '请稍后重试，或新建一个对话继续',
        code: 'THREAD_DELETING',
      };
    }

    // ADR-008 S1: Pre-resolve targets + intent, persisting @mentions as participants
    log.debug({ threadId: resolvedThreadId, contentLen: content.length }, 'Resolving targets and intent');
    const {
      targetAgents: resolvedTargetCats,
      intent,
      configByAgentId,
    } = await router.resolveTargetsAndIntent(content, resolvedThreadId, {
      persist: true,
      identity: gatewayIdentity,
      ...(mentionRefs ? { mentionRefs } : {}),
    });
    const targetAgents = resumeAgentId
      ? [resumeAgentId]
      : whisperVisibility === 'whisper' && whisperRecipients?.length
        ? [...new Set(whisperRecipients)]
        : [...resolvedTargetCats];
    const primaryCat = targetAgents[0] ?? 'unknown';
    let resolvedPptContext = pptContext;
    if (pptTemplateId && resolvedPptContext) {
      resolvedPptContext = { ...resolvedPptContext, pptTemplateId };
    }
    let routedContent = content;
    if (pptTemplateId) {
      const template = await opts.pptTemplateStore?.get(pptTemplateId);
      if (!template) {
        reply.status(400);
        return { error: 'ppt_template_not_found', detail: '选择的风格模板不存在，请重新选择' };
      }
      const isCustomTemplate = template.source === 'user' || template.templateId.startsWith('user:');
      if (isCustomTemplate) {
        const promptPaths = await opts.pptTemplateStore?.resolveTemplatePromptPaths?.(template.templateId);
        if (!promptPaths) {
          reply.status(400);
          return { error: 'ppt_template_not_ready', detail: '自定义模板目录不可用，请重新生成或重新选择模板' };
        }
        const normalizedTemplateDir = normalizePromptPath(promptPaths.templateDir);
        const normalizedTemplateMainFile = normalizePromptPath(promptPaths.templateMainFile);
        routedContent = [
          content,
          '',
          'PPT风格要求：使用自定义风格模板。',
          `模板名称：${template.name}`,
          `模板目录路径：${normalizedTemplateDir}`,
          `模板主文件路径：${normalizedTemplateMainFile}`,
        ].join('\n');
      } else {
        routedContent = `${content}\n\nPPT风格要求：${template.name}`;
      }
    }
    const modeSystemPrompt = resolvedPptContext ? buildPptModeSystemPrompt(resolvedPptContext) : undefined;
    const queueAttachmentNames = extractAttachmentNamesFromContentBlocks(contentBlocks);

    // Server-generated idempotency key if client didn't provide one
    const resolvedIdempotencyKey = idempotencyKey ?? randomUUID();

    // F39+F108: Queue routing — thread-level delivery mode
    // Any active invocation in the thread → new user messages should queue.
    // Using thread-level check (no agentId) instead of slot-level to prevent
    // concurrent execution when different cats are active (regression fix).
    const hasActive = opts.invocationTracker?.has(resolvedThreadId) ?? false;
    const mode = deliveryMode ?? (hasActive ? 'queue' : 'immediate');
    log.info(
      userVisibleFields('critical', {
        threadId: resolvedThreadId,
        targetAgents,
        intent: intent.intent,
        mode,
        hasActive,
        contentLen: content.length,
      }),
      '[Messages] User message received',
    );

    if (mode === 'queue' && hasActive && opts.invocationQueue) {
      // ① Enqueue first (sync, capacity gatekeeper) — messageId is null at this point
      const enqueueResult = opts.invocationQueue.enqueue({
        threadId: resolvedThreadId,
        userId,
        content: routedContent,
        ...(queueAttachmentNames ? { attachmentNames: queueAttachmentNames } : {}),
        source: 'user',
        targetAgents,
        intent: intent.intent,
        ...(resumeAgentId ? { resumeAgentId } : {}),
        ...(resolvedPptContext ? { pptContext: resolvedPptContext } : {}),
        traceId: request.traceId,
      });

      // Queue full → 429, no message written (no ghost message)
      if (enqueueResult.outcome === 'full') {
        log.warn(
          userVisibleFields('critical', {
            threadId: resolvedThreadId,
            userId,
            targetAgents,
            queueSize: opts.invocationQueue.size(resolvedThreadId, userId),
          }),
          '[Messages] User message queue is full',
        );
        opts.socketManager.emitToUser(userId, 'queue_full_warning', {
          threadId: resolvedThreadId,
          source: 'user',
          queueSize: opts.invocationQueue.size(resolvedThreadId, userId),
          queue: opts.invocationQueue.list(resolvedThreadId, userId),
        });
        reply.status(429);
        return {
          error: '消息队列已满',
          code: 'QUEUE_FULL',
          queueSize: opts.invocationQueue.size(resolvedThreadId, userId),
        };
      }

      let storedUserMessageId: string | null = null;

      // ② Write user message (F117: mark as queued — invisible until dequeue)
      try {
        const userMessage = await opts.messageStore.append({
          userId,
          agentId: null,
          content,
          mentions: targetAgents,
          timestamp: Date.now(),
          threadId: resolvedThreadId,
          deliveryStatus: 'queued', // F117: not visible in history/context/mentions until delivered
          ...(contentBlocks ? { contentBlocks } : {}),
          ...(whisperVisibility && whisperRecipients
            ? { visibility: whisperVisibility, whisperTo: whisperRecipients }
            : {}),
        });
        storedUserMessageId = userMessage.id;

        // ③ Backfill / append messageId — distinguish enqueued vs merged
        const queueEntryId = enqueueResult.entry?.id;
        if (queueEntryId) {
          if (enqueueResult.outcome === 'enqueued') {
            opts.invocationQueue.backfillMessageId(resolvedThreadId, userId, queueEntryId, userMessage.id);
          } else {
            opts.invocationQueue.appendMergedMessageId(resolvedThreadId, userId, queueEntryId, userMessage.id);
          }
        }
      } catch (err) {
        // Write failed → rollback queue entry (no ghost data)
        const queueEntryId = enqueueResult.entry?.id;
        if (queueEntryId && enqueueResult.outcome === 'enqueued') {
          // rollbackEnqueue: preserves merged content from concurrent requests
          opts.invocationQueue.rollbackEnqueue(resolvedThreadId, userId, queueEntryId);
        } else if (queueEntryId) {
          opts.invocationQueue.rollbackMerge(resolvedThreadId, userId, queueEntryId);
        }
        throw err;
      }

      // Emit queue update to this user only (privacy: scopeKey isolation)
      log.info(
        userVisibleFields('progress', {
          threadId: resolvedThreadId,
          userId,
          entryId: enqueueResult.entry?.id,
          queuePosition: enqueueResult.queuePosition,
          outcome: enqueueResult.outcome,
        }),
        '[Messages] User message queued',
      );
      opts.socketManager.emitToUser(userId, 'queue_updated', {
        threadId: resolvedThreadId,
        queue: opts.invocationQueue.list(resolvedThreadId, userId),
        action: enqueueResult.outcome,
      });

      reply.status(202);
      return {
        status: 'queued',
        queuePosition: enqueueResult.queuePosition,
        entryId: enqueueResult.entry?.id,
        merged: enqueueResult.outcome === 'merged',
        ...(storedUserMessageId ? { userMessageId: storedUserMessageId } : {}),
      };
    }

    if (mode === 'force' && hasActive) {
      // Cancel current invocation (same logic as WS cancel)
      const cancelResult = opts.invocationTracker?.cancel(resolvedThreadId, primaryCat, userId);
      if (cancelResult?.cancelled) {
        for (const m of buildCancelMessages(cancelResult)) {
          opts.socketManager.broadcastAgentMessage(m, resolvedThreadId);
        }
      }
      // F39 bugfix: Prevent QueueProcessor state poisoning — the old invocation's
      // async cleanup will call onInvocationComplete('failed'/'canceled') which pauses
      // the thread. Clear that preemptively since we're about to start a new invocation.
      opts.queueProcessor?.clearPause(resolvedThreadId, primaryCat);

      // F39 bugfix: Notify frontend that force-cancel happened (clear stale queue UI)
      if (opts.invocationQueue) {
        opts.socketManager.emitToUser(userId, 'queue_updated', {
          threadId: resolvedThreadId,
          queue: opts.invocationQueue.list(resolvedThreadId, userId),
          action: 'force_cleared',
        });
      }
      // Fall through to immediate execution below
    }

    // ① F122 A.1: Occupy tracker slot BEFORE creating InvocationRecord to close TOCTOU window.
    // Non-force paths use tryStartThread (non-preemptive); force uses start() (preemptive, already cancelled above).
    if (opts.invocationRecordStore) {
      let controller: AbortController | undefined;

      if (mode !== 'force' && opts.invocationTracker) {
        // F122 AC-A8: Atomic thread-level busy gate + slot registration.
        // If thread became busy since initial has() check at line 306, degrade to queue.
        const tryResult = opts.invocationTracker.tryStartThread(resolvedThreadId, primaryCat, userId, targetAgents);
        if (tryResult === null) {
          // TOCTOU: thread became busy between has() and here — degrade to queue
          if (opts.invocationQueue) {
            const enqueueResult = opts.invocationQueue.enqueue({
              threadId: resolvedThreadId,
              userId,
              content: routedContent,
              ...(queueAttachmentNames ? { attachmentNames: queueAttachmentNames } : {}),
              source: 'user',
              targetAgents,
              intent: intent.intent,
              ...(resumeAgentId ? { resumeAgentId } : {}),
              ...(resolvedPptContext ? { pptContext: resolvedPptContext } : {}),
              traceId: request.traceId,
            });
            if (enqueueResult.outcome === 'full') {
              log.warn(
                userVisibleFields('critical', {
                  threadId: resolvedThreadId,
                  userId,
                  targetAgents,
                  queueSize: opts.invocationQueue.size(resolvedThreadId, userId),
                }),
                '[Messages] User message queue is full',
              );
              opts.socketManager.emitToUser(userId, 'queue_full_warning', {
                threadId: resolvedThreadId,
                source: 'user',
                queueSize: opts.invocationQueue.size(resolvedThreadId, userId),
                queue: opts.invocationQueue.list(resolvedThreadId, userId),
              });
              reply.status(429);
              return { error: '消息队列已满', code: 'QUEUE_FULL' };
            }
            // F122 R1-gpt52 P1-1: Wrap append+backfill in try/catch with rollback,
            // matching original queue path (lines 340-374) to prevent ghost queue entries.
            let toctouUserMessage: { id: string };
            try {
              toctouUserMessage = await opts.messageStore.append({
                userId,
                agentId: null,
                content,
                mentions: targetAgents,
                timestamp: Date.now(),
                threadId: resolvedThreadId,
                deliveryStatus: 'queued',
                ...(contentBlocks ? { contentBlocks } : {}),
                ...(whisperVisibility && whisperRecipients
                  ? { visibility: whisperVisibility, whisperTo: whisperRecipients }
                  : {}),
              });
              const queueEntryId = enqueueResult.entry?.id;
              if (queueEntryId) {
                if (enqueueResult.outcome === 'enqueued') {
                  opts.invocationQueue.backfillMessageId(resolvedThreadId, userId, queueEntryId, toctouUserMessage.id);
                } else {
                  opts.invocationQueue.appendMergedMessageId(
                    resolvedThreadId,
                    userId,
                    queueEntryId,
                    toctouUserMessage.id,
                  );
                }
              }
            } catch (err) {
              // Write failed → rollback queue entry (no ghost data)
              const queueEntryId = enqueueResult.entry?.id;
              if (queueEntryId && enqueueResult.outcome === 'enqueued') {
                opts.invocationQueue.rollbackEnqueue(resolvedThreadId, userId, queueEntryId);
              } else if (queueEntryId) {
                opts.invocationQueue.rollbackMerge(resolvedThreadId, userId, queueEntryId);
              }
              throw err;
            }
            opts.socketManager.emitToUser(userId, 'queue_updated', {
              threadId: resolvedThreadId,
              queue: opts.invocationQueue.list(resolvedThreadId, userId),
              action: enqueueResult.outcome,
            });
            log.info(
              userVisibleFields('progress', {
                threadId: resolvedThreadId,
                userId,
                entryId: enqueueResult.entry?.id,
                queuePosition: enqueueResult.queuePosition,
                outcome: enqueueResult.outcome,
              }),
              '[Messages] User message queued after busy recheck',
            );
            reply.status(202);
            return {
              status: 'queued',
              queuePosition: enqueueResult.queuePosition,
              entryId: enqueueResult.entry?.id,
              merged: enqueueResult.outcome === 'merged',
              userMessageId: toctouUserMessage.id,
            };
          }
          // No queue available — thread is busy but we can't queue. Reject.
          reply.status(409);
          return { error: '智能体正在忙', code: 'THREAD_BUSY' };
        }
        controller = tryResult;
      }

      // F122 R1 P1: Wrap create/update/append in try/catch to release slot on error.
      // The background coroutine has its own finally for normal completion, but if we
      // throw before entering it, the slot would leak (thread stuck as "busy").
      let createResult: { outcome: string; invocationId: string };
      try {
        createResult = await opts.invocationRecordStore.create({
          threadId: resolvedThreadId,
          userId,
          targetAgents,
          intent: intent.intent,
          idempotencyKey: resolvedIdempotencyKey,
        });
      } catch (createErr) {
        // Release slot occupied by tryStartThread — prevent "假忙" leak
        if (controller) {
          opts.invocationTracker?.complete(resolvedThreadId, primaryCat, controller);
        }
        throw createErr;
      }

      if (createResult.outcome === 'duplicate') {
        // AC-A11: tryStartThread succeeded but create returned duplicate — release slot
        if (controller) {
          opts.invocationTracker?.complete(resolvedThreadId, primaryCat, controller);
        }
        reply.status(200);
        return { status: 'duplicate', invocationId: createResult.invocationId };
      }

      // Force path: still uses start() (preemptive — cancel already happened above)
      if (!controller) {
        controller = opts.invocationTracker?.start(resolvedThreadId, primaryCat, userId, targetAgents);
      }

      // Race: thread entered deleting between isDeleting() and start()
      if (controller?.signal.aborted) {
        await opts.invocationRecordStore.update(createResult.invocationId, {
          status: 'canceled',
        });
        reply.status(409);
        return {
          error: '对话正在删除中',
          detail: '请稍后重试，或新建一个对话继续',
          code: 'THREAD_DELETING',
        };
      }

      // F122 R1 P1 cont: wrap message write + update before background coroutine.
      // If any of these throw, release the slot to prevent "假忙" leak.
      let storedUserMessage: { id: string };
      try {
        // ② Write user message (decoupled from agent execution)
        storedUserMessage = await opts.messageStore.append({
          userId,
          agentId: null,
          content,
          mentions: targetAgents,
          timestamp: Date.now(),
          threadId: resolvedThreadId,
          ...(contentBlocks ? { contentBlocks } : {}),
          ...(whisperVisibility && whisperRecipients
            ? { visibility: whisperVisibility, whisperTo: whisperRecipients }
            : {}),
        });

        // ③ Backfill InvocationRecord.userMessageId
        await opts.invocationRecordStore.update(createResult.invocationId, {
          userMessageId: storedUserMessage.id,
        });
      } catch (preExecErr) {
        // Release slot — we haven't entered background coroutine yet
        opts.invocationTracker?.complete(resolvedThreadId, primaryCat, controller);
        // Mark record as failed if it was created
        try {
          await opts.invocationRecordStore?.update(createResult.invocationId, { status: 'failed' });
        } catch {
          /* best-effort cleanup */
        }
        throw preExecErr;
      }

      // ④ Reply with invocationId
      reply.send({
        status: 'processing',
        invocationId: createResult.invocationId,
        userMessageId: storedUserMessage.id,
        traceId: request.traceId,
        timestamp: Date.now(),
      });
      log.info(
        userVisibleFields('critical', {
          threadId: resolvedThreadId,
          invocationId: createResult.invocationId,
          userMessageId: storedUserMessage.id,
          targetAgents,
        }),
        '[Messages] User message accepted for processing',
      );

      // ⑤ Background: execute agent invocation via routeExecution
      (async () => {
        const HEARTBEAT_INTERVAL_MS = 30_000;
        const heartbeatInterval = setInterval(() => {
          opts.socketManager.broadcastToRoom(`thread:${resolvedThreadId}`, 'heartbeat', {
            threadId: resolvedThreadId,
            timestamp: Date.now(),
          });
        }, HEARTBEAT_INTERVAL_MS);

        // F39: Track final status for queue auto-dequeue
        let finalStatus: 'succeeded' | 'failed' | 'canceled' = 'failed';

        // F088 ISSUE-15: Hoisted so catch/abort branches can clean up streaming sessions
        let streamStartPromise: Promise<void> | undefined;

        try {
          await opts.invocationRecordStore?.update(createResult.invocationId, {
            status: 'running',
          });

          // #768: intent_mode deferred to first CLI event (avoid "replying" when CLI never starts)
          let intentModeBroadcast = false;

          // ADR-008 S3: collect cursor boundaries; ack only after succeeded
          const cursorBoundaries = new Map<string, string>();
          // P1-2: track persistence failures across generator boundary
          const persistenceContext: PersistenceContext = { failed: false, errors: [] };
          // F8: collect per-agent token usage from done events
          const collectedUsage = new Map<string, TokenUsage>();
          // F070: track governance block errorCode for recoverable failure marking
          let governanceErrorCode: string | undefined;
          // Aggregate streamed assistant text for push summary/decision classification.
          let assistantReplyContent = '';

          // F088 ISSUE-15: Collect per-turn content for outbound delivery to connector platforms
          const outboundTurns: Array<{
            agentId: string;
            textParts: string[];
            richBlocks?: unknown[];
          }> = [];
          let currentTurnAgentId: string | undefined;
          const collectedTextParts: string[] = [];

          // F088 ISSUE-15: Start streaming placeholder on external platforms
          if (opts.streamingHook) {
            streamStartPromise = opts.streamingHook
              .onStreamStart(resolvedThreadId, primaryCat, createResult.invocationId)
              .catch((err) => {
                log.warn({ err, threadId: resolvedThreadId }, '[messages] StreamingHook.onStreamStart failed');
              });
          }
          log.info(
            userVisibleFields('progress', {
              threadId: resolvedThreadId,
              invocationId: createResult.invocationId,
              targetAgents,
            }),
            '[Messages] Agent routing started',
          );

          for await (const msg of router.routeExecution(
            userId,
            routedContent,
            resolvedThreadId,
            storedUserMessage.id,
            targetAgents,
            intent,
            {
              ...(contentBlocks ? { contentBlocks } : {}),
              uploadDir,
              ...(controller?.signal ? { signal: controller.signal } : {}),
              ...(opts.invocationQueue
                ? {
                    queueHasQueuedMessages: (tid: string) =>
                      opts.invocationQueue?.hasQueuedUserMessagesForThread(tid) ?? false,
                    hasQueuedOrActiveAgent: (tid: string, agentId: string) =>
                      opts.invocationQueue?.hasActiveOrQueuedAgent(tid, agentId) ?? false,
                  }
                : {}),
              cursorBoundaries,
              persistenceContext,
              ...(modeSystemPrompt ? { modeSystemPrompt } : {}),
              parentInvocationId: createResult.invocationId,
              gatewayIdentity,
              configByAgentId,
              ...(interactiveAsk ? { interactiveAsk: true } : {}),
              ...(resumeAgentId ? { resumeAgentId } : {}),
              traceId: request.traceId,
            },
          )) {
            // #768: Broadcast intent_mode on first CLI event — proves CLI is alive.
            if (!intentModeBroadcast) {
              opts.socketManager.broadcastToRoom(`thread:${resolvedThreadId}`, 'intent_mode', {
                threadId: resolvedThreadId,
                mode: intent.intent,
                targetAgents,
                invocationId: createResult.invocationId,
              });
              intentModeBroadcast = true;
            }
            // F39 bugfix: stop broadcasting after cancel (drain pipe buffer silently)
            if (controller?.signal.aborted) break;
            if (msg.type === 'text' && msg.content) {
              assistantReplyContent += msg.content;
            }
            if (msg.type === 'done' && msg.agentId && msg.metadata?.usage) {
              collectedUsage.set(msg.agentId, mergeTokenUsage(collectedUsage.get(msg.agentId), msg.metadata.usage));
            }
            if (msg.type === 'done' && msg.errorCode) {
              governanceErrorCode = msg.errorCode;
            }

            // F088 ISSUE-15: Collect outbound turns (same pattern as QueueProcessor)
            if (msg.type === 'done' && msg.agentId) {
              if (persistenceContext.richBlocks) {
                const turn = outboundTurns[outboundTurns.length - 1];
                if (turn && turn.agentId === msg.agentId && currentTurnAgentId === msg.agentId) {
                  turn.richBlocks = [...persistenceContext.richBlocks];
                } else {
                  outboundTurns.push({
                    agentId: msg.agentId,
                    textParts: [],
                    richBlocks: [...persistenceContext.richBlocks],
                  });
                }
                persistenceContext.richBlocks = undefined;
              }
              currentTurnAgentId = undefined;
            }
            if (msg.type === 'text' && typeof (msg as unknown as Record<string, unknown>).content === 'string') {
              const textContent = (msg as unknown as Record<string, unknown>).content as string;
              collectedTextParts.push(textContent);
              if (msg.agentId) {
                if (msg.agentId !== currentTurnAgentId) {
                  outboundTurns.push({ agentId: msg.agentId, textParts: [] });
                  currentTurnAgentId = msg.agentId;
                }
                outboundTurns[outboundTurns.length - 1].textParts.push(textContent);
              }
              // F088 ISSUE-15: Forward streaming chunks to external platforms
              if (opts.streamingHook) {
                const accumulated = collectedTextParts.join('');
                opts.streamingHook
                  .onStreamChunk(resolvedThreadId, accumulated, createResult.invocationId)
                  .catch((streamErr) => {
                    log.warn(
                      { err: streamErr, threadId: resolvedThreadId },
                      '[messages] StreamingHook.onStreamChunk failed',
                    );
                  });
              }
            }

            opts.socketManager.broadcastAgentMessage(
              { ...msg, invocationId: createResult.invocationId },
              resolvedThreadId,
            );
          }

          // F39 P1 fix (砚砚 R1): abort guard after loop — when signal is aborted
          // and the generator ends normally (no throw), the break exits the loop but
          // post-loop code would still run ack+succeeded. Guard explicitly.
          if (controller?.signal.aborted) {
            finalStatus = 'canceled';
            await opts.invocationRecordStore?.update(createResult.invocationId, {
              status: 'canceled',
            });
            // Bugfix: silent-exit P2 — only broadcast diagnostic when preempted by
            // a newer invocation (reason='preempted'). User-initiated cancel already
            // broadcasts its own messages via buildCancelMessages; adding another here
            // would cause a duplicate with misleading text.
            if (controller.signal.reason === 'preempted') {
              opts.socketManager.broadcastAgentMessage(
                {
                  type: 'system_info',
                  agentId: targetAgents[0] ?? getDefaultAgentId(),
                  content: JSON.stringify({
                    type: 'invocation_preempted',
                    detail: 'This response was superseded by a newer request.',
                    invocationId: createResult.invocationId,
                  }),
                  timestamp: Date.now(),
                },
                resolvedThreadId,
              );
            }
            // P1 fix: finalize streaming session on abort so external placeholders are cleaned up
            await cleanupStreamingOnFailure(resolvedThreadId, createResult.invocationId, streamStartPromise, opts, log);
            // Skip ack/succeeded/push-notify — let finally handle cleanup
          } else if (persistenceContext.failed) {
            const errorDetail = persistenceContext.errors.map((e) => `${e.agentId}: ${e.error}`).join('; ');
            await opts.invocationRecordStore?.update(createResult.invocationId, {
              status: 'failed',
              error: `Message delivered but persistence failed: ${errorDetail}`,
            });
            opts.socketManager.broadcastAgentMessage(
              {
                type: 'error',
                agentId: getDefaultAgentId(),
                error: '消息已发送但未能保存，刷新后可能丢失。可点击重试。',
                timestamp: Date.now(),
              },
              resolvedThreadId,
            );

            const pushSvcErr = getPushNotificationService();
            if (pushSvcErr) {
              pushSvcErr
                .notifyUser(userId, {
                  title: '消息保存失败',
                  body: '消息已发送但未能保存，请检查',
                  tag: `agent-error-${resolvedThreadId}`,
                  data: { threadId: resolvedThreadId, url: `/?thread=${resolvedThreadId}` },
                })
                .catch(() => {});
            }
            await cleanupStreamingOnFailure(resolvedThreadId, createResult.invocationId, streamStartPromise, opts, log);
          } else if (governanceErrorCode) {
            // F070: Governance gate blocked — mark as failed with errorCode for retry
            await opts.invocationRecordStore?.update(createResult.invocationId, {
              status: 'failed',
              error: governanceErrorCode,
            });
            await cleanupStreamingOnFailure(resolvedThreadId, createResult.invocationId, streamStartPromise, opts, log);
          } else {
            // ADR-008 S3: ack cursors before marking succeeded so that if ack
            // throws, the catch block sees running→failed (valid transition).
            await router.ackCollectedCursors(userId, resolvedThreadId, cursorBoundaries);

            await opts.invocationRecordStore?.update(createResult.invocationId, {
              status: 'succeeded',
              ...(collectedUsage.size > 0
                ? {
                    usageByCat: Object.fromEntries(collectedUsage),
                  }
                : {}),
            });
            finalStatus = 'succeeded';
            log.info(
              userVisibleFields('critical', {
                threadId: resolvedThreadId,
                invocationId: createResult.invocationId,
                targetAgents,
                responseLen: assistantReplyContent.length,
              }),
              '[Messages] Agent routing completed',
            );

            // Push notification: agent(s) finished responding
            const pushSvc = getPushNotificationService();
            if (pushSvc) {
              const agentNames = targetAgents.join(', ');
              const assistantText = assistantReplyContent.trim();
              const needsDecision = assistantText.length > 0 ? shouldMarkDecisionNotification(assistantText) : false;
              const pushBodySource = assistantText || '已处理，请打开会话查看详情';
              pushSvc
                .notifyUser(userId, {
                  title: needsDecision ? `${agentNames} 需要你决策` : `${agentNames} 回复了`,
                  body: pushBodySource.slice(0, 80),
                  icon: targetAgents.length === 1 ? `/avatars/${targetAgents[0]}.png` : '/icons/icon-192x192.png',
                  tag: `${needsDecision ? 'agent-decision' : 'agent-reply'}-${resolvedThreadId}`,
                  data: {
                    threadId: resolvedThreadId,
                    url: `/?thread=${resolvedThreadId}`,
                    ...(needsDecision ? { requiresDecision: true } : {}),
                  },
                })
                .catch(() => {
                  /* best-effort */
                });
            }

            // F088 ISSUE-15: Outbound delivery to connector platforms
            // P2 fix: fire-and-forget so delivery latency doesn't block invocationTracker.complete()
            deliverOutboundFromWeb(
              resolvedThreadId,
              primaryCat,
              createResult.invocationId,
              collectedTextParts,
              outboundTurns,
              persistenceContext,
              streamStartPromise,
              opts,
              log,
            ).catch((deliverErr) => {
              log.error({ err: deliverErr, threadId: resolvedThreadId }, '[messages] deliverOutboundFromWeb failed');
            });
          }
        } catch (err) {
          // F39 bugfix: detect abort (cancel/force) vs real failure
          if (controller?.signal.aborted) {
            finalStatus = 'canceled';
            await opts.invocationRecordStore?.update(createResult.invocationId, {
              status: 'canceled',
            });
            // Don't broadcast error for intentional cancel
            // P1-A fix: clean up streaming placeholder even on abort/cancel
            await cleanupStreamingOnFailure(resolvedThreadId, createResult.invocationId, streamStartPromise, opts, log);
          } else {
            log.error(
              userVisibleFields('critical', {
                err,
                invocationId: createResult.invocationId,
                threadId: resolvedThreadId,
              }),
              'Background processing error',
            );
            const errorMsg = normalizeErrorMessage(err);
            await opts.invocationRecordStore?.update(createResult.invocationId, {
              status: 'failed',
              error: errorMsg,
            });
            opts.socketManager.broadcastAgentMessage(
              {
                type: 'error',
                agentId: getDefaultAgentId(),
                error: errorMsg,
                isFinal: true,
                timestamp: Date.now(),
              },
              resolvedThreadId,
            );

            const pushSvcCatch = getPushNotificationService();
            if (pushSvcCatch) {
              pushSvcCatch
                .notifyUser(userId, {
                  title: '处理出错',
                  body: errorMsg.slice(0, 100),
                  tag: `agent-error-${resolvedThreadId}`,
                  data: { threadId: resolvedThreadId, url: `/?thread=${resolvedThreadId}` },
                })
                .catch(() => {});
            }
            await cleanupStreamingOnFailure(resolvedThreadId, createResult.invocationId, streamStartPromise, opts, log);
          } // end else (non-abort error)
        } finally {
          clearInterval(heartbeatInterval);
          opts.invocationTracker?.complete(resolvedThreadId, primaryCat, controller);
          // F39: Notify queue processor for auto-dequeue chain
          opts.queueProcessor?.onInvocationComplete(resolvedThreadId, primaryCat, finalStatus).catch(() => {
            /* best-effort, don't crash background task */
          });
        }
      })().catch((err) => {
        console.error('[messages] Background processing error:', err);
      });
    } else {
      // Fallback: no invocationRecordStore (legacy path, uses route())
      // F122 A.1: Try non-preemptive first. Legacy path has no InvocationQueue so it
      // cannot degrade to queue — fall back to preemptive start() as temporary compat.
      // TODO(F122 Phase B): Legacy path should be removed or given queue support.
      let controller: AbortController | undefined;
      if (mode !== 'force' && opts.invocationTracker) {
        controller =
          opts.invocationTracker.tryStartThread(resolvedThreadId, primaryCat, userId, targetAgents) ??
          opts.invocationTracker.start(resolvedThreadId, primaryCat, userId, targetAgents);
      } else {
        controller = opts.invocationTracker?.start(resolvedThreadId, primaryCat, userId, targetAgents);
      }
      if (controller?.signal.aborted) {
        reply.status(409);
        return {
          error: '对话正在删除中',
          detail: '请稍后重试，或新建一个对话继续',
          code: 'THREAD_DELETING',
        };
      }

      reply.send({ status: 'processing', timestamp: Date.now() });

      (async () => {
        const HEARTBEAT_INTERVAL_MS = 30_000;
        const heartbeatInterval = setInterval(() => {
          opts.socketManager.broadcastToRoom(`thread:${resolvedThreadId}`, 'heartbeat', {
            threadId: resolvedThreadId,
            timestamp: Date.now(),
          });
        }, HEARTBEAT_INTERVAL_MS);

        try {
          // #768: intent_mode deferred to first CLI event (legacy path)
          let intentModeBroadcast = false;

          for await (const msg of router.route(
            userId,
            routedContent,
            resolvedThreadId,
            contentBlocks,
            uploadDir,
            controller?.signal,
            {
              ...(modeSystemPrompt ? { modeSystemPrompt } : {}),
              gatewayIdentity,
            },
          )) {
            // #768: Broadcast intent_mode on first CLI event (legacy path)
            if (!intentModeBroadcast) {
              opts.socketManager.broadcastToRoom(`thread:${resolvedThreadId}`, 'intent_mode', {
                threadId: resolvedThreadId,
                mode: intent.intent,
                targetAgents,
                // Legacy path: no invocationId (no InvocationRecord). Frontend falls back gracefully.
              });
              intentModeBroadcast = true;
            }
            opts.socketManager.broadcastAgentMessage(msg, resolvedThreadId);
          }
        } catch (err) {
          log.error({ err }, 'Background processing error');
          opts.socketManager.broadcastAgentMessage(
            {
              type: 'error',
              agentId: getDefaultAgentId(),
              error: normalizeErrorMessage(err),
              isFinal: true,
              timestamp: Date.now(),
            },
            resolvedThreadId,
          );
        } finally {
          clearInterval(heartbeatInterval);
          opts.invocationTracker?.complete(resolvedThreadId, primaryCat, controller);
        }
      })().catch((err) => {
        console.error('[messages] Legacy background processing error:', err);
      });
    }
  });

  // GET /api/messages - 获取历史消息
  app.get('/api/messages', async (request) => {
    const parseResult = getMessagesSchema.safeParse(request.query);
    if (!parseResult.success) {
      return { messages: [], hasMore: false };
    }
    const { limit, before, threadId } = parseResult.data;
    const userId = resolveUserId(request, { defaultUserId: 'default-user' });
    if (!userId) {
      return { messages: [], hasMore: false };
    }

    // Parse composite cursor "timestamp:id" or legacy plain timestamp
    let beforeTs: number | undefined;
    let beforeId: string | undefined;
    if (before) {
      const colonIdx = before.indexOf(':');
      if (colonIdx > 0) {
        beforeTs = parseInt(before.slice(0, colonIdx), 10);
        beforeId = before.slice(colonIdx + 1);
      } else {
        beforeTs = parseInt(before, 10);
      }
      if (!Number.isFinite(beforeTs!)) {
        return { messages: [], hasMore: false };
      }
    }

    // Always thread-scoped — default to 'default' thread for lobby
    const resolvedThreadId = threadId ?? 'default';
    const filteredMessages: Awaited<ReturnType<typeof opts.messageStore.getByThread>> = [];
    const pageSize = Math.max(limit * 2, 50);
    let cursorTimestamp = beforeTs;
    let cursorId = beforeId;
    let firstPage = true;

    while (filteredMessages.length < limit + 1) {
      const batch =
        firstPage && cursorTimestamp == null
          ? await opts.messageStore.getByThread(resolvedThreadId, pageSize, userId)
          : await opts.messageStore.getByThreadBefore(
              resolvedThreadId,
              cursorTimestamp ?? Number.MAX_SAFE_INTEGER,
              pageSize,
              cursorId,
              userId,
            );

      firstPage = false;
      if (batch.length === 0) break;

      for (const message of batch) {
        if (isScheduledTriggerPlaceholder(message)) continue;
        filteredMessages.push(message);
      }

      const oldest = batch[0]!;
      cursorTimestamp = oldest.timestamp;
      cursorId = oldest.id;
    }

    filteredMessages.sort(compareStoredMessages);

    // Fetch limit+1 to determine hasMore; drop oldest (first) probe item
    const hasMore = filteredMessages.length > limit;
    const page = hasMore ? filteredMessages.slice(-limit) : filteredMessages;

    type TimelineItem = {
      id: string;
      type: 'user' | 'assistant' | 'connector' | 'system';
      agentId: string | null;
      content: string;
      timestamp: number;
      [key: string]: unknown;
    };
    const chatItems: TimelineItem[] = page.map((m) => ({
      id: m.id,
      type: (m.source
        ? 'connector'
        : isSystemUserMessage(m)
          ? 'system'
          : m.agentId
            ? 'assistant'
            : 'user') as TimelineItem['type'],
      agentId: m.agentId,
      content: m.content,
      ...(m.contentBlocks ? { contentBlocks: m.contentBlocks } : {}),
      ...(m.toolEvents ? { toolEvents: m.toolEvents } : {}),
      ...(m.metadata ? { metadata: m.metadata } : {}),
      ...(m.origin ? { origin: m.origin } : {}),
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(m.extra?.rich || m.extra?.crossPost || m.extra?.stream || m.extra?.targetAgents || m.extra?.taskRuns
        ? {
            extra: {
              ...(m.extra.rich ? { rich: m.extra.rich } : {}),
              ...(m.extra.crossPost ? { crossPost: m.extra.crossPost } : {}),
              ...(m.extra.stream ? { stream: m.extra.stream } : {}),
              ...(m.extra.targetAgents ? { targetAgents: m.extra.targetAgents } : {}),
              ...(m.extra.taskRuns ? { taskRuns: m.extra.taskRuns } : {}),
            },
          }
        : {}),
      ...(m.visibility ? { visibility: m.visibility } : {}),
      ...(m.whisperTo ? { whisperTo: m.whisperTo } : {}),
      ...(m.revealedAt ? { revealedAt: m.revealedAt } : {}),
      ...(m.deliveredAt ? { deliveredAt: m.deliveredAt } : {}),
      ...(m.source
        ? {
            source: {
              connector: m.source.connector,
              label: m.source.label,
              icon: m.source.icon,
              ...(m.source.url ? { url: m.source.url } : {}),
              ...(m.source.meta ? { meta: m.source.meta } : {}),
            },
          }
        : {}),
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      timestamp: m.timestamp,
    }));

    // F121: Hydrate reply previews for messages with replyTo
    const replyItems = chatItems.filter((item) => item.replyTo);
    if (replyItems.length > 0) {
      const { hydrateReplyPreview } = await import('../domains/agents/services/stores/ports/MessageStore.js');
      await Promise.all(
        replyItems.map(async (item) => {
          const preview = await hydrateReplyPreview(opts.messageStore, item.replyTo as string);
          if (preview) {
            item.replyPreview = preview;
          }
        }),
      );
    }

    // #80: Merge active streaming drafts (first page only — no before cursor)
    if (!before && opts.draftStore) {
      const drafts = await opts.draftStore.getByThread(userId, resolvedThreadId);
      // #80 fix-B diagnostic: trace draft merge for F5 recovery verification
      if (drafts.length > 0) {
        request.log.info(
          { threadId: resolvedThreadId, draftCount: drafts.length, draftIds: drafts.map((d) => d.invocationId) },
          '#80 draft merge: found active drafts',
        );
        // P1-2 dedup: filter out drafts whose invocationId matches a formal message.
        // Build invocationId set from current page first (fast path).
        const formalInvocationIds = new Set(
          page.map((m) => m.extra?.stream?.invocationId).filter((id): id is string => !!id),
        );
        let activeDrafts = drafts.filter((d) => !formalInvocationIds.has(d.invocationId));
        // Cloud R4 P2: if drafts survive page-level dedup, widen the check to cover
        // formal messages pushed off the first page (race window: TTL > page depth).
        // Cloud R5 P2: wider window must always exceed page limit (limit max=200 → worst case 800).
        if (activeDrafts.length > 0 && page.length >= limit) {
          const widerLimit = Math.max(200, limit * 4);
          const wider = await opts.messageStore.getByThread(resolvedThreadId, widerLimit, userId);
          for (const m of wider) {
            const invId = m.extra?.stream?.invocationId;
            if (invId) formalInvocationIds.add(invId);
          }
          activeDrafts = activeDrafts.filter((d) => !formalInvocationIds.has(d.invocationId));
        }
        // P2: stable sort by updatedAt for parallel multi-agent drafts
        activeDrafts.sort((a, b) => a.updatedAt - b.updatedAt);
        if (activeDrafts.length > 0) {
          request.log.info(
            {
              threadId: resolvedThreadId,
              mergedCount: activeDrafts.length,
              agents: activeDrafts.map((d) => d.agentId),
            },
            '#80 draft merge: merging drafts into response',
          );
        }
        for (const d of activeDrafts) {
          chatItems.push({
            id: `draft-${d.invocationId}`,
            type: 'assistant',
            agentId: d.agentId as string | null,
            content: d.content,
            timestamp: d.updatedAt,
            isDraft: true,
            origin: 'stream',
            extra: {
              stream: {
                invocationId: d.invocationId,
                ...(d.userStopped ? { userStopped: true as const } : {}),
              },
              ...(d.taskRuns ? { taskRuns: d.taskRuns } : {}),
            },
            ...(d.toolEvents ? { toolEvents: d.toolEvents } : {}),
            ...(d.thinking ? { thinking: d.thinking } : {}),
          });
        }
      }
    }

    return {
      messages: chatItems,
      hasMore,
    };
  });
};

/** @internal exported for testing — do not use outside of test. */
export async function cleanupStreamingOnFailure(
  threadId: string,
  invocationId: string,
  streamStartPromise: Promise<void> | undefined,
  opts: MessagesRoutesOptions,
  logger: typeof log,
): Promise<void> {
  if (!opts.streamingHook) return;
  try {
    if (streamStartPromise) {
      await Promise.race([streamStartPromise, new Promise<void>((r) => setTimeout(r, STREAM_START_TIMEOUT_MS))]);
    }
    await opts.streamingHook.onStreamEnd(threadId, '', invocationId);
    await opts.streamingHook.cleanupPlaceholders?.(threadId, invocationId);
  } catch (err) {
    logger.warn({ err, threadId }, '[messages] cleanupStreamingOnFailure failed');
  }
}

/** @internal exported for testing — do not use outside of test. */
export async function deliverOutboundFromWeb(
  threadId: string,
  primaryCat: string,
  invocationId: string,
  collectedTextParts: string[],
  outboundTurns: Array<{ agentId: string; textParts: string[]; richBlocks?: unknown[] }>,
  persistenceContext: PersistenceContext,
  streamStartPromise: Promise<void> | undefined,
  opts: MessagesRoutesOptions,
  logger: typeof log,
): Promise<void> {
  const finalContent = collectedTextParts.join('');

  if (opts.streamingHook) {
    if (streamStartPromise) {
      await Promise.race([
        streamStartPromise,
        new Promise<void>((resolve) => setTimeout(resolve, STREAM_START_TIMEOUT_MS)),
      ]);
    }
    await opts.streamingHook.onStreamEnd(threadId, finalContent, invocationId).catch((err) => {
      logger.warn({ err, threadId }, '[messages] StreamingHook.onStreamEnd failed');
    });
  }

  const hasContent = collectedTextParts.length > 0 || outboundTurns.length > 0;
  if (!opts.outboundHook || !hasContent) {
    if (opts.streamingHook?.cleanupPlaceholders) {
      await opts.streamingHook.cleanupPlaceholders(threadId, invocationId).catch((err) => {
        logger.warn({ err, threadId }, '[messages] StreamingHook.cleanupPlaceholders failed (silent)');
      });
    }
    return;
  }

  let threadMeta: { threadShortId: string; threadTitle?: string; deepLinkUrl?: string } | undefined;
  try {
    const LOOKUP_TIMEOUT_MS = 2000;
    const thread = opts.threadStore?.get(threadId);
    if (thread) {
      const lookupPromise = Promise.resolve(thread).catch(() => undefined);
      const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), LOOKUP_TIMEOUT_MS));
      const resolved = await Promise.race([lookupPromise, timeout]);
      if (resolved) {
        const frontendBase = resolveFrontendBaseUrl(process.env);
        threadMeta = {
          threadShortId: threadId.slice(0, 15),
          threadTitle: resolved.title ?? undefined,
          deepLinkUrl: `${frontendBase}/threads/${threadId}`,
        };
      }
    }
  } catch {
    logger.warn({ threadId }, '[messages] threadMeta lookup failed');
  }

  const DELIVER_TIMEOUT_MS = 10_000;
  const nonEmptyTurns = outboundTurns.filter(
    (t) => t.textParts.length > 0 || (t.richBlocks && t.richBlocks.length > 0),
  );

  let deliveryFailed = false;
  const inflightDeliverPromises: Promise<void>[] = [];

  if (nonEmptyTurns.length > 1) {
    for (const turn of nonEmptyTurns) {
      const turnContent = turn.textParts.join('');
      const deliverPromise = opts.outboundHook.deliver(
        threadId,
        turnContent,
        turn.agentId,
        turn.richBlocks,
        threadMeta,
      );
      inflightDeliverPromises.push(deliverPromise);
      try {
        await Promise.race([
          deliverPromise,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('deliver timeout')), DELIVER_TIMEOUT_MS)),
        ]);
      } catch (err) {
        deliveryFailed = true;
        logger.error({ err, threadId, agentId: turn.agentId }, '[messages] Outbound delivery error');
      }
    }
  } else if (nonEmptyTurns.length === 1) {
    const turn = nonEmptyTurns[0];
    const richBlocks = persistenceContext.richBlocks ?? turn.richBlocks;
    const deliverPromise = opts.outboundHook.deliver(threadId, finalContent, turn.agentId, richBlocks, threadMeta);
    inflightDeliverPromises.push(deliverPromise);
    try {
      await Promise.race([
        deliverPromise,
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error('deliver timeout')), DELIVER_TIMEOUT_MS)),
      ]);
    } catch (err) {
      deliveryFailed = true;
      logger.error({ err, threadId }, '[messages] Outbound delivery error');
    }
  } else {
    const richBlocks = persistenceContext.richBlocks;
    if (richBlocks) {
      const deliverPromise = opts.outboundHook.deliver(threadId, finalContent, primaryCat, richBlocks, threadMeta);
      inflightDeliverPromises.push(deliverPromise);
      try {
        await Promise.race([
          deliverPromise,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('deliver timeout')), DELIVER_TIMEOUT_MS)),
        ]);
      } catch (err) {
        deliveryFailed = true;
        logger.error({ err, threadId }, '[messages] Outbound delivery error');
      }
    }
  }

  if (!deliveryFailed && opts.streamingHook?.cleanupPlaceholders) {
    await opts.streamingHook.cleanupPlaceholders(threadId, invocationId).catch((err) => {
      logger.warn({ err, threadId }, '[messages] StreamingHook.cleanupPlaceholders failed');
    });
  } else if (deliveryFailed && opts.streamingHook?.cleanupPlaceholders) {
    const cleanupFn = opts.streamingHook.cleanupPlaceholders.bind(opts.streamingHook);
    Promise.allSettled(inflightDeliverPromises).then((results) => {
      if (results.every((r) => r.status === 'fulfilled')) {
        cleanupFn(threadId, invocationId).catch((err) => {
          logger.warn({ err, threadId }, '[messages] Late-success placeholder cleanup failed');
        });
      }
    });
  }

  // F151: Notify adapters (e.g. Weixin/XiaoYi) that delivery batch is complete.
  // Prefer outboundHook because single-token outbound adapters flush on this signal.
  if (opts.outboundHook?.notifyDeliveryBatchDone) {
    const threadStillBusy =
      (opts.invocationTracker?.has(threadId) ?? false) || (opts.queueProcessor?.isThreadBusy(threadId) ?? false);
    await opts.outboundHook.notifyDeliveryBatchDone(threadId, !threadStillBusy).catch((err) => {
      logger.warn({ err, threadId }, '[messages] notifyDeliveryBatchDone failed');
    });
  } else if (opts.streamingHook?.notifyDeliveryBatchDone) {
    const threadStillBusy =
      (opts.invocationTracker?.has(threadId) ?? false) || (opts.queueProcessor?.isThreadBusy(threadId) ?? false);
    await opts.streamingHook.notifyDeliveryBatchDone(threadId, !threadStillBusy).catch((err) => {
      logger.warn({ err, threadId }, '[messages] notifyDeliveryBatchDone failed');
    });
  }
}
