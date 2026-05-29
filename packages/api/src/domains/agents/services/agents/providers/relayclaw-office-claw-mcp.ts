/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveOfficeClawHostRoot } from '../../../../../utils/office-claw-root.js';
import type { AgentServiceOptions } from '../../types.js';

const OFFICE_CLAW_MCP_CALLBACK_ENV_KEYS = [
  'OFFICE_CLAW_API_URL',
  'OFFICE_CLAW_INVOCATION_ID',
  'OFFICE_CLAW_CALLBACK_TOKEN',
  'OFFICE_CLAW_USER_ID',
  'OFFICE_CLAW_AGENT_ID',
  'OFFICE_CLAW_SIGNAL_USER',
] as const;

export const RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS = [
  'limb_list_available',
  'limb_invoke',
  'limb_pair_list',
  'limb_pair_approve',
  'office_claw_list_tasks',
  'office_claw_update_task',
  'office_claw_load_skill',
  'office_claw_create_rich_block',
  'office_claw_get_rich_block_rules',
  'office_claw_request_permission',
  'office_claw_check_permission_status',
  'office_claw_update_workflow',
  'office_claw_feat_index',
] as const;

export const RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS_ENV = 'OFFICE_CLAW_MCP_EXCLUDED_TOOLS';

export interface RelayClawOfficeClawMcpServer {
  command: string;
  args: string[];
  serverPath: string;
  repoRoot: string;
}

export function resolveOfficeClawMcpServer(
  workingDirectory?: string,
): RelayClawOfficeClawMcpServer | null {
  const candidateRoots: string[] = [];
  if (workingDirectory) candidateRoots.push(workingDirectory);
  candidateRoots.push(process.cwd());
  candidateRoots.push(resolveOfficeClawHostRoot(process.cwd()));

  for (const root of candidateRoots) {
    const repoRoot = resolve(root);
    const distServerPath = resolve(repoRoot, 'packages/mcp-server/dist/index.js');
    if (existsSync(distServerPath)) {
      return {
        command: process.execPath,
        args: [distServerPath],
        serverPath: distServerPath,
        repoRoot,
      };
    }

    const sourceServerPath = resolve(repoRoot, 'packages/mcp-server/src/index.ts');
    if (existsSync(sourceServerPath)) {
      return {
        command: process.execPath,
        args: ['--import', 'tsx', sourceServerPath],
        serverPath: sourceServerPath,
        repoRoot,
      };
    }
  }

  return null;
}

export function buildOfficeClawMcpEnv(callbackEnv?: Record<string, string>): Record<string, string> {
  const resolvedEnv = callbackEnv ?? {};
  return {
    ...(Object.fromEntries(
      OFFICE_CLAW_MCP_CALLBACK_ENV_KEYS.map((key) => [key, resolvedEnv[key]]).filter(([, value]) => Boolean(value)),
    ) as Record<string, string>),
    [RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS_ENV]: RELAYCLAW_EXCLUDED_OFFICE_CLAW_MCP_TOOLS.join(','),
  };
}

export function buildOfficeClawMcpRequestConfig(options?: AgentServiceOptions): Record<string, unknown> | undefined {
  const resolved = resolveOfficeClawMcpServer(options?.workingDirectory);
  if (!resolved) return undefined;

  return {
    command: resolved.command,
    args: resolved.args,
    cwd: resolved.repoRoot,
    env: buildOfficeClawMcpEnv(options?.callbackEnv),
  };
}
