/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { realpath, stat } from 'node:fs/promises';
import { relative, resolve, win32 } from 'node:path';
import { z } from 'zod';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { findMonorepoRoot } from '../utils/monorepo-root.js';
import { validateProjectPath } from '../utils/project-path.js';

const MONOREPO_ROOT = findMonorepoRoot();

export const protocolEnum = z.enum(['anthropic', 'openai', 'google', 'acp']);
export const authTypeEnum = z.enum(['oauth', 'api_key', 'none']);
export const modeEnum = z.enum(['subscription', 'api_key', 'none']);
export const kindEnum = z.enum(['api_key', 'acp']);
export const acpModelAccessModeEnum = z.enum(['self_managed', 'clowder_default_profile']);
export const acpModelProviderEnum = z.enum(['openai_compatible', 'bigmodel', 'minimax', 'echo']);

export const projectQuerySchema = z.object({
  projectPath: z.string().optional(),
});

export const projectQueryBodySchema = z.object({
  projectPath: z.string().optional(),
});

export const createBodySchema = z
  .object({
    projectPath: z.string().optional(),
    kind: kindEnum.optional(),
    provider: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
    mode: modeEnum.optional(),
    authType: authTypeEnum.optional(),
    protocol: protocolEnum.optional(),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    modelOverride: z.string().optional(),
    models: z.array(z.string().trim().min(1)).optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string().trim().min(1), z.string()).optional(),
    modelAccessMode: acpModelAccessModeEnum.optional(),
    defaultModelProfileRef: z.string().trim().min(1).optional(),
    setActive: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.name && !value.displayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['displayName'],
        message: 'displayName or name is required',
      });
    }
    if ((value.kind === 'acp' || value.protocol === 'acp') && !value.command?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['command'],
        message: 'command is required for ACP providers',
      });
    }
  });

export const updateBodySchema = z.object({
  projectPath: z.string().optional(),
  kind: kindEnum.optional(),
  provider: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  mode: modeEnum.optional(),
  authType: authTypeEnum.optional(),
  protocol: protocolEnum.optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  modelOverride: z.string().nullable().optional(),
  models: z.array(z.string().trim().min(1)).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().nullable().optional(),
  env: z.record(z.string().trim().min(1), z.string()).nullable().optional(),
  modelAccessMode: acpModelAccessModeEnum.optional(),
  defaultModelProfileRef: z.string().trim().min(1).nullable().optional(),
});

export const activateBodySchema = z.object({
  projectPath: z.string().optional(),
  provider: z.string().trim().min(1).optional(),
});

export const testBodySchema = z.object({
  projectPath: z.string().optional(),
  provider: z.string().trim().min(1).optional(),
  protocol: protocolEnum.optional(),
});

export const createAcpModelProfileBodySchema = z
  .object({
    projectPath: z.string().optional(),
    name: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
    provider: acpModelProviderEnum.optional(),
    model: z.string().trim().min(1),
    baseUrl: z.string().trim().min(1),
    apiKey: z.string().trim().min(1),
    sslVerify: z.boolean().nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    maxTokens: z.number().positive().optional(),
    contextWindow: z.number().positive().optional(),
    connectTimeoutSeconds: z.number().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.name && !value.displayName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['displayName'],
        message: 'displayName or name is required',
      });
    }
  });

export const updateAcpModelProfileBodySchema = z.object({
  projectPath: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  provider: acpModelProviderEnum.nullable().optional(),
  model: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().min(1).optional(),
  apiKey: z.string().trim().min(1).optional(),
  sslVerify: z.boolean().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  maxTokens: z.number().positive().nullable().optional(),
  contextWindow: z.number().positive().nullable().optional(),
  connectTimeoutSeconds: z.number().positive().nullable().optional(),
});

export async function resolveProjectRoot(projectPath?: string): Promise<string | null> {
  if (!projectPath) return resolveActiveProjectRoot();
  const validated = await validateProjectPath(projectPath);
  if (validated) return validated;

  const workspaceRoot = resolve(MONOREPO_ROOT, '..');
  try {
    const [resolvedTarget, resolvedWorkspaceRoot] = await Promise.all([
      realpath(resolve(projectPath)),
      realpath(workspaceRoot),
    ]);
    const rel = relative(resolvedWorkspaceRoot, resolvedTarget);
    if (win32.isAbsolute(rel) || rel.startsWith('..') || rel.startsWith('/') || rel.startsWith('\\')) return null;
    const info = await stat(resolvedTarget);
    return info.isDirectory() ? resolvedTarget : null;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function probeUrl(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
}

export function inferProbeProtocol(
  baseUrl: string | undefined,
  selector: string | undefined,
  models: string[] | undefined = [],
  ...nameHints: Array<string | undefined>
): 'anthropic' | 'openai' | 'google' {
  const normalizedSelector = selector?.trim().toLowerCase();
  if (normalizedSelector === 'anthropic' || normalizedSelector === 'claude' || normalizedSelector === 'opencode') {
    return 'anthropic';
  }
  if (normalizedSelector === 'google' || normalizedSelector === 'gemini') return 'google';
  if (normalizedSelector === 'openai' || normalizedSelector === 'codex' || normalizedSelector === 'dare') {
    return 'openai';
  }

  const normalizedModels = models.map((model) => model.trim().toLowerCase()).filter(Boolean);
  if (normalizedModels.some((model) => model.includes('claude') || model.includes('anthropic'))) return 'anthropic';
  if (normalizedModels.some((model) => model.includes('gemini') || model.includes('google'))) return 'google';
  if (normalizedModels.some((model) => model.includes('gpt') || model.includes('o1') || model.includes('o3'))) {
    return 'openai';
  }

  const normalizedHints = nameHints
    .map((hint) => hint?.trim().toLowerCase() ?? '')
    .filter(Boolean)
    .join(' ');
  if (
    normalizedHints.includes('claude') ||
    normalizedHints.includes('anthropic') ||
    normalizedHints.includes('opencode')
  ) {
    return 'anthropic';
  }
  if (normalizedHints.includes('gemini') || normalizedHints.includes('google')) return 'google';
  if (normalizedHints.includes('codex') || normalizedHints.includes('openai') || normalizedHints.includes('dare')) {
    return 'openai';
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl ?? '').toLowerCase();
  if (normalizedBaseUrl.includes('anthropic')) return 'anthropic';
  if (
    normalizedBaseUrl.includes('googleapis.com') ||
    normalizedBaseUrl.includes('generativelanguage') ||
    normalizedBaseUrl.includes('gemini')
  ) {
    return 'google';
  }
  return 'openai';
}

export interface ProviderProfilesRoutesOptions {
  fetchImpl?: typeof fetch;
}
