/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Callback API Routes — MCP 回传端点
 * 安全: 每个请求都需要 invocationId + callbackToken 验证。
 */

import type { AgentId, RichBlock } from '@openjiuwen/relay-shared';
import { officeClawRegistry, createAgentId, normalizeRichBlock } from '@openjiuwen/relay-shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { resolveFrontendBaseUrl } from '../config/frontend-origin.js';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { InvocationTracker } from '../domains/agents/services/agents/invocation/InvocationTracker.js';
import { getRichBlockBuffer } from '../domains/agents/services/agents/invocation/RichBlockBuffer.js';
import { parseA2AMentions } from '../domains/agents/services/agents/routing/a2a-mentions.js';
import { appendGeneratedFileLocationDisclosure } from '../domains/agents/services/agents/routing/generated-file-artifacts.js';
import { extractRichFromText } from '../domains/agents/services/agents/routing/rich-block-extract.js';
import type { AgentRouter } from '../domains/agents/services/index.js';
import type { IBacklogStore } from '../domains/agents/services/stores/ports/BacklogStore.js';
import type { DeliveryCursorStore } from '../domains/agents/services/stores/ports/DeliveryCursorStore.js';
import type { IInvocationRecordStore } from '../domains/agents/services/stores/ports/InvocationRecordStore.js';
import { hydrateReplyPreview, type IMessageStore } from '../domains/agents/services/stores/ports/MessageStore.js';
import type { ITaskStore } from '../domains/agents/services/stores/ports/TaskStore.js';
import type { IThreadStore, VotingStateV1 } from '../domains/agents/services/stores/ports/ThreadStore.js';
import { canViewMessage, isScheduledTriggerPlaceholder } from '../domains/agents/services/stores/visibility.js';
import { getVoiceBlockSynthesizer } from '../domains/agents/services/tts/VoiceBlockSynthesizer.js';
import type { IEvidenceStore, IMarkerQueue, IReflectionService } from '../domains/memory/interfaces.js';
import type { IPrTrackingStore } from '../infrastructure/email/PrTrackingStore.js';
import { createModuleLogger } from '../infrastructure/logger.js';
import type { SocketManager } from '../infrastructure/websocket/index.js';
import { getFeatureTagId } from './backlog-doc-import.js';
import { enqueueA2ATargets, triggerA2AInvocation } from './callback-a2a-trigger.js';
import { callbackAuthSchema } from './callback-auth-schema.js';
import { EXPIRED_CREDENTIALS_ERROR } from './callback-errors.js';
import { registerCallbackLimbRoutes } from './callback-limb-routes.js';
import { registerCallbackMemoryRoutes } from './callback-memory-routes.js';
import { registerDispatchAgentTaskRoutes } from './callback-dispatch-agent-task-routes.js';
import { getMultiMentionOrchestrator, registerMultiMentionRoutes } from './callback-multi-mention-routes.js';
import { registerCallbackSkillRoutes } from './callback-skill-routes.js';
import { registerCallbackTaskRoutes } from './callback-task-routes.js';
import { registerCallbackWorkflowSopRoutes } from './callback-workflow-sop-routes.js';
import { type FeatIndexEntry, readFeatIndexEntries } from './feat-index-doc-import.js';
import { detectUserMention } from './user-mention.js';
import { DispatchTaskRegistry } from '../domains/agents/services/agents/routing/DispatchTaskRegistry.js';

const log = createModuleLogger('routes/callbacks');

export interface CallbackRoutesOptions {
  registry: InvocationRegistry;
  messageStore: IMessageStore;
  socketManager: SocketManager;
  taskStore?: ITaskStore;
  backlogStore?: IBacklogStore;
  /** For thinking mode filtering in thread-context */
  threadStore?: IThreadStore;
  /** For post_message @mention → invocation triggering */
  router?: AgentRouter;
  invocationRecordStore?: IInvocationRecordStore;
  invocationTracker?: InvocationTracker;
  /** For mention ack cursor tracking (#77) */
  deliveryCursorStore?: DeliveryCursorStore;
  /** TD091: PR tracking registration via MCP callback */
  prTrackingStore?: IPrTrackingStore;
  /** F043 P1: feat_index provider override for tests */
  featIndexProvider?: () => Promise<FeatIndexEntry[]>;
  /** F073 P1: workflow SOP store for bulletin board */
  workflowSopStore?: import('../domains/agents/services/stores/ports/WorkflowSopStore.js').IWorkflowSopStore;
  /** F102: DI memory services — SQLite-backed evidence store */
  evidenceStore: IEvidenceStore;
  markerQueue: IMarkerQueue;
  reflectionService: IReflectionService;
  /** Queue auto-dequeue on A2A invocation completion */
  queueProcessor?: {
    onInvocationComplete(threadId: string, agentId: string, status: 'succeeded' | 'failed' | 'canceled'): Promise<void>;
    tryAutoExecute(threadId: string): Promise<void>;
    registerEntryCompleteHook(
      entryId: string,
      hook: (entryId: string, status: 'succeeded' | 'failed' | 'canceled', responseText: string) => void,
    ): void;
    unregisterEntryCompleteHook(entryId: string): void;
  };
  /** F122B: InvocationQueue for agent-sourced A2A entries */
  invocationQueue?: import('../domains/agents/services/agents/invocation/InvocationQueue.js').InvocationQueue;
  /** F126: Limb node registry for device/hardware capability management */
  limbRegistry?: import('../domains/limb/LimbRegistry.js').LimbRegistry;
  /** F126 Phase C: Limb pairing store for remote device approval */
  limbPairingStore?: import('../domains/limb/LimbPairingStore.js').LimbPairingStore;
  /** F088: Outbound delivery hook for connector-bound threads (late-bound after gateway bootstrap). */
  outboundHook?: {
    deliver(
      threadId: string,
      content: string,
      agentId?: string,
      richBlocks?: RichBlock[],
      threadMeta?: { threadShortId: string; threadTitle?: string; deepLinkUrl?: string },
      origin?: 'callback' | 'agent' | 'system',
      triggerMessageId?: string,
      presentation?: {
        headerTitle?: string;
        suppressAgentPrefix?: boolean;
        suppressOriginDecoration?: boolean;
        stripLeadingHeaderFromFormattedBody?: boolean;
      },
    ): Promise<void>;
    notifyDeliveryBatchDone?(threadId: string, chainDone: boolean): Promise<void>;
  };
}

