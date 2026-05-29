/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AskUserQuestionBridge } from '../domains/agents/services/ask/AskUserQuestionBridge.js';
import { getAskUserQuestionBridge } from '../domains/agents/services/ask/AskUserQuestionBridge.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';

export interface AskUserQuestionRoutesOptions {
  askUserQuestionBridge?: AskUserQuestionBridge;
}

const respondSchema = z.object({
  requestId: z.string().min(1),
  source: z.string().min(1).optional(),
  answers: z.array(
    z.object({
      question: z.string().min(1).optional(),
      selected_options: z.array(z.string()),
      custom_input: z.string().nullable().optional(),
    }),
  ),
});

export const askUserQuestionRoutes: FastifyPluginAsync<AskUserQuestionRoutesOptions> = async (app, opts) => {
  const askUserQuestionBridge = opts.askUserQuestionBridge ?? getAskUserQuestionBridge();

  app.get('/api/ask-user-question/pending', async (request, reply) => {
    const userId = resolveHeaderUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header)' };
    }

    const threadId = (request.query as Record<string, string>).threadId;
    const pending = askUserQuestionBridge.getPending(threadId);
    return { pending };
  });

  app.post('/api/ask-user-question/respond', async (request, reply) => {
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

    const { requestId, source, answers } = parseResult.data;
    const record = await askUserQuestionBridge.submitAnswer({
      localRequestId: requestId,
      source,
      answers: answers.map((answer) => ({
        ...(answer.question ? { question: answer.question } : {}),
        selected_options: answer.selected_options,
        ...(answer.custom_input ? { custom_input: answer.custom_input } : {}),
      })),
    });

    if (!record) {
      reply.status(404);
      return { error: 'Request not found or already resolved' };
    }

    return { status: 'ok', record };
  });
};
