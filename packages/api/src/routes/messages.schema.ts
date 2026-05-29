/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Messages API Schemas
 * Zod schemas for message-related API validation.
 * Extracted from parse-multipart.ts for better organization.
 */

import { agentIdSchema } from '@openjiuwen/relay-shared';
import { z } from 'zod';

const interactiveAskSchema = z.preprocess((value) => {
  if (value === 'true') return true;
  return value;
}, z.boolean());

export const mentionRefSchema = z.object({
  catId: z.string().min(1).max(200),
  mention: z.string().min(1).max(200),
});

export const pptContextSchema = z
  .object({
    worktreeId: z.string().min(1).max(400).optional(),
    projectRoot: z.string().min(1).max(2000).optional(),
    pagesDir: z.string().min(1).max(2000),
    deckTitle: z.string().min(1).max(400).optional(),
    pptTemplateId: z.string().min(1).max(200).optional(),
  })
  .refine((data) => Boolean(data.projectRoot?.trim()), {
    message: 'pptContext requires projectRoot',
    path: ['projectRoot'],
  });

/**
 * Schema for POST /api/messages request body.
 * Used for both JSON and multipart form data validation.
 */
export const sendMessageSchema = z
  .object({
    content: z.string().min(1).max(10000),
    /** Legacy fallback only; preferred identity source is X-Office-Claw-User header. */
    userId: z.string().min(1).max(100).optional(),
    mentions: z.array(agentIdSchema()).optional(),
    mentionRefs: z.array(mentionRefSchema).optional(),
    threadId: z.string().min(1).max(100).optional(),
    /** Client-provided idempotency key (UUID). Optional — server generates one if absent. */
    idempotencyKey: z.string().uuid().optional(),
    /** Explicit per-agent resume hint for interrupted sessions. */
    resumeAgentId: agentIdSchema().optional(),
    /** F35: Message visibility. Default 'public'. 'whisper' requires whisperTo. */
    visibility: z.enum(['public', 'whisper']).optional(),
    /** F35: Whisper recipients. Required when visibility='whisper'. */
    whisperTo: z.array(agentIdSchema()).optional(),
    /** F39: Delivery mode. undefined = smart default (queue when active, immediate otherwise). */
    deliveryMode: z.enum(['immediate', 'queue', 'force']).optional(),
    /** AskUserQuestion: whether the current channel supports interactive structured questions. */
    interactive_ask: interactiveAskSchema.optional(),
    /** Hidden PPT targeting context for live HTML micro-tuning. */
    pptContext: pptContextSchema.optional(),
    /** Selected PPT style template for generation. */
    pptTemplateId: z.string().min(1).max(200).optional(),
    /** Rich content blocks (file URLs). Requires type + url, rest is passthrough. */
    contentBlocks: z.array(z.object({ type: z.string(), url: z.string().min(1) }).passthrough()).max(20).optional(),
  })
  .refine((data) => data.visibility !== 'whisper' || (data.whisperTo && data.whisperTo.length > 0), {
    message: 'whisperTo must be non-empty when visibility is whisper',
    path: ['whisperTo'],
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