const postMessageSchema = callbackAuthSchema.extend({
  content: z.string().min(1).max(50000),
  threadId: z.string().min(1).optional(),
  allowCrossThread: z.boolean().optional(),
  replyTo: z.string().optional(),
  clientMessageId: z.string().min(1).max(200).optional(),
  targetAgents: z.array(z.string().min(1)).optional(),
});

const threadContextQuerySchema = callbackAuthSchema.extend({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  threadId: z.string().min(1).optional(), // F-Swarm-6: optional cross-thread read
  agentId: z.string().min(1).optional(),
  keyword: z.string().min(1).optional(),
});

const listThreadsQuerySchema = callbackAuthSchema.extend({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  activeSince: z.coerce.number().int().min(0).optional(),
  keyword: z.string().trim().min(1).max(200).optional(),
});

const featIndexQuerySchema = callbackAuthSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  featId: z.string().min(1).optional(),
  query: z.string().min(1).optional(),
});

const pendingMentionsQuerySchema = callbackAuthSchema.extend({
  // Accept both scalar and repeated query params (Fastify may surface string[]).
  includeAcked: z.union([z.string(), z.array(z.string())]).optional(),
});

const ackMentionsSchema = callbackAuthSchema.extend({
  upToMessageId: z.string().min(1),
});

/** F22: Rich block creation schema — validates shape + kind-specific fields (cloud Codex P1) */
const richChecklistItemSchema = z.object({ id: z.string(), text: z.string(), checked: z.boolean().optional() });
const richMediaItemSchema = z.object({ url: z.string(), alt: z.string().optional(), caption: z.string().optional() });
const richBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('card'),
    v: z.literal(1),
    title: z.string(),
    bodyMarkdown: z.string().optional(),
    tone: z.enum(['info', 'success', 'warning', 'danger']).optional(),
    fields: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('diff'),
    v: z.literal(1),
    filePath: z.string(),
    diff: z.string(),
    languageHint: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('checklist'),
    v: z.literal(1),
    title: z.string().optional(),
    items: z.array(richChecklistItemSchema).min(1),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('media_gallery'),
    v: z.literal(1),
    title: z.string().optional(),
    items: z.array(richMediaItemSchema).min(1),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('audio'),
    v: z.literal(1),
    url: z.string().optional().default(''),
    text: z.string().optional(),
    title: z.string().optional(),
    durationSec: z.number().optional(),
    mimeType: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('interactive'),
    v: z.literal(1),
    interactiveType: z.enum(['select', 'multi-select', 'card-grid', 'confirm']),
    title: z.string().optional(),
    description: z.string().optional(),
    options: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          emoji: z.string().optional(),
          icon: z.string().optional(),
          description: z.string().optional(),
          level: z.number().optional(),
          group: z.string().optional(),
          customInput: z.boolean().optional(),
          customInputPlaceholder: z.string().optional(),
        }),
      )
      .min(1),
    maxSelect: z.number().int().min(1).optional(),
    allowRandom: z.boolean().optional(),
    messageTemplate: z.string().optional(),
    disabled: z.boolean().optional(),
    selectedIds: z.array(z.string()).optional(),
    groupId: z.string().min(1).optional(),
  }),
  // F088 Phase J: file attachment block
  z.object({
    id: z.string().min(1),
    kind: z.literal('file'),
    v: z.literal(1),
    url: z
      .string()
      .min(1)
      .refine(
        (u) => !u.includes('..') && (/^\/uploads\//.test(u) || /^\/api\//.test(u) || /^https:\/\//.test(u)),
        'file url must start with /uploads/, /api/, or https://',
      ),
    fileName: z.string().min(1),
    mimeType: z.string().optional(),
    fileSize: z.number().int().min(0).optional(),
  }),
  // F120 Phase C: html_widget — inline sandboxed HTML/JS visualization
  z.object({
    id: z.string().min(1),
    kind: z.literal('html_widget'),
    v: z.literal(1),
    html: z.string().min(1).max(500_000),
    title: z.string().optional(),
    height: z.number().int().min(50).max(2000).optional(),
  }),
]);
const createRichBlockSchema = callbackAuthSchema.extend({
  block: richBlockSchema,
});

function ensureFileLocationDisclosure(content: string, richBlocks: readonly RichBlock[]): string {
  const fileBlocks = richBlocks.filter(
    (block): block is Extract<RichBlock, { kind: 'file' }> => block.kind === 'file' && typeof block.url === 'string',
  );
  if (fileBlocks.length === 0) return content;

  const missingDisclosures = fileBlocks.filter((block) => {
    const hasFileName = content.includes(block.fileName);
    const hasUrl = content.includes(block.url);
    return !(hasFileName && hasUrl);
  });
  if (missingDisclosures.length === 0) return content;

  const disclosure = missingDisclosures.map((block) => `- ${block.fileName}: ${block.url}`).join('\n');
  const separator = content.trim().length > 0 ? '\n\n' : '';
  return `${content}${separator}文件位置：\n${disclosure}`;
}

function normalizeFeatId(value: string): string {
  return value.trim().toUpperCase();
}

function maskCredentialForLog(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (value.length <= 8) return `${value[0] ?? ''}***(${value.length})`;
  return `${value.slice(0, 6)}***(${value.length})`;
}

