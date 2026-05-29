/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { IFeedbackStore, FeedbackRecord, FeedbackVote } from '../domains/agents/services/stores/ports/FeedbackStore.js';
import type { IMessageStore, StoredMessage } from '../domains/agents/services/stores/ports/MessageStore.js';
import { resolveUserId } from '../utils/request-identity.js';

export interface FeedbackRoutesOptions {
  feedbackStore: IFeedbackStore;
  messageStore: IMessageStore;
}

const submitFeedbackSchema = z
  .object({
    messageId: z.string().min(1).max(160),
    vote: z.union([z.literal(1), z.literal(-1)]),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function buildFeedbackRecord(message: StoredMessage, userId: string, vote: FeedbackVote, reason?: string): FeedbackRecord {
  const extra = message.extra as
    | {
        stream?: { invocationId?: string };
        trajectory?: FeedbackRecord['trajectory'];
        apmConversationReported?: boolean;
      }
    | undefined;
  const metadata = message.metadata as
    | (StoredMessage['metadata'] & {
        invocationId?: string;
        originalTraceId?: string;
        traceId?: string;
        catId?: string;
        trajectory?: FeedbackRecord['trajectory'];
        apmConversationReported?: boolean;
      })
    | undefined;

  return {
    threadId: message.threadId,
    messageId: message.id,
    userId,
    vote,
    timestamp: Date.now(),
    invocationId: getString(metadata?.invocationId) ?? getString(extra?.stream?.invocationId),
    originalTraceId: getString(metadata?.originalTraceId) ?? getString(metadata?.traceId),
    apmConversationReported: metadata?.apmConversationReported ?? extra?.apmConversationReported,
    trajectory: metadata?.trajectory ?? extra?.trajectory,
    model: getString(metadata?.model),
    provider: getString(metadata?.provider),
    catId: getString(metadata?.catId) ?? message.agentId ?? undefined,
    reason: vote === -1 ? (reason ?? null) : null,
  };
}

function toResponseRecord(record: FeedbackRecord, previousVote?: FeedbackVote | null, unchanged?: boolean) {
  return {
    vote: record.vote,
    ...(previousVote !== undefined ? { previousVote } : {}),
    ...(unchanged ? { unchanged: true } : {}),
    timestamp: record.timestamp,
    model: record.model,
    provider: record.provider,
    reason: record.reason,
  };
}

export const feedbackRoutes: FastifyPluginAsync<FeedbackRoutesOptions> = async (app, opts) => {
  app.post('/api/feedback', async (request, reply) => {
    const parsed = submitFeedbackSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parsed.error.issues };
    }

    const userId = resolveUserId(request, {});
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const message = await opts.messageStore.getById(parsed.data.messageId);
    if (!message || message.deletedAt || message._tombstone) {
      reply.status(404);
      return { error: 'Message not found', code: 'MESSAGE_NOT_FOUND' };
    }
    if (message.userId !== userId) {
      reply.status(403);
      return { error: 'Access denied', code: 'UNAUTHORIZED' };
    }
    if (message.agentId === null) {
      reply.status(400);
      return { error: 'Only assistant messages can receive feedback', code: 'INVALID_MESSAGE_TYPE' };
    }

    const existing = await opts.feedbackStore.get(message.threadId, message.id, userId);
    if (existing?.vote === parsed.data.vote) {
      return toResponseRecord(existing, existing.vote, true);
    }

    const record = buildFeedbackRecord(message, userId, parsed.data.vote, parsed.data.reason);
    await opts.feedbackStore.set(record);

    reply.status(existing ? 200 : 201);
    return toResponseRecord(record, existing?.vote ?? null);
  });

  app.get<{ Params: { threadId: string } }>('/api/feedback/by-thread/:threadId', async (request, reply) => {
    const userId = resolveUserId(request, {});
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const records = await opts.feedbackStore.getByThread(request.params.threadId, userId);
    const response: Record<string, { vote: FeedbackVote; reason: string | null; timestamp: number }> = {};
    for (const [messageId, record] of Object.entries(records)) {
      response[messageId] = {
        vote: record.vote,
        reason: record.reason,
        timestamp: record.timestamp,
      };
    }
    return response;
  });
};
