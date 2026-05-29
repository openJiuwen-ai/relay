#!/usr/bin/env node
/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */


/**
 * OfficeClaw MCP Server — Memory Surface
 * 只暴露记忆与回溯工具（evidence/reflect/session chain）。
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerMemoryToolset } from './server-toolsets.js';
import { initOfficeClawDir } from './utils/path-validator.js';

function createBaseServer(name: string): McpServer {
  return new McpServer({
    name,
    version: '0.1.0',
  });
}

/**
 * Create a Memory MCP server instance with evidence search,
 * reflection, session chain, and memory retention tools registered.
 */
export function createMemoryServer(): McpServer {
  const server = createBaseServer('office-claw-memory-mcp');
  registerMemoryToolset(server);
  return server;
}

async function main(): Promise<void> {
  initOfficeClawDir();
  const server = createMemoryServer();
  const transport = new StdioServerTransport();
  console.error('[office-claw-memory] MCP Server starting...');
  await server.connect(transport);
  console.error('[office-claw-memory] MCP Server running on stdio');
}

const isEntryPoint = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((err) => {
    console.error('[office-claw-memory] Fatal error:', err);
    process.exit(1);
  });
}