async function buildThreadIdsByFeatId(
  threadStore: IThreadStore | undefined,
  backlogStore: IBacklogStore | undefined,
  userId: string,
  logger: { warn: (obj: unknown, msg?: string) => void },
): Promise<Map<string, string[]>> {
  const mapped = new Map<string, string[]>();
  if (!threadStore || !backlogStore) return mapped;

  try {
    const threads = await threadStore.list(userId);
    for (const thread of threads) {
      if (!thread.backlogItemId) continue;
      const backlogItem = await backlogStore.get(thread.backlogItemId, userId);
      if (!backlogItem) continue;
      const featureTagId = getFeatureTagId(backlogItem.tags);
      if (!featureTagId) continue;
      const featId = normalizeFeatId(featureTagId);
      if (featId.length === 0) continue;
      const existing = mapped.get(featId);
      if (!existing) {
        mapped.set(featId, [thread.id]);
        continue;
      }
      if (!existing.includes(thread.id)) existing.push(thread.id);
    }
  } catch (err) {
    logger.warn({ err, userId }, '[callbacks/feat-index] threadIds enrichment degraded');
  }

  return mapped;
}

export const callbacksRoutes: FastifyPluginAsync<CallbackRoutesOptions> = async (app, opts) => {
  const dispatchTaskRegistry = new DispatchTaskRegistry();
  const {
    registry,
    messageStore,
    socketManager,
    taskStore,
    backlogStore,
    threadStore,
    router,
    invocationRecordStore,
    invocationTracker,
    deliveryCursorStore,
    prTrackingStore,
    featIndexProvider,
    queueProcessor,
  } = opts;

  app.post('/api/callbacks/post-message', async (request, reply) => {
    const parsed = postMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      const rawBody =
        request.body && typeof request.body === 'object' && !Array.isArray(request.body)
          ? (request.body as Record<string, unknown>)
          : undefined;
      const rawContent = rawBody?.['content'];
      const rawTargetAgents = rawBody?.['targetAgents'];
      app.log.warn(
        {
          issues: parsed.error.issues,
          bodyShape: {
            bodyType: Array.isArray(request.body) ? 'array' : typeof request.body,
            keys: rawBody ? Object.keys(rawBody) : undefined,
            invocationId: maskCredentialForLog(rawBody?.['invocationId']),
            callbackToken: maskCredentialForLog(rawBody?.['callbackToken']),
            contentType: typeof rawContent,
            contentLength: typeof rawContent === 'string' ? rawContent.length : undefined,
            threadIdType: rawBody ? typeof rawBody['threadId'] : undefined,
            replyToType: rawBody ? typeof rawBody['replyTo'] : undefined,
            targetAgentsType: Array.isArray(rawTargetAgents) ? 'array' : typeof rawTargetAgents,
            targetAgentsLength: Array.isArray(rawTargetAgents) ? rawTargetAgents.length : undefined,
          },
        },
        '[callbacks/post-message] Invalid request body',
      );
      reply.status(400);
      return { error: 'Invalid request body', details: parsed.error.issues };
    }

    const {
      invocationId,
      callbackToken,
      content,
      threadId,
      allowCrossThread,
      replyTo,
      clientMessageId,
      targetAgents: explicitTargetAgents,
    } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    // Stale callback guard (cloud Codex P1 + Codex R3): reject callbacks from
    // preempted invocations. A newer invocation for the same thread+agent supersedes.
    // Return 200 + stale_ignored to avoid retry storms from the dying CLI process.
    if (!registry.isLatest(invocationId)) {
      return { status: 'stale_ignored', replyTo, ...(clientMessageId ? { clientMessageId } : {}) };
    }

    let effectiveThreadId = record.threadId;
    if (threadId && threadId !== record.threadId) {
      // DIAG: Cross-thread routing debug (ghost-thread bug — opus session responding in wrong thread)
      app.log.info(
        {
          invocationId,
          agentId: record.agentId,
          recordThreadId: record.threadId,
          requestedThreadId: threadId,
          allowCrossThread: allowCrossThread === true,
        },
        '[DIAG/ghost-thread] post-message: cross-thread detected',
      );
      if (!allowCrossThread) {
        reply.status(400);
        return {
          error:
            'Cross-thread post requires explicit allowCrossThread=true. Use the dedicated cross_post_message tool instead of post_message.',
        };
      }
      if (!threadStore) {
        reply.status(503);
        return { error: 'Thread store not configured for cross-thread posting' };
      }
      const targetThread = await threadStore.get(threadId);
      if (!targetThread || targetThread.createdBy !== record.userId) {
        reply.status(403);
        return { error: 'Thread access denied' };
      }
      effectiveThreadId = threadId;
    }

    // At-least-once de-duplication: retries with same clientMessageId are treated as duplicate.
    if (clientMessageId) {
      const isFirstSeen = registry.claimClientMessageId(invocationId, clientMessageId);
      if (!isFirstSeen) {
        return { status: 'duplicate', replyTo, clientMessageId };
      }
    }

    // #83: Extract cc_rich blocks from post_message content (Route B for callback path)
    const { cleanText: rawStoredContent, blocks: extractedBlocks } = extractRichFromText(content);

    // Consume any buffered rich blocks produced earlier in the same invocation.
    // CLI agents don't go through route-serial, so the buffer must be consumed here.
    // For route-serial agents, the buffer is already consumed before post_message — this is a no-op.
    const bufferedBlocks = getRichBlockBuffer().consume(effectiveThreadId, record.agentId as string, invocationId);

    // F34-b: Resolve voice blocks (audio with text, no url) before storing
    const synthesizer = getVoiceBlockSynthesizer();
    let richBlocks = [...extractedBlocks, ...bufferedBlocks];
    if (synthesizer && richBlocks.some((b) => b.kind === 'audio' && 'text' in b)) {
      try {
        richBlocks = await synthesizer.resolveVoiceBlocks(richBlocks, record.agentId as string);
      } catch (err) {
        app.log.error({ err }, '[callbacks/post-message] Voice block synthesis failed');
      }
    }
    const storedContent = appendGeneratedFileLocationDisclosure(rawStoredContent, richBlocks);

    // F52: Detect cross-thread post (used for both A2A exemption and crossPost metadata)
    const isCrossThread = effectiveThreadId !== record.threadId;

    // Parse line-start @mentions (A2A rule: only line-start, strip code blocks, single target)
    // Uses parseA2AMentions instead of resolveTargetsAndIntent to avoid
    // participants/default-opus fallback triggering on non-@ messages (P1-1)
    // and inline @mentions triggering invocations (P1-2).
    // F52: Cross-thread posts skip self-reference filter so @codex can trigger target thread's codex
    const senderAgentId = createAgentId(record.agentId);
    const contentTargets = parseA2AMentions(storedContent, isCrossThread ? undefined : senderAgentId);
    // F098-C1: Merge explicit targetAgents with content-parsed mentions (deduped)
    // Filter out invalid agentIds (e.g. "default-user") — graceful degradation, not 400
    const validExplicitTargets: AgentId[] = [];
    for (const id of explicitTargetAgents ?? []) {
      if (officeClawRegistry.has(id)) {
        validExplicitTargets.push(createAgentId(id));
      } else {
        app.log.warn(
          { droppedId: id, agentId: record.agentId, invocationId },
          '[callbacks/post-message] Dropped invalid agentId from targetAgents',
        );
      }
    }
    const mergedTargets = new Set<AgentId>([...contentTargets, ...validExplicitTargets]);
    if (contentTargets.length === 1 && mergedTargets.size > 1) {
      const [primaryTarget] = contentTargets;
      if (!primaryTarget) {
        app.log.warn(
          { invocationId, threadId: effectiveThreadId, senderAgentId, contentTargets, validExplicitTargets },
          '[A2A/fail-closed] Unexpected empty primary target; skip fail-closed pruning',
        );
      } else {
        const droppedTargets = [...mergedTargets].filter((agentId) => agentId !== primaryTarget);
        mergedTargets.clear();
        mergedTargets.add(primaryTarget);
        app.log.warn(
          {
            invocationId,
            threadId: effectiveThreadId,
            senderAgentId,
            contentTargets,
            validExplicitTargets,
            droppedTargets,
            retainedTarget: primaryTarget,
          },
          '[A2A/fail-closed] Single line-start mention detected; dropped extra merged targets',
        );
      }
    }
    const mentions: AgentId[] = [...mergedTargets];
    if (contentTargets.length > 0 || validExplicitTargets.length > 0) {
      app.log.debug(
        {
          invocationId,
          threadId: effectiveThreadId,
          senderAgentId,
          contentTargets,
          validExplicitTargets,
          mergedTargets: mentions,
        },
        '[DIAG/a2a] post-message target merge',
      );
    }
    const mentionsUser = detectUserMention(storedContent);
    log.debug(
      {
        agentId: record.agentId,
        invocationId,
        threadId: effectiveThreadId,
        isCrossThread,
        contentTargets,
        explicitTargets: validExplicitTargets,
        mergedMentions: mentions,
        mentionsUser,
        hasAtSign: storedContent.includes('@'),
        contentLen: storedContent.length,
      },
      '[callbacks/post-message] Mention parse result',
    );
    const crossPostExtra = isCrossThread
      ? { crossPost: { sourceThreadId: record.threadId, sourceInvocationId: invocationId } }
      : {};
    const richExtra = richBlocks.length > 0 ? { rich: { v: 1 as const, blocks: richBlocks } } : {};
    const targetAgentsExtra = validExplicitTargets.length ? { targetAgents: validExplicitTargets } : {};
    const extraParts = { ...richExtra, ...crossPostExtra, ...targetAgentsExtra };
    const extra = Object.keys(extraParts).length > 0 ? extraParts : undefined;

    // F121: Validate replyTo — must exist in the same thread
    let validatedReplyTo: string | undefined;
    // F121 enhancement: Auto-fill replyTo for A2A-triggered invocations.
    // Priority: 1) explicit replyTo  2) a2aTriggerMessageId (worklist path)  3) InvocationRecordStore fallback
    let autoFilledReplyTo: string | undefined;
    if (!replyTo) {
      // Worklist path: a2aTriggerMessageId is set by route-serial from WorklistEntry
      if (record.a2aTriggerMessageId) {
        autoFilledReplyTo = record.a2aTriggerMessageId;
      } else if (record.parentInvocationId && invocationRecordStore) {
        // Fallback path (standalone invocation): look up InvocationRecordStore
        const parentRecord = (await invocationRecordStore.get(record.parentInvocationId)) as {
          userMessageId?: string | null;
          threadId?: string | null;
        } | null;
        // P3-2 hardening: only trust userMessageId if parentRecord's threadId matches
        if (parentRecord?.userMessageId && (!parentRecord.threadId || parentRecord.threadId === effectiveThreadId)) {
          autoFilledReplyTo = parentRecord.userMessageId;
        }
      }
    }
    const effectiveReplyTo = replyTo ?? autoFilledReplyTo;
    if (effectiveReplyTo) {
      const parentMsg = await messageStore.getById(effectiveReplyTo);
      if (parentMsg && parentMsg.threadId === effectiveThreadId) {
        validatedReplyTo = effectiveReplyTo;
      } else if (replyTo) {
        // Only warn for explicit replyTo failures — auto-fill mismatches are expected
        // (e.g. cross-thread A2A where trigger is in a different thread)
        app.log.warn(
          { replyTo, effectiveThreadId, parentThreadId: parentMsg?.threadId },
          '[callbacks/post-message] replyTo rejected: not found or wrong thread',
        );
      }
    }

    // Store the message (scoped to the effective thread)
    // AC-B6-P1: When A2A mentions will be enqueued (invocationQueue available),
    // store with deliveryStatus:'queued' so ContextAssembler excludes this message
    // from other invocations' context until QueueProcessor.executeEntry marks it delivered.
    const hasA2AMentions = mentions.length > 0 && router && invocationRecordStore && effectiveThreadId;
    const willEnqueueToQueue = hasA2AMentions && opts.invocationQueue;
    const storedMsg = await messageStore.append({
      userId: record.userId,
      agentId: record.agentId,
      content: storedContent,
      mentions,
      ...(mentionsUser ? { mentionsUser } : {}),
      origin: 'callback',
      timestamp: Date.now(),
      threadId: effectiveThreadId,
      ...(extra ? { extra } : {}),
      ...(validatedReplyTo ? { replyTo: validatedReplyTo } : {}),
      ...(willEnqueueToQueue ? { deliveryStatus: 'queued' as const } : {}),
    });

    if (opts.threadStore && !willEnqueueToQueue) {
      try {
        await opts.threadStore.updateParticipantActivity(effectiveThreadId, record.agentId);
      } catch (activityErr) {
        app.log.warn(
          { agentId: record.agentId, threadId: effectiveThreadId, err: activityErr },
          '[callbacks/post-message] updateParticipantActivity failed',
        );
      }
    }

    // F121: Hydrate reply preview for broadcast
    const replyPreview = validatedReplyTo ? await hydrateReplyPreview(messageStore, validatedReplyTo) : undefined;

    socketManager.broadcastAgentMessage(
      {
        type: 'text',
        agentId: record.agentId,
        content: storedContent,
        origin: 'callback',
        messageId: storedMsg.id,
        // F52+F098-C1: Include crossPost + targetAgents in real-time broadcast
        ...(isCrossThread || validExplicitTargets.length
          ? {
              extra: {
                ...(isCrossThread
                  ? { crossPost: { sourceThreadId: record.threadId, sourceInvocationId: invocationId } }
                  : {}),
                ...(validExplicitTargets.length ? { targetAgents: validExplicitTargets } : {}),
              },
            }
          : {}),
        ...(mentionsUser ? { mentionsUser } : {}),
        ...(validatedReplyTo ? { replyTo: validatedReplyTo } : {}),
        ...(replyPreview ? { replyPreview } : {}),
        timestamp: Date.now(),
      },
      effectiveThreadId,
    );

    // #83: Broadcast each extracted rich block as SSE event for live rendering
    // P2 cloud-review: include messageId for frontend correlation
    for (const block of richBlocks) {
      socketManager.broadcastAgentMessage(
        {
          type: 'system_info' as const,
          agentId: record.agentId,
          content: JSON.stringify({ type: 'rich_block', block, messageId: storedMsg.id }),
          timestamp: Date.now(),
        },
        effectiveThreadId,
      );
    }

    // F27: Enqueue @mentioned cats into parent worklist (unified A2A path)
    if (mentions.length > 0 && router && invocationRecordStore && effectiveThreadId) {
      const a2aResult = await enqueueA2ATargets(
        {
          router,
          invocationRecordStore,
          socketManager,
          ...(invocationTracker ? { invocationTracker } : {}),
          ...(deliveryCursorStore ? { deliveryCursorStore } : {}),
          ...(queueProcessor ? { queueProcessor } : {}),
          ...(opts.invocationQueue ? { invocationQueue: opts.invocationQueue } : {}),
          log: app.log,
        },
        {
          targetAgents: mentions,
          content: storedContent,
          userId: record.userId,
          threadId: effectiveThreadId,
          triggerMessage: storedMsg,
          callerAgentId: senderAgentId,
          parentInvocationId: record.parentInvocationId,
        },
      );

      // AC-B6-P1: If message was stored as 'queued' but no targets were actually enqueued
      // (depth/dedup/full rejected all), recover by marking delivered to prevent ghost message.
      if (willEnqueueToQueue && a2aResult.enqueued.length === 0) {
        try {
          await messageStore.markDelivered?.(storedMsg.id, Date.now());
        } catch (err) {
          app.log.warn(
            { messageId: storedMsg.id, threadId: effectiveThreadId, err },
            '[AC-B6-P1] Failed to recover ghost message — markDelivered rejected (best-effort)',
          );
        }
      }
    }

    if (opts.outboundHook) {
      const frontendBase = resolveFrontendBaseUrl(process.env);
      const thread = await opts.threadStore?.get(effectiveThreadId);
      const threadMeta = {
        threadShortId: effectiveThreadId.slice(0, 15),
        threadTitle: thread?.title ?? undefined,
        deepLinkUrl: `${frontendBase}/threads/${effectiveThreadId}`,
      };
      opts.outboundHook
        .deliver(
          effectiveThreadId,
          storedContent,
          record.agentId,
          richBlocks.length > 0 ? richBlocks : undefined,
          threadMeta,
          'callback',
          validatedReplyTo,
        )
        .then(() => opts.outboundHook?.notifyDeliveryBatchDone?.(effectiveThreadId, true))
        .catch((err: unknown) => {
          app.log.error({ err, threadId: effectiveThreadId }, '[callbacks/post-message] Outbound delivery failed');
        });
    }

    return {
      status: 'ok',
      threadId: effectiveThreadId,
      ...(validatedReplyTo ? { replyTo: validatedReplyTo } : {}),
      ...(clientMessageId ? { clientMessageId } : {}),
    };
  });

  app.get('/api/callbacks/pending-mentions', async (request, reply) => {
    const parsed = pendingMentionsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Missing invocationId or callbackToken' };
    }

    const { invocationId, callbackToken, includeAcked } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const includeAckedValues = Array.isArray(includeAcked) ? includeAcked : includeAcked ? [includeAcked] : [];
    const shouldIncludeAcked = includeAckedValues.some((v) => v === '1' || v.toLowerCase() === 'true');

    // DIAG: ghost-thread bug — log which thread this invocation thinks it owns
    app.log.debug(
      {
        invocationId,
        agentId: record.agentId,
        threadId: record.threadId,
      },
      '[DIAG/ghost-thread] pending-mentions: polling',
    );

    // #77: Use mention ack cursor to filter already-processed mentions
    const agentId = createAgentId(record.agentId);
    const lastAckId = deliveryCursorStore
      ? await deliveryCursorStore.getMentionAckCursor(record.userId, agentId, record.threadId)
      : undefined;

    const rawMentions = shouldIncludeAcked
      ? await messageStore.getRecentMentionsFor(record.agentId, 20, record.userId, record.threadId)
      : await messageStore.getMentionsFor(record.agentId, 20, record.userId, record.threadId, lastAckId);
    // F35: Filter out whispers not intended for this agent
    const mentionViewer = { type: 'agent' as const, agentId };
    const mentions = rawMentions.filter((m) => canViewMessage(m, mentionViewer));
    return {
      mentions: mentions.map((item) => ({
        id: item.id,
        from: item.agentId ?? item.userId,
        message: item.content,
        timestamp: item.timestamp,
        ...(shouldIncludeAcked ? { acked: Boolean(lastAckId && item.id <= lastAckId) } : {}),
      })),
    };
  });

  // #77: POST /api/callbacks/ack-mentions — explicit ack with 4-way validation
  app.post('/api/callbacks/ack-mentions', async (request, reply) => {
    const parsed = ackMentionsSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, upToMessageId } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    if (!deliveryCursorStore) {
      reply.status(501);
      return { error: 'Mention ack not available (no cursor store)' };
    }

    const agentId = createAgentId(record.agentId);

    // Validation 1: existence
    const targetMsg = await messageStore.getById(upToMessageId);
    if (!targetMsg) {
      reply.status(400);
      return { error: 'upToMessageId does not exist' };
    }

    // Validation 2: ownership (userId + threadId + mentions agentId)
    if (targetMsg.userId !== record.userId) {
      reply.status(400);
      return { error: 'upToMessageId does not belong to current user session' };
    }
    if (targetMsg.threadId !== record.threadId) {
      reply.status(400);
      return { error: 'upToMessageId does not belong to current thread' };
    }
    if (!targetMsg.mentions.includes(agentId)) {
      reply.status(400);
      return { error: 'upToMessageId does not mention current agent' };
    }

    // Validation 3: monotonic (noop if backwards)
    const currentCursor = await deliveryCursorStore.getMentionAckCursor(record.userId, agentId, record.threadId);
    if (currentCursor && upToMessageId <= currentCursor) {
      return { status: 'noop', reason: 'already acknowledged' };
    }

    // Validation 4: window — upToMessageId must be within current pending window
    const pendingWindow = await messageStore.getMentionsFor(
      record.agentId,
      20,
      record.userId,
      record.threadId,
      currentCursor,
    );
    if (pendingWindow.length > 0) {
      const windowLastId = pendingWindow[pendingWindow.length - 1]?.id;
      if (upToMessageId > windowLastId) {
        reply.status(400);
        return {
          error: 'upToMessageId exceeds current pending window, ack only within fetched batch',
          windowLastId,
        };
      }
    }

    await deliveryCursorStore.ackMentionCursor(record.userId, agentId, record.threadId, upToMessageId);
    return { status: 'ok', ackedUpTo: upToMessageId };
  });

  app.get('/api/callbacks/thread-context', async (request, reply) => {
    const parsed = threadContextQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Missing invocationId or callbackToken' };
    }

    const { invocationId, callbackToken, limit, threadId: overrideThreadId, agentId: filterAgentId, keyword } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    if (filterAgentId && filterAgentId !== 'user' && !officeClawRegistry.has(filterAgentId)) {
      reply.status(400);
      return { error: `Unknown agentId filter: ${filterAgentId}` };
    }

    // F-Swarm-6: allow reading a different thread's context
    const effectiveThreadId = overrideThreadId ?? record.threadId;
    const normalizedKeyword = keyword?.toLowerCase();

    const requestedLimit = limit ?? 20;
    let needsPlayFilter = false;
    if (effectiveThreadId && threadStore) {
      const thread = await threadStore.get(effectiveThreadId);
      needsPlayFilter = !!thread && (thread.thinkingMode ?? 'debug') === 'play';
    }

    let filtered: Awaited<ReturnType<typeof messageStore.getByThread>>;

    // F35: Viewer for whisper filtering.
    // Debug mode: cats see everything (like 用户) — full transparency for debugging.
    // Play mode: cats only see whispers addressed to them — game privacy.
    const viewer = needsPlayFilter
      ? { type: 'agent' as const, agentId: createAgentId(record.agentId) }
      : { type: 'user' as const };
    const matchesExtraFilters = (item: Awaited<ReturnType<typeof messageStore.getByThread>>[number]): boolean => {
      if (filterAgentId) {
        if (filterAgentId === 'user') {
          if (item.agentId !== null) return false;
        } else if (item.agentId !== filterAgentId) {
          return false;
        }
      }
      if (normalizedKeyword && !item.content.toLowerCase().includes(normalizedKeyword)) {
        return false;
      }
      return true;
    };

    if (!needsPlayFilter) {
      // Normal mode: paginate backwards collecting visible messages until we
      // have enough or data is exhausted. This ensures whisper filtering
      // doesn't silently shrink the result set.
      const visible: Awaited<ReturnType<typeof messageStore.getByThread>> = [];
      const pageSize = Math.max(requestedLimit * 2, 50);
      let cursorTimestamp = Number.MAX_SAFE_INTEGER;
      let cursorId: string | undefined;

      while (visible.length < requestedLimit) {
        const batch = effectiveThreadId
          ? await messageStore.getByThreadBefore(effectiveThreadId, cursorTimestamp, pageSize, cursorId, record.userId)
          : await messageStore.getBefore(cursorTimestamp, pageSize, record.userId, cursorId);

        if (batch.length === 0) break;

        for (const item of batch) {
          if (isScheduledTriggerPlaceholder(item)) continue;
          if (!canViewMessage(item, viewer)) continue;
          if (!matchesExtraFilters(item)) continue;
          visible.push(item);
        }

        const oldest = batch[0]!;
        cursorTimestamp = oldest.timestamp;
        cursorId = oldest.id;
      }

      visible.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
      filtered = visible.slice(-requestedLimit);
    } else {
      // Play mode: paginate backwards collecting visible messages until we have enough
      // or data is exhausted. No fixed page cap — correctness over latency.
      const visible: Awaited<ReturnType<typeof messageStore.getByThread>> = [];
      const pageSize = Math.max(requestedLimit * 2, 50); // fetch in chunks, min 50
      let cursorTimestamp = Number.MAX_SAFE_INTEGER;
      let cursorId: string | undefined;

      while (visible.length < requestedLimit) {
        const batch = effectiveThreadId
          ? await messageStore.getByThreadBefore(effectiveThreadId, cursorTimestamp, pageSize, cursorId, record.userId)
          : await messageStore.getBefore(cursorTimestamp, pageSize, record.userId, cursorId);

        if (batch.length === 0) break; // no more messages

        for (const item of batch) {
          if (isScheduledTriggerPlaceholder(item)) continue;
          // F35: Skip whispers not intended for this agent
          if (!canViewMessage(item, viewer)) continue;
          // Visible in play mode: user messages, own agent's messages,
          // or other cats' messages that are NOT explicitly stream.
          // Legacy messages (no origin) are treated as visible for backward
          // compatibility — all new writes are tagged, so untagged = legacy callback.
          const isOtherCat = item.agentId && item.agentId !== record.agentId;
          if (!isOtherCat || item.origin !== 'stream') {
            if (!matchesExtraFilters(item)) continue;
            visible.push(item);
          }
        }

        // Move cursor to oldest message in batch (batch is ascending, first is oldest)
        const oldest = batch[0]!;
        cursorTimestamp = oldest.timestamp;
        cursorId = oldest.id;
      }

      // visible is accumulated in reverse-chronological page order but each page is ascending.
      // Re-sort ascending and take newest requestedLimit.
      visible.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
      filtered = visible.slice(-requestedLimit);
    }

    // F073 P1: Look up workflow SOP for resume capsule if thread has linked backlog item
    // P1-3: Only expose workflowSop when the thread belongs to this user
    let workflowSop: Record<string, unknown> | undefined;
    if (effectiveThreadId && threadStore && opts.workflowSopStore) {
      const thread = await threadStore.get(effectiveThreadId);
      const isOwnThread = thread && (thread.createdBy === record.userId || !overrideThreadId);
      if (isOwnThread && thread?.backlogItemId) {
        const sop = await opts.workflowSopStore.get(thread.backlogItemId);
        if (sop) {
          workflowSop = {
            featureId: sop.featureId,
            stage: sop.stage,
            batonHolder: sop.batonHolder,
            nextSkill: sop.nextSkill,
            resumeCapsule: sop.resumeCapsule,
            checks: sop.checks,
          };
        }
      }
    }

    return {
      // TD091: echo threadId so cats know which thread they're in
      threadId: effectiveThreadId,
      messages: filtered.map((item) => ({
        id: item.id,
        userId: item.userId,
        agentId: item.agentId,
        content: item.content,
        ...(item.contentBlocks ? { contentBlocks: item.contentBlocks } : {}),
        timestamp: item.timestamp,
      })),
      ...(workflowSop ? { workflowSop } : {}),
    };
  });

  app.get('/api/callbacks/list-threads', async (request, reply) => {
    const parsed = listThreadsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request query', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, limit, activeSince, keyword } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    if (!threadStore) {
      reply.status(503);
      return { error: 'Thread store not configured' };
    }

    const requestedLimit = limit ?? 20;
    let threads = await threadStore.list(record.userId);
    if (activeSince !== undefined) {
      threads = threads.filter((thread) => thread.lastActiveAt >= activeSince);
    }
    if (keyword) {
      const needle = keyword.toLowerCase();
      threads = threads.filter((thread) => {
        const title = (thread.title ?? '').toLowerCase();
        return title.includes(needle) || thread.id.toLowerCase().includes(needle);
      });
    }

    threads.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    const summaries = threads.slice(0, requestedLimit).map((thread) => ({
      threadId: thread.id,
      ...(thread.title ? { title: thread.title } : {}),
      lastActiveAt: thread.lastActiveAt,
      pinned: thread.pinned ?? false,
      messageCount: null,
      participants: thread.participants,
    }));

    return { threads: summaries };
  });

  app.get('/api/callbacks/feat-index', async (request, reply) => {
    const parsed = featIndexQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request query', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, featId, query, limit } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const normalizedFeatId = featId ? normalizeFeatId(featId) : undefined;
    const normalizedQuery = query?.trim().toLowerCase();
    const threadIdsByFeatId = await buildThreadIdsByFeatId(threadStore, backlogStore, record.userId, app.log);

    let items = await (featIndexProvider ? featIndexProvider() : readFeatIndexEntries());
    if (normalizedFeatId) {
      items = items.filter((item) => normalizeFeatId(item.featId) === normalizedFeatId);
    }
    if (normalizedQuery) {
      items = items.filter((item) => {
        const haystack = `${item.featId} ${item.name} ${item.status}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

    const requestedLimit = limit ?? 20;
    const sliced = items.slice(0, requestedLimit);
    return {
      items: sliced.map((item) => ({
        featId: item.featId,
        name: item.name,
        status: item.status,
        ...(item.keyDecisions ? { keyDecisions: item.keyDecisions } : {}),
        threadIds: threadIdsByFeatId.get(normalizeFeatId(item.featId)) ?? [],
      })),
    };
  });

  // TD091: PR tracking registration via MCP callback
  // Cats call this after `gh pr create` to register the PR for Layer 1 routing.
  // Server resolves threadId from invocation record — agent doesn't need to know it.
  const registerPrTrackingSchema = callbackAuthSchema.extend({
    repoFullName: z
      .string()
      .min(1)
      .regex(/^[^/]+\/[^/]+$/, 'Must be owner/repo format'),
    prNumber: z.number().int().positive(),
    agentId: z.string().min(1).optional(), // ignored — server uses record.agentId
  });

  app.post('/api/callbacks/register-pr-tracking', async (request, reply) => {
    if (!prTrackingStore) {
      reply.status(503);
      return { error: 'PR tracking not configured' };
    }

    const parsed = registerPrTrackingSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, repoFullName, prNumber } = parsed.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    // Use authoritative agentId from invocation record, not caller payload.
    // LLMs may pass wrong agentId (e.g. tool description examples bias).
    const agentId = record.agentId;

    // Cloud Codex P1-2: ownership protection — reject cross-user overwrites
    const existing = await prTrackingStore.get(repoFullName, prNumber);
    if (existing && existing.userId !== record.userId) {
      reply.status(409);
      return { error: `PR ${repoFullName}#${prNumber} already registered by another user` };
    }

    const entry = await prTrackingStore.register({
      repoFullName,
      prNumber,
      agentId,
      threadId: record.threadId,
      userId: record.userId,
    });

    return { status: 'ok', threadId: record.threadId, entry };
  });

  // F22: Rich block creation via MCP callback
  app.post('/api/callbacks/create-rich-block', async (request, reply) => {
    // #85 M2b: normalize block before Zod parse (type→kind, auto v:1)
    const rawBody = request.body as Record<string, unknown>;
    if (rawBody && typeof rawBody === 'object' && rawBody.block) {
      normalizeRichBlock(rawBody.block);
    }

    const parsed = createRichBlockSchema.safeParse(rawBody);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parsed.error.issues };
    }

    const { invocationId, callbackToken, block } = parsed.data;

    // F34-b P2: audio blocks must have at least url or text (R10: trim whitespace)
    if (block.kind === 'audio' && !block.url?.trim() && !block.text?.trim()) {
      reply.status(400);
      return { error: 'audio block requires url or text' };
    }

    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    if (!registry.isLatest(invocationId)) {
      return { status: 'stale_ignored' };
    }

    // F34-b: Resolve voice blocks (audio with text, no url) before buffering
    let resolvedBlock: RichBlock = block as unknown as RichBlock;
    const synthesizer = getVoiceBlockSynthesizer();
    if (synthesizer && block.kind === 'audio' && 'text' in block) {
      const resolved = await synthesizer.resolveVoiceBlocks([block as unknown as RichBlock], record.agentId as string);
      if (resolved.length > 0) resolvedBlock = resolved[0]!;
    }

    // Buffer the block — consumed at append time in route-serial/route-parallel
    const isNew = getRichBlockBuffer().add(record.threadId, record.agentId as string, resolvedBlock, invocationId);

    // Only broadcast new blocks (dedup retries at server to prevent frontend duplicates)
    if (isNew) {
      socketManager.broadcastAgentMessage(
        {
          type: 'system_info' as const,
          agentId: record.agentId,
          content: JSON.stringify({ type: 'rich_block', block: resolvedBlock }),
          timestamp: Date.now(),
        },
        record.threadId,
      );
    }

    return { status: 'ok' };
  });

  if (taskStore) {
    registerCallbackTaskRoutes(app, {
      registry,
      taskStore,
      socketManager,
      ...(threadStore ? { threadStore } : {}),
    });
  }

  if (opts.workflowSopStore && opts.backlogStore) {
    registerCallbackWorkflowSopRoutes(app, {
      registry,
      workflowSopStore: opts.workflowSopStore,
      backlogStore: opts.backlogStore,
    });
  }

  await registerCallbackMemoryRoutes(app, {
    registry,
    evidenceStore: opts.evidenceStore,
    markerQueue: opts.markerQueue,
    reflectionService: opts.reflectionService,
  });

  await registerCallbackSkillRoutes(app, { registry });

  // F126: Limb node callback routes
  if (opts.limbRegistry) {
    registerCallbackLimbRoutes(app, {
      limbRegistry: opts.limbRegistry,
      invocationRegistry: registry,
      pairingStore: opts.limbPairingStore,
    });
  }

  // F086: Multi-mention orchestration routes
  if (router && invocationRecordStore) {
    // outboundHook is late-bound after connector gateway bootstrap (index.ts).
    // Use a getter so flushResult() reads the live value at request time,
    // not the undefined snapshot captured during plugin registration.
    const multiMentionDeps: Parameters<typeof registerMultiMentionRoutes>[1] = {
      registry,
      messageStore,
      socketManager,
      get outboundHook() { return opts.outboundHook; },
      router,
      invocationRecordStore,
      ...(invocationTracker ? { invocationTracker } : {}),
      ...(opts.invocationQueue ? { invocationQueue: opts.invocationQueue } : {}),
      ...(queueProcessor ? { queueProcessor } : {}),
    };
    registerMultiMentionRoutes(app, multiMentionDeps);
    // Wire orchestrator into SocketManager for cancel propagation (P1-1 fix)
    if (typeof socketManager.setMultiMentionOrchestrator === 'function') {
      socketManager.setMultiMentionOrchestrator(getMultiMentionOrchestrator());
    }

    registerDispatchAgentTaskRoutes(app, {
      registry,
      dispatchTaskRegistry,
      ...(opts.invocationQueue ? { invocationQueue: opts.invocationQueue } : {}),
      ...(queueProcessor ? { queueProcessor } : {}),
    });
  }
};
