/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Message Zod Schemas
 * 用于运行时验证的 Zod schemas
 */

import { z } from 'zod';
import { agentIdSchema } from '../registry/agent-id-schema.js';

/**
 * Message sender schema - discriminated union
 *
 * Note: agentId uses z.string().refine() (via agentIdSchema) instead of z.enum()
 * because route modules are imported before the registry is populated.
 * z.string().refine() defers validation to request time.
 *
 * Consequence: discriminatedUnion requires z.literal or z.enum for the
 * discriminator. Since we're inside a discriminated union on 'type',
 * agentId validation happens at the field level, not the discriminator.
 */
export const MessageSenderSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user'),
    userId: z.string().min(1),
  }),
  z.object({
    type: z.literal('agent'),
    agentId: agentIdSchema(),
  }),
]);

/**
 * Text content schema
 */
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * Image content schema
 */
export const ImageContentSchema = z.object({
  type: z.literal('image'),
  url: z.string().min(1),
  alt: z.string().optional(),
});

/**
 * File content schema
 */
export const FileContentSchema = z.object({
  type: z.literal('file'),
  url: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().optional(),
  fileSize: z.number().int().min(0).optional(),
});

/**
 * Code content schema
 */
export const CodeContentSchema = z.object({
  type: z.literal('code'),
  code: z.string(),
  language: z.string().optional(),
  filename: z.string().optional(),
});

/**
 * Tool call content schema
 */
export const ToolCallContentSchema = z.object({
  type: z.literal('tool_call'),
  toolName: z.string().min(1),
  toolId: z.string().min(1),
  input: z.record(z.unknown()),
});

/**
 * Tool result content schema
 */
export const ToolResultContentSchema = z.object({
  type: z.literal('tool_result'),
  toolId: z.string().min(1),
  result: z.unknown(),
  isError: z.boolean().optional(),
});

/**
 * Message content schema - discriminated union
 */
export const MessageContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ImageContentSchema,
  FileContentSchema,
  CodeContentSchema,
  ToolCallContentSchema,
  ToolResultContentSchema,
]);

/**
 * Message status schema
 */
export const MessageStatusSchema = z.enum(['pending', 'streaming', 'complete', 'error']);

/**
 * Complete message schema
 */
export const MessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  sender: MessageSenderSchema,
  content: z.array(MessageContentSchema),
  status: MessageStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Send message request schema
 */
export const SendMessageRequestSchema = z.object({
  threadId: z.string().min(1),
  content: z.array(MessageContentSchema).min(1),
  targetAgentId: agentIdSchema().optional(),
});

/**
 * Inferred type from schema
 */
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
