/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Multi-Mention Callback Routes (F086 M1)
 *
 * POST /api/callbacks/multi-mention — Create + dispatch multi-agent question
 * GET  /api/callbacks/multi-mention-status — Poll request status
 */

import { type AgentId, type RichBlock, officeClawRegistry, createAgentId, DEFAULT_TIMEOUT_MINUTES } from '@openjiuwen/relay-shared';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InvocationQueue } from '../domains/agents/services/agents/invocation/InvocationQueue.js';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import type { InvocationTracker } from '../domains/agents/services/agents/invocation/InvocationTracker.js';
import {
  type MultiMentionCreateParams,
  MultiMentionOrchestrator,
} from '../domains/agents/services/agents/routing/MultiMentionOrchestrator.js';
import { parseIntent } from '../domains/agents/services/context/IntentParser.js';
import type { AgentRouter } from '../domains/agents/services/index.js';
import type { IInvocationRecordStore } from '../domains/agents/services/stores/ports/InvocationRecordStore.js';
import type { IMessageStore } from '../domains/agents/services/stores/ports/MessageStore.js';
import type { SocketManager } from '../infrastructure/websocket/index.js';
import { callbackAuthSchema } from './callback-auth-schema.js';

// ── Singleton orchestrator ───────────────────────────────────────────
let globalOrchestrator: MultiMentionOrchestrator | undefined;

export function getMultiMentionOrchestrator(): MultiMentionOrchestrator {
  if (!globalOrchestrator) globalOrchestrator = new MultiMentionOrchestrator();
  return globalOrchestrator;
}

/** For test reset */
export function resetMultiMentionOrchestrator(): void {
  globalOrchestrator = undefined;
}

// ── Schema ───────────────────────────────────────────────────────────
const multiMentionSchema = callbackAuthSchema.extend({
  targets: z.array(z.string().min(1)).min(1).max(3),
  question: z.string().min(1).max(5000),
  callbackTo: z.string().min(1),
  context: z.string().max(5000).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
  timeoutMinutes: z.number().int().min(3).max(20).optional(),
  searchEvidenceRefs: z.array(z.string()).optional(),
  overrideReason: z.string().min(1).max(500).optional(),
  triggerType: z.string().optional(),
});

const multiMentionStatusSchema = callbackAuthSchema.extend({
  requestId: z.string().min(1),
});

// ── Deps ─────────────────────────────────────────────────────────────
export interface MultiMentionRouteDeps {
  registry: InvocationRegistry;
  messageStore: IMessageStore;
  socketManager: SocketManager;
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
  router: AgentRouter;
  invocationRecordStore: IInvocationRecordStore;
  invocationTracker?: InvocationTracker | undefined;
  /** F122B B6: InvocationQueue for unified dispatch */
  invocationQueue?: Pick<InvocationQueue, 'enqueue' | 'countAgentEntriesForThread' | 'hasQueuedAgent'>;
  /** F122B B6: QueueProcessor for execution + response hook */
  queueProcessor?: {
    tryAutoExecute?(threadId: string): Promise<void>;
    registerEntryCompleteHook?(
      entryId: string,
      hook: (entryId: string, status: 'succeeded' | 'failed' | 'canceled', responseText: string) => void,
    ): void;
    unregisterEntryCompleteHook?(entryId: string): void;
  };
}

// ── Timeout tracking ────────────────────────────────────────────────
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleTimeout(requestId: string, timeoutMinutes: number, log: FastifyBaseLogger): void {
  const ms = timeoutMinutes * 60_000;
  const timer = setTimeout(() => {
    const orch = getMultiMentionOrchestrator();
    log.info({ requestId, timeoutMinutes }, '[F086] Multi-mention timeout fired');
    orch.handleTimeout(requestId);
    activeTimers.delete(requestId);
  }, ms);
  // Unref so it doesn't keep the process alive
  timer.unref();
  activeTimers.set(requestId, timer);
}

function cancelTimeout(requestId: string): void {
  const timer = activeTimers.get(requestId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(requestId);
  }
}

