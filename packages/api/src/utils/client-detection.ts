/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Client Detection — detect which CLI clients are available in the system.
 *
 * Runs detection once at startup time and caches the result.
 * Each client maps to a CLI command (e.g. anthropic → claude, openai → codex).
 */

import { execFile } from 'node:child_process';
import { dareBundleAvailable } from '../domains/agents/services/agents/providers/DareAgentService.js';
import { jiuwenClawBundleAvailable, resolveVendoredJiuwenClawExecutable } from './jiuwenclaw-paths.js';
import {
  bundledAgentTeamsRuntimeAvailable,
  DEFAULT_EMBEDDED_AGENT_TEAMS_ARGS,
  resolveBundledAgentTeamsExecutable,
} from './agent-teams-bundle.js';
import { resolveOfficeClawHostRoot } from './office-claw-root.js';
import { filterAllowedClients } from './client-visibility.js';

type ClientId = 'anthropic' | 'openai' | 'google' | 'dare' | 'opencode' | 'antigravity' | 'relayclaw' | 'acp';

interface ClientInfo {
  id: ClientId;
  label: string;
  command: string;
}

const CLIENT_COMMAND_MAP: ClientInfo[] = [
  { id: 'anthropic', label: 'Claude', command: 'claude' },
  { id: 'openai', label: 'Codex', command: 'codex' },
  { id: 'google', label: 'Gemini', command: 'gemini' },
  { id: 'dare', label: 'Office Agent', command: 'dare' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'antigravity', label: 'Antigravity', command: 'antigravity' },
  { id: 'relayclaw', label: 'Assistant Agent', command: resolveVendoredJiuwenClawExecutable() },
  {
    id: 'acp',
    label: 'ACP',
    command: `${resolveBundledAgentTeamsExecutable(resolveOfficeClawHostRoot(process.cwd()))} ${DEFAULT_EMBEDDED_AGENT_TEAMS_ARGS.join(' ')}`,
  },
];

export interface AvailableClient {
  id: ClientId;
  label: string;
  command: string;
  available: boolean;
}

let cachedClients: AvailableClient[] | null = null;

function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const locator = process.platform === 'win32' ? 'where' : 'which';
    execFile(locator, [command], (error) => {
      resolve(!error);
    });
  });
}

async function acpRuntimeAvailable(): Promise<boolean> {
  return bundledAgentTeamsRuntimeAvailable(resolveOfficeClawHostRoot(process.cwd()));
}

function relayClawSidecarAvailable(): boolean {
  return jiuwenClawBundleAvailable();
}

function dareRuntimeAvailable(): boolean {
  return dareBundleAvailable();
}

/** Detect all clients and cache the result. */
export async function detectAvailableClients(): Promise<AvailableClient[]> {
  const results = await Promise.all(
    CLIENT_COMMAND_MAP.map(async (info) => {
      const available =
        info.id === 'relayclaw'
          ? relayClawSidecarAvailable()
          : info.id === 'dare'
            ? dareRuntimeAvailable()
            : info.id === 'acp'
              ? await acpRuntimeAvailable()
              : await commandExists(info.command);
      return {
        id: info.id,
        label: info.label,
        command: info.command,
        available,
      };
    }),
  );
  cachedClients = filterAllowedClients(results);
  return cachedClients;
}

/** Return cached detection results (runs detection if not yet cached). */
export async function getAvailableClients(): Promise<AvailableClient[]> {
  if (cachedClients) return cachedClients;
  return detectAvailableClients();
}

/** Force re-detection (useful if user installs a CLI after startup). */
export async function refreshAvailableClients(): Promise<AvailableClient[]> {
  cachedClients = null;
  return detectAvailableClients();
}
