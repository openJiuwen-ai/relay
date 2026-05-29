/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Callback Documentation Routes
 * On-demand fallback endpoints for MCP callback API reference and rich block
 * usage rules. Primary source of truth is in office-claw-skills/ (Skills system).
 *
 * These endpoints are unauthenticated — they serve static documentation
 * that is safe to expose. Kept as fallback for when skills are not readable.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { RICH_BLOCK_RULES } from '../domains/agents/services/context/rich-block-rules.js';
import { resolveOfficeClawHostRoot } from '../utils/office-claw-root.js';

/** Strip YAML frontmatter (between --- delimiters) from markdown content. */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? content.slice(match[0].length).trimStart() : content;
}

/** Resolve path to a refs file in the skills refs directory. */
function refsPath(fileName: string): string {
  return resolve(resolveOfficeClawHostRoot(process.cwd()), 'office-claw-skills', 'refs', fileName);
}

/**
 * Register documentation endpoints (fallback for Skills system).
 * No auth required — these return static reference text.
 */
export const registerCallbackDocsRoutes: FastifyPluginAsync = async (app) => {
  // Rich block usage rules
  app.get('/api/callbacks/rich-block-rules', async (_request, reply) => {
    reply.header('cache-control', 'public, max-age=3600');
    return { rules: RICH_BLOCK_RULES };
  });

  // MCP callback instructions — reads refs file (SOT moved from skill to refs/)
  app.get('/api/callbacks/instructions', async (_request, reply) => {
    try {
      const raw = await readFile(refsPath('mcp-callbacks.md'), 'utf-8');
      const instructions = stripFrontmatter(raw);
      reply.header('cache-control', 'public, max-age=3600');
      return { instructions };
    } catch {
      reply.code(503);
      return { error: 'Refs file not readable. Ensure refs/mcp-callbacks.md exists in the skills directory.' };
    }
  });
};
