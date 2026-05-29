/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { InvocationQueue } from '../domains/agents/services/agents/invocation/InvocationQueue.js';
import type { InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import { DispatchTaskRegistry } from '../domains/agents/services/agents/routing/DispatchTaskRegistry.js';
import { resolveTargetAgent } from '../domains/agents/services/agents/routing/resolve-target-agent.js';
import { callbackAuthSchema } from './callback-auth-schema.js';

const dispatchAgentTaskSchema = callbackAuthSchema.extend({
  target: z.string().trim().min(1).max(200),
  task: z.string().trim().min(1).max(10000),
  awaitResponse: z.boolean().optional(),
  timeoutMs: z.number().int().min(1_000).max(300_000).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export interface DispatchAgentTaskRouteDeps {
  registry: InvocationRegistry;
  dispatchTaskRegistry: DispatchTaskRegistry;
  invocationQueue?: Pick<InvocationQueue, 'enqueue' | 'hasQueuedAgent'>;
  queueProcessor?: {
    tryAutoExecute?(threadId: string): Promise<void>;
    registerEntryCompleteHook?(
      entryId: string,
      hook: (entryId: string, status: 'succeeded' | 'failed' | 'canceled', responseText: string) => void,
    ): void;
    unregisterEntryCompleteHook?(entryId: string): void;
  };
}

export function registerDispatchAgentTaskRoutes(app: FastifyInstance, deps: DispatchAgentTaskRouteDeps): void {
  const { registry, dispatchTaskRegistry, invocationQueue, queueProcessor } = deps;

  app.post<{ Body: z.infer<typeof dispatchAgentTaskSchema> }>(
    '/api/callbacks/dispatch-agent-task',
    async (request, reply) => {
      const body = dispatchAgentTaskSchema.parse(request.body);
      const record = registry.verify(body.invocationId, body.callbackToken);
      if (!record) {
        return reply.status(401).send({ error: 'Invalid or expired callback credentials' });
      }

      if (!invocationQueue || !queueProcessor?.registerEntryCompleteHook) {
        return reply.send({
          ok: false,
          phase: 'dispatch',
          requestId: null,
          target: body.target,
          resolvedTargetAgentId: null,
          status: 'failed',
          errorCode: 'dispatch_failed',
          message: 'Reliable agent dispatch is not configured on this server.',
        });
      }

      const resolved = resolveTargetAgent(body.target);
      if (!resolved.ok) {
        return reply.send({
          ok: false,
          phase: 'resolution',
          requestId: null,
          target: body.target,
          resolvedTargetAgentId: null,
          status: 'failed',
          errorCode: resolved.errorCode,
          message: resolved.message,
          ...(resolved.candidates ? { candidates: resolved.candidates } : {}),
        });
      }

      const created = dispatchTaskRegistry.create({
        sourceInvocationId: body.invocationId,
        threadId: record.threadId,
        target: body.target,
        resolvedTargetAgentId: resolved.agentId,
        ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      });

      if (!created.created) {
        const existing = body.awaitResponse === false
          ? created.record
          : await dispatchTaskRegistry.waitForTerminal(created.record.requestId, body.timeoutMs ?? 120_000);
        return reply.send(formatDispatchResponse(existing));
      }

      if (invocationQueue.hasQueuedAgent(record.threadId, resolved.agentId)) {
        const failed = dispatchTaskRegistry.markFailed(
          created.record.requestId,
          'dispatch_failed',
          `Target agent "${resolved.displayName}" already has a queued task in this thread.`,
        );
        return reply.send(formatDispatchResponse(failed));
      }

      const dispatchInstructions =
        body.awaitResponse === false
          ? [
              `[Task dispatch from ${record.agentId}]`,
              `You are handling a task delegated by ${record.agentId}.`,
              'You may complete the task normally.',
            ]
          : [
              `[Task dispatch from ${record.agentId}]`,
              `You are handling a task delegated by ${record.agentId}.`,
              `This invocation is one step in an orchestrated multi-round workflow controlled by ${record.agentId}.`,
              'Important collaboration rule:',
              `- Do not dispatch, mention, or hand the task back to ${record.agentId} inside this invocation.`,
              '- Return your result directly to the caller in this invocation.',
              '- If the output needs revision, return a concise evaluation plus concrete revision instructions.',
              `- Let ${record.agentId} decide whether to launch the next revision pass after reading your result.`,
              '- Prefer a structured response that the caller can use for the next round.',
              'Recommended response format:',
              '- Verdict: pass | revise',
              '- Summary: one short paragraph',
              '- Issues: bullet list of concrete problems',
              '- Revision Instructions: bullet list of exact changes to make next',
              '- Confidence: low | medium | high',
              '- Finish this invocation after returning your evaluation or requested changes.',
            ];
      const messageContent = [...dispatchInstructions, body.task].join('\n\n');
      const enqueueResult = invocationQueue.enqueue({
        threadId: record.threadId,
        userId: record.userId,
        content: messageContent,
        source: 'agent',
        targetAgents: [resolved.agentId],
        intent: 'execute',
        autoExecute: true,
        callerAgentId: record.agentId,
      });

      if ((enqueueResult.outcome !== 'enqueued' && enqueueResult.outcome !== 'merged') || !enqueueResult.entry) {
        const failed = dispatchTaskRegistry.markFailed(
          created.record.requestId,
          'dispatch_failed',
          `Failed to dispatch task to target agent "${resolved.displayName}".`,
        );
        return reply.send(formatDispatchResponse(failed));
      }

      dispatchTaskRegistry.markQueued(created.record.requestId);

      queueProcessor.registerEntryCompleteHook(enqueueResult.entry.id, (_entryId, status, responseText) => {
        if (status === 'succeeded') {
          dispatchTaskRegistry.markSucceeded(created.record.requestId, responseText);
          return;
        }
        const message =
          status === 'canceled'
            ? `Target agent "${resolved.displayName}" canceled the dispatched task.`
            : `Target agent "${resolved.displayName}" failed while executing the dispatched task.`;
        dispatchTaskRegistry.markFailed(
          created.record.requestId,
          'target_invocation_failed',
          message,
          responseText,
        );
      });

      void queueProcessor.tryAutoExecute?.(record.threadId);

      if (body.awaitResponse === false) {
        return reply.send(formatDispatchResponse(dispatchTaskRegistry.get(created.record.requestId)!));
      }

      const terminal = await dispatchTaskRegistry.waitForTerminal(created.record.requestId, body.timeoutMs ?? 120_000);
      return reply.send(formatDispatchResponse(terminal));
    },
  );
}

function formatDispatchResponse(record: {
  requestId: string;
  phase: string;
  status: string;
  target: string;
  resolvedTargetAgentId?: string;
  responseText: string;
  errorCode?: string;
  message?: string;
}): Record<string, unknown> {
  const ok = record.status === 'accepted' || record.status === 'queued' || record.status === 'running' || record.status === 'succeeded';
  return {
    ok,
    phase: record.phase,
    requestId: record.requestId,
    target: record.target,
    resolvedTargetAgentId: record.resolvedTargetAgentId ?? null,
    status: record.status,
    ...(record.responseText ? { responseText: record.responseText } : {}),
    ...(record.errorCode ? { errorCode: record.errorCode } : {}),
    ...(record.message ? { message: record.message } : {}),
  };
}