// ── Dispatch via InvocationQueue (F122B B6) ─────────────────────────
function dispatchViaQueue(
  deps: MultiMentionRouteDeps,
  requestId: string,
  targetAgentIds: AgentId[],
  question: string,
  context: string | undefined,
  threadId: string,
  userId: string,
  initiator: AgentId,
  log: FastifyBaseLogger,
): void {
  const { invocationQueue, queueProcessor } = deps;
  if (!invocationQueue || !queueProcessor) return;

  const orch = getMultiMentionOrchestrator();

  const messageContent = [`[共识总结 from ${initiator}]`, question, ...(context ? ['---', context] : [])].join(
    '\n\n',
  );

  for (const agentId of targetAgentIds) {
    const MAX_MM_DEPTH = 10;
    if (invocationQueue.countAgentEntriesForThread(threadId) >= MAX_MM_DEPTH) {
      log.warn({ threadId, requestId, agentId }, '[F122B B6] multi-mention: depth limit reached');
      break;
    }
    if (invocationQueue.hasQueuedAgent(threadId, agentId)) {
      log.info({ threadId, requestId, agentId }, '[F122B B6] multi-mention: skipping duplicate agent entry');
      continue;
    }

    const result = invocationQueue.enqueue({
      threadId,
      userId,
      content: messageContent,
      source: 'agent',
      targetAgents: [agentId],
      intent: 'execute',
      autoExecute: true,
      callerAgentId: initiator,
    });

    if ((result.outcome === 'enqueued' || result.outcome === 'merged') && result.entry) {
      queueProcessor.registerEntryCompleteHook?.(result.entry.id, (_entryId, status, responseText) => {
        if (status === 'canceled') {
          const newStatus = orch.recordFailure(requestId, agentId, '[dispatch canceled]');
          log.info({ requestId, agentId, newStatus }, '[F122B B6] multi-mention queue entry canceled');
          if (newStatus === 'done') {
            cancelTimeout(requestId);
            void flushResult(deps, requestId, threadId, userId, log);
          }
          return;
        }
        const finalResponse = responseText || (status === 'failed' ? '[dispatch error]' : '');
        const newStatus =
          status === 'failed'
            ? orch.recordFailure(requestId, agentId, finalResponse)
            : orch.recordResponse(requestId, agentId, finalResponse);
        log.info(
          { requestId, agentId, status, newStatus, responseLength: finalResponse.length },
          '[F122B B6] multi-mention queue response recorded',
        );
        if (newStatus === 'done') {
          cancelTimeout(requestId);
          void flushResult(deps, requestId, threadId, userId, log);
        }
      });
    }
  }

  void queueProcessor.tryAutoExecute?.(threadId);
}

