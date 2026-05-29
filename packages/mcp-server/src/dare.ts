#!/usr/bin/env node
/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * OfficeClaw MCP Server — Compact entrypoint for narrow-context models.
 *
 * Registers all tools with one-line descriptions instead of verbose
 * GOTCHA/TIP/WORKFLOW paragraphs. This reduces tool definition payload
 * from ~100K+ tokens to ~15K tokens in models where tools are serialized
 * into prompt_length (e.g. OpenAI ChatCompletions → GLM-5).
 *
 * Used by DareAgentService when --mcp-path points here.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerCompactToolset } from './server-toolsets.js';
import { initOfficeClawDir } from './utils/path-validator.js';

export function createCompactServer(): McpServer {
  const server = new McpServer({
    name: 'office-claw-mcp-compact',
    version: '0.1.0',
  });
  registerCompactToolset(server);
  return server;
}

async function main(): Promise<void> {
  initOfficeClawDir();
  const server = createCompactServer();
  const transport = new StdioServerTransport();
  console.error('[office-claw] MCP Server (compact) starting...');
  await server.connect(transport);
  console.error('[office-claw] MCP Server (compact) running on stdio');
}

const isEntryPoint = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((err) => {
    console.error('[office-claw] Fatal error:', err);
    process.exit(1);
  });
}
