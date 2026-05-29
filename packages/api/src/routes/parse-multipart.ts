/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Multipart Request Parser
 * 解析 multipart/form-data 请求，提取文本字段和图片文件。
 * 从 messages.ts 提取，降低文件复杂度。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import type { AgentId, FileContent, MessageContent, TextContent } from '@openjiuwen/relay-shared';
import type { Multipart } from '@fastify/multipart';
import {
  ImageUploadError,
  saveUploadedAttachments,
  type UploadImageFile,
} from './image-upload.js';
import { sendMessageSchema } from './messages.schema.js';

export type ParsedMultipart =
  | {
      content: string;
      threadId?: string;
      idempotencyKey?: string;
      resumeAgentId?: string;
      mentionRefs?: Array<{ catId: AgentId; mention: string }>;
      contentBlocks: MessageContent[];
      visibility?: string;
      whisperTo?: string[];
      deliveryMode?: 'immediate' | 'queue' | 'force';
      interactive_ask?: boolean;
      pptContext?: import('../domains/ppt/ppt-context.js').PptMessageContext;
      pptTemplateId?: string;
    }
  | { error: string };

interface WorkspaceAttachmentTarget {
  kind: 'workspace';
  worktreeId: string;
  workspaceRoot: string;
  directoryPath: string;
}

type ResolveAttachmentTarget = (
  threadId: string,
) => Promise<WorkspaceAttachmentTarget | null | undefined> | WorkspaceAttachmentTarget | null | undefined;

async function saveWorkspaceAttachments(
  files: UploadImageFile[],
  target: WorkspaceAttachmentTarget,
): Promise<FileContent[]> {
  const outputDir = resolve(target.workspaceRoot, target.directoryPath || '.');
  await mkdir(outputDir, { recursive: true });

  const blocks: FileContent[] = [];
  for (const file of files) {
    const saved = await saveUploadedAttachments([file], outputDir);
    const first = saved[0];
    if (!first) continue;
    const relativePath = posix.join(
      target.directoryPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
      first.content.fileName,
    );
    const encodedPath = encodeURIComponent(relativePath || first.content.fileName);
    blocks.push({
      ...first.content,
      url: `/api/workspace/download?worktreeId=${encodeURIComponent(target.worktreeId)}&path=${encodedPath}`,
    });
  }

  return blocks;
}

/** Parse multipart request into validated message fields + contentBlocks */
export async function parseMultipart(
  request: { parts: () => AsyncIterableIterator<Multipart> },
  uploadDir: string,
  resolveAttachmentTarget?: ResolveAttachmentTarget,
): Promise<ParsedMultipart> {
  // F35: Use string | string[] to support multi-value fields like whisperTo
  const fields: Record<string, string | string[]> = {};
  const imageFiles: UploadImageFile[] = [];
  const attachmentFiles: UploadImageFile[] = [];

  for await (const part of request.parts()) {
    if (part.type === 'field' && typeof part.value === 'string') {
      const existing = fields[part.fieldname];
      if (existing !== undefined) {
        // Multi-value field (e.g. whisperTo): collect into array
        fields[part.fieldname] = Array.isArray(existing) ? [...existing, part.value] : [existing, part.value];
      } else {
        fields[part.fieldname] = part.value;
      }
    } else if (part.type === 'file') {
      // IMPORTANT: multipart file streams must be drained during iteration.
      // If we defer `toBuffer()` until after the loop, parser may block waiting
      // for this stream to be consumed and request hangs.
      const buffer = await part.toBuffer();
      const target = part.fieldname === 'images' ? imageFiles : attachmentFiles;
      target.push({
        filename: part.filename,
        mimetype: part.mimetype,
        toBuffer: async () => buffer,
      });
    }
  }

  // F35: Normalize whisperTo — single value becomes array for Zod validation
  if (fields.whisperTo !== undefined && !Array.isArray(fields.whisperTo)) {
    fields.whisperTo = [fields.whisperTo];
  }

  const parsedMentionRefs = (() => {
    const raw = fields.mentionRefs;
    if (typeof raw !== 'string') return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();

  const parsedPptContext = (() => {
    const raw = fields.pptContext;
    if (typeof raw !== 'string') return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();

  if (parsedMentionRefs === null) {
    return { error: 'Invalid form fields' };
  }

  if (parsedPptContext === null) {
    return { error: 'Invalid form fields' };
  }

  const parseResult = sendMessageSchema.safeParse({
    ...fields,
    ...(parsedMentionRefs ? { mentionRefs: parsedMentionRefs } : {}),
    ...(parsedPptContext ? { pptContext: parsedPptContext } : {}),
  });
  if (!parseResult.success) {
    return { error: 'Invalid form fields' };
  }

  const { content, threadId, idempotencyKey, resumeAgentId } = parseResult.data;
  const blocks: MessageContent[] = [{ type: 'text', text: content } as TextContent];

  if (imageFiles.length > 0) {
    return { error: '该附件类型暂不支持' };
  }

  if (attachmentFiles.length > 0) {
    try {
      const attachmentTarget =
        threadId && resolveAttachmentTarget ? await resolveAttachmentTarget(threadId) : null;
      if (attachmentTarget?.kind === 'workspace') {
        const saved = await saveWorkspaceAttachments(attachmentFiles, attachmentTarget);
        for (const file of saved) {
          blocks.push(file);
        }
      } else {
        const saved = await saveUploadedAttachments(attachmentFiles, uploadDir);
        for (const file of saved) {
          blocks.push(file.content as FileContent);
        }
      }
    } catch (err) {
      if (err instanceof ImageUploadError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  return {
    content,
    ...(threadId ? { threadId } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(resumeAgentId ? { resumeAgentId } : {}),
    ...(parseResult.data.mentionRefs
      ? { mentionRefs: parseResult.data.mentionRefs as Array<{ catId: AgentId; mention: string }> }
      : {}),
    ...(parseResult.data.visibility ? { visibility: parseResult.data.visibility } : {}),
    ...(parseResult.data.whisperTo ? { whisperTo: parseResult.data.whisperTo as string[] } : {}),
    ...(parseResult.data.deliveryMode ? { deliveryMode: parseResult.data.deliveryMode } : {}),
    ...(parseResult.data.interactive_ask ? { interactive_ask: true } : {}),
    ...(parseResult.data.pptContext ? { pptContext: parseResult.data.pptContext } : {}),
    ...(parseResult.data.pptTemplateId ? { pptTemplateId: parseResult.data.pptTemplateId } : {}),
    contentBlocks: blocks,
  };
}