// ── Legacy dispatch (direct routeExecution, fallback) ────────────────
async function dispatchToTarget(
  deps: MultiMentionRouteDeps,
  requestId: string,
  targetAgentId: AgentId,
  question: string,
  context: string | undefined,
  threadId: string,
  userId: string,
  initiator: AgentId,
  log: FastifyBaseLogger,
): Promise<void> {
  const orch = getMultiMentionOrchestrator();
  const { router, invocationRecordStore, socketManager, invocationTracker } = deps;

  // Build the message for this target
  // Include multi-mention context as structured prefix so the target agent
  // understands the request is from another agent, not the user directly.
  const messageContent = [`[共识总结 from ${initiator}]`, question, ...(context ? ['---', context] : [])].join(
    '\n\n',
  );

  const intent = parseIntent(messageContent, 1);

  // Collect response text from the routing execution
  let responseText = '';
  const toolsUsed: string[] = [];
  let invocationId: string | undefined;

  // F122 AC-A9: Occupy tracker slot BEFORE create to close TOCTOU window.
  // Entire create/execute lifecycle wrapped in outer try/finally for guaranteed release.
  // F108 slot-aware: multi-mention dispatches register per (threadId, agentId) slot.
  const controller = invocationTracker?.start(threadId, targetAgentId, userId, [targetAgentId]) ?? new AbortController();
  try {
    if (controller.signal.aborted) {
      const newStatus = orch.recordFailure(requestId, targetAgentId, '[dispatch canceled]');
      log.info({ requestId, targetAgentId, newStatus }, '[F086] Multi-mention dispatch canceled before start');
      if (newStatus === 'done') {
        cancelTimeout(requestId);
        await flushResult(deps, requestId, threadId, userId, log);
      }
      return;
    }

    // Create invocation record (now protected by tracker slot)
    const createResult = await invocationRecordStore.create({
      threadId,
      userId,
      targetAgents: [targetAgentId],
      intent: intent.intent,
      idempotencyKey: `mm-${requestId}-${targetAgentId}`,
    });

    if (createResult.outcome === 'duplicate') {
      log.info({ requestId, targetAgentId }, '[F086] Dispatch skipped: duplicate invocation');
      return; // finally will release slot (AC-A12)
    }

    invocationId = createResult.invocationId;

    await invocationRecordStore.update(invocationId, {
      status: 'running',
    });

    orch.registerDispatch(requestId, targetAgentId, controller);

    let governanceErrorCode: string | undefined;

    try {
      // #768: Defer intent_mode broadcast until CLI produces first event.
      let intentModeBroadcast = false;

      for await (const msg of router.routeExecution(
        userId,
        messageContent,
        threadId,
        invocationId,
        [targetAgentId],
        intent,
        { signal: controller.signal, parentInvocationId: invocationId, gatewayIdentity: { userId } },
      )) {
        // #768: Broadcast intent_mode on first CLI event — proves CLI is alive.
        if (!intentModeBroadcast) {
          socketManager.broadcastToRoom(`thread:${threadId}`, 'intent_mode', {
            threadId,
            mode: intent.intent,
            targetAgents: [targetAgentId],
            invocationId: createResult.invocationId,
          });
          intentModeBroadcast = true;
        }
        if (controller.signal.aborted) break;

        // Capture text + tool usage for response aggregation
        if (msg.agentId === targetAgentId) {
          if (msg.type === 'text' && msg.content) {
            responseText += msg.content;
          } else if (msg.type === 'tool_use' && msg.toolName) {
            toolsUsed.push(msg.toolName);
          }
        }
        if (msg.type === 'done' && msg.errorCode) {
          governanceErrorCode = msg.errorCode;
        }

        socketManager.broadcastAgentMessage({ ...msg, invocationId }, threadId);
      }

      const finalInvocationStatus = controller.signal.aborted
        ? 'canceled'
        : governanceErrorCode
          ? 'failed'
          : 'succeeded';
      await invocationRecordStore.update(invocationId, {
        status: finalInvocationStatus,
        ...(governanceErrorCode ? { error: governanceErrorCode } : {}),
      });
    } finally {
      orch.unregisterDispatch(requestId, targetAgentId);
    }

    // Record aborted / policy-blocked dispatches as failed so the multi-mention
    // request itself can still converge to a terminal state.
    if (controller.signal.aborted || governanceErrorCode) {
      const newStatus = orch.recordFailure(
        requestId,
        targetAgentId,
        controller.signal.aborted ? '[dispatch canceled]' : `[policy blocked: ${governanceErrorCode}]`,
      );
      log.info(
        { requestId, targetAgentId, governanceErrorCode, newStatus },
        '[F086] Multi-mention dispatch aborted/blocked recorded as failed',
      );
      if (newStatus === 'done') {
        cancelTimeout(requestId);
        await flushResult(deps, requestId, threadId, userId, log);
      }
      return;
    }

    // If no text captured but tools were used, generate a tool-usage summary
    // so the aggregation doesn't show "(空回答)" for cats that responded via tools
    const finalResponse =
      responseText || (toolsUsed.length > 0 ? `(通过工具回复: ${[...new Set(toolsUsed)].join(', ')})` : '');

    // Record response in orchestrator
    const newStatus = orch.recordResponse(requestId, targetAgentId, finalResponse);
    log.info(
      { requestId, targetAgentId, newStatus, responseLength: finalResponse.length, toolsUsed: toolsUsed.length },
      '[F086] Multi-mention response recorded',
    );

    // If done (all responded), cancel timeout and flush
    if (newStatus === 'done') {
      cancelTimeout(requestId);
      await flushResult(deps, requestId, threadId, userId, log);
    }
  } catch (err) {
    log.error(
      { requestId, targetAgentId, err: err instanceof Error ? err.message : String(err) },
      '[F086] Multi-mention dispatch failed for target',
    );
    if (invocationId) {
      try {
        await invocationRecordStore.update(invocationId, {
          status: controller.signal.aborted ? 'canceled' : 'failed',
          error: controller.signal.aborted ? undefined : 'dispatch_error',
        });
      } catch (updateErr) {
        log.warn(
          {
            requestId,
            targetAgentId,
            invocationId,
            err: updateErr instanceof Error ? updateErr.message : String(updateErr),
          },
          '[F086] Failed to converge InvocationRecord after dispatch error',
        );
      }
    }
    const newStatus = orch.recordFailure(requestId, targetAgentId, `[dispatch error: ${err instanceof Error ? err.message : String(err)}]`);
    if (newStatus === 'done') {
      cancelTimeout(requestId);
      await flushResult(deps, requestId, threadId, userId, log);
    }
  } finally {
    // F122 AC-A7: unconditional slot release — covers early return, registerDispatch
    // throw, routeExecution crash, and normal completion. InvocationTracker.complete()
    // is idempotent (no-op if slot already removed or controller doesn't match).
    invocationTracker?.complete(threadId, targetAgentId, controller);
  }
}

// ── Result flush ─────────────────────────────────────────────────────
async function flushResult(
  deps: MultiMentionRouteDeps,
  requestId: string,
  threadId: string,
  userId: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const orch = getMultiMentionOrchestrator();
  const result = orch.getResult(requestId);
  const { messageStore, outboundHook, socketManager } = deps;

  // Build aggregated result message
  const lines: string[] = [`## 共识总结结果汇总`, '', `**问题**: ${result.request.question}`, ''];

  for (const resp of result.responses) {
    const entry = officeClawRegistry.tryGet(resp.agentId);
    const agentName = entry?.config.displayName ?? resp.agentId;
    if (resp.status === 'received') {
      lines.push(`### ${agentName}`);
      lines.push(resp.content || '(空回答)');
      lines.push('');
    } else {
      lines.push(`### ${agentName} — ${resp.status === 'timeout' ? '超时' : '失败'}`);
      lines.push('');
    }
  }

  const content = lines.join('\n');

  // F098-C2: Include initiator + targets metadata for frontend direction rendering
  const connectorSource = {
    connector: 'multi-mention-result' as const,
    label: '共识总结结果',
    icon: 'users',
    meta: {
      initiator: result.request.callbackTo,
      targets: [...result.request.targets],
    },
  };

  // Post aggregated result to thread (with source for persistence)
  const stored = await messageStore.append({
    userId,
    agentId: result.request.callbackTo,
    content,
    mentions: [],
    timestamp: Date.now(),
    threadId,
    source: connectorSource,
  });

  socketManager.broadcastToRoom(`thread:${threadId}`, 'connector_message', {
    threadId,
    message: {
      id: stored.id,
      type: 'connector',
      content,
      source: connectorSource,
      timestamp: stored.timestamp,
    },
  });

  if (outboundHook) {
    try {
      await outboundHook.deliver(threadId, content, result.request.callbackTo, undefined, undefined, 'callback', undefined, {
        headerTitle: '共识总结结果汇总',
        suppressAgentPrefix: true,
        suppressOriginDecoration: true,
        stripLeadingHeaderFromFormattedBody: true,
      });
      await outboundHook.notifyDeliveryBatchDone?.(threadId, true);
    } catch (err) {
      log.warn({ err, threadId, requestId }, '[F086] Multi-mention outbound delivery failed');
    }
  }

  log.info(
    {
      requestId,
      threadId,
      status: result.request.status,
      responseCount: result.responses.filter((r) => r.status === 'received').length,
      totalTargets: result.request.targets.length,
    },
    '[F086] Multi-mention result flushed',
  );
}

// ── Route registration ───────────────────────────────────────────────
export function registerMultiMentionRoutes(app: FastifyInstance, deps: MultiMentionRouteDeps): void {
  const { registry } = deps;

  // POST /api/callbacks/multi-mention
  app.post<{ Body: z.infer<typeof multiMentionSchema> }>('/api/callbacks/multi-mention', async (request, reply) => {
    const body = multiMentionSchema.parse(request.body);

    // Auth: verify invocation
    const record = registry.verify(body.invocationId, body.callbackToken);
    if (!record) {
      return reply.status(401).send({ error: 'Invalid or expired callback credentials' });
    }

    // Validate all targets are registered cats
    const targetAgentIds: AgentId[] = [];
    for (const target of body.targets) {
      if (!officeClawRegistry.has(target)) {
        return reply.status(400).send({ error: `Unknown agent: ${target}` });
      }
      targetAgentIds.push(createAgentId(target));
    }

    // Validate callbackTo
    if (!officeClawRegistry.has(body.callbackTo)) {
      return reply.status(400).send({ error: `Unknown callbackTo agent: ${body.callbackTo}` });
    }

    const orch = getMultiMentionOrchestrator();
    const callerAgentId = record.agentId;

    // Anti-cascade guard: reject if caller is a target in an active multi-mention
    if (orch.isActiveTarget(record.threadId, callerAgentId)) {
      return reply.status(409).send({
        error: 'Anti-cascade: caller is an active multi-mention target',
        hint: 'Cannot create multi-mention while responding to one',
      });
    }

    const createParams = {
      threadId: record.threadId,
      initiator: callerAgentId,
      callbackTo: createAgentId(body.callbackTo),
      targets: targetAgentIds,
      question: body.question,
      timeoutMinutes: body.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES,
      ...(body.context ? { context: body.context } : {}),
      ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      ...(body.triggerType ? { triggerType: body.triggerType as MultiMentionCreateParams['triggerType'] } : {}),
      ...(body.searchEvidenceRefs ? { searchEvidenceRefs: body.searchEvidenceRefs } : {}),
      ...(body.overrideReason ? { overrideReason: body.overrideReason } : {}),
    } satisfies MultiMentionCreateParams;

    const mmRequest = orch.create(createParams);

    // If already created (idempotency), return existing
    if (mmRequest.status !== 'pending') {
      return reply.send({ requestId: mmRequest.id, status: mmRequest.status });
    }

    // Start + schedule timeout
    orch.start(mmRequest.id);
    scheduleTimeout(mmRequest.id, mmRequest.timeoutMinutes, request.log);

    // Dispatch to all targets in parallel (fire and forget)
    // F122B B6: Use InvocationQueue when available, legacy direct dispatch as fallback
    if (deps.invocationQueue && deps.queueProcessor) {
      dispatchViaQueue(
        deps,
        mmRequest.id,
        targetAgentIds,
        body.question,
        body.context,
        record.threadId,
        record.userId,
        callerAgentId,
        request.log,
      );
    } else {
      for (const targetAgentId of targetAgentIds) {
        void dispatchToTarget(
          deps,
          mmRequest.id,
          targetAgentId,
          body.question,
          body.context,
          record.threadId,
          record.userId,
          callerAgentId,
          request.log,
        );
      }
    }

    request.log.info(
      {
        requestId: mmRequest.id,
        targets: body.targets,
        callbackTo: body.callbackTo,
        timeoutMinutes: mmRequest.timeoutMinutes,
        triggerType: body.triggerType,
        hasSearchEvidence: Boolean(body.searchEvidenceRefs?.length),
        hasOverrideReason: Boolean(body.overrideReason),
      },
      '[F086] Multi-mention request created + dispatched',
    );

    return reply.send({ requestId: mmRequest.id, status: mmRequest.status });
  });

  // GET /api/callbacks/multi-mention-status
  app.get<{ Querystring: z.infer<typeof multiMentionStatusSchema> }>(
    '/api/callbacks/multi-mention-status',
    async (request, reply) => {
      const query = multiMentionStatusSchema.parse(request.query);

      const record = registry.verify(query.invocationId, query.callbackToken);
      if (!record) {
        return reply.status(401).send({ error: 'Invalid or expired callback credentials' });
      }

      const orch = getMultiMentionOrchestrator();
      try {
        const result = orch.getResult(query.requestId);
        return reply.send({
          requestId: query.requestId,
          status: result.request.status,
          responses: result.responses.map((r) => ({
            agentId: r.agentId,
            status: r.status,
            contentLength: r.content.length,
          })),
        });
      } catch {
        return reply.status(404).send({ error: 'Multi-mention request not found' });
      }
    },
  );
}
