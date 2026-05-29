/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Config Registry
 * 收集所有运行时配置的快照，供 /config 命令展示。
 *
 * 纯函数，每次调用实时读取 (不缓存)。
 * 安全：Redis URL 不暴露，只显示连接状态。
 */

import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';
import { DEFAULT_CLI_TIMEOUT_MS, readCliTimeoutMsFromEnv } from '../utils/cli-timeout.js';
import { getAllAgentBudgets } from './office-claw-budgets.js';
import { getCoCreatorConfig } from './office-claw-config-loader.js';
import { getAgentModel } from './office-claw-models.js';
import { getCodexApprovalPolicy, getCodexSandboxMode } from './codex-cli.js';
import type { CodexAuthMode, ConfigSnapshot } from './config-snapshot.js';
import { getLongTermMemoryEnabled } from './memory-toggle-state.js';
import { parseBoolean, parseEnum } from './parse-utils.js';

export type { CodexAuthMode, ConfigSnapshot } from './config-snapshot.js';

function formatTtl(raw: string | undefined, defaultSeconds: number): string {
  if (!raw) {
    return `${Math.round(defaultSeconds / 86400)} days`;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return `${Math.round(defaultSeconds / 86400)} days`;
  }
  if (parsed <= 0) {
    return 'disabled (persistent)';
  }
  if (parsed % 86400 === 0) {
    return `${parsed / 86400} days`;
  }
  if (parsed % 3600 === 0) {
    return `${parsed / 3600} hours`;
  }
  return `${Math.trunc(parsed)} seconds`;
}

/**
 * Collect a snapshot of all runtime configuration values.
 * Sources: process.env + hardcoded defaults + OFFICE_CLAW_CONFIGS.
 */
export function collectConfigSnapshot(): ConfigSnapshot {
  const env = process.env;

  // Context (from ContextAssembler defaults + env overrides)
  const maxMessages = Number(env.CONTEXT_HISTORY_LIMIT) || 20;
  const maxContentLength = Number(env.MAX_CONTEXT_MSG_CHARS) || 1500;
  const maxTotalChars = 8000;
  const maxPromptTokens = Number(env.MAX_PROMPT_TOKENS) || 32000;
  const coCreator = getCoCreatorConfig();

  // CLI (from cli-spawn.ts defaults, configurable via CLI_TIMEOUT_MS, 0 = disable)
  const timeoutMs = readCliTimeoutMsFromEnv(env) ?? DEFAULT_CLI_TIMEOUT_MS;
  const killGraceMs = 3_000;
  const codexSandboxMode = getCodexSandboxMode(env);
  const codexApprovalPolicy = getCodexApprovalPolicy(env);

  // Storage (from Redis/memory store defaults)
  const messageTTL = formatTtl(env.MESSAGE_TTL_SECONDS, 90 * 24 * 60 * 60);
  const threadTTL = formatTtl(env.THREAD_TTL_SECONDS, 90 * 24 * 60 * 60);
  const taskTTL = formatTtl(env.TASK_TTL_SECONDS, 30 * 24 * 60 * 60);
  const maxMessagesStore = 2000;
  const maxThreads = 100;

  // Upload (from messages route)
  const maxFileSize = '10 MB';
  const maxFiles = 5;

  // Server
  const port = parseInt(env.API_SERVER_PORT ?? '3004', 10);
  const host = env.API_SERVER_HOST ?? '127.0.0.1';
  const redis: 'connected' | 'memory' = env.REDIS_URL ? 'connected' : 'memory';

  // Cats (with env override support) — prefer registry, fallback to OFFICE_CLAW_CONFIGS
  const agents: ConfigSnapshot['agents'] = {};
  const allConfigs = officeClawRegistry.getAllIds().length > 0 ? officeClawRegistry.getAllConfigs() : OFFICE_CLAW_CONFIGS;
  for (const [id, config] of Object.entries(allConfigs)) {
    const trimmedAccountRef = typeof config.accountRef === 'string' ? config.accountRef.trim() : '';
    const legacyProviderProfileId = (config as { providerProfileId?: unknown }).providerProfileId;
    const trimmedProviderProfileId =
      typeof legacyProviderProfileId === 'string' ? legacyProviderProfileId.trim() : '';
    const boundAccountRef = trimmedAccountRef || trimmedProviderProfileId;
    agents[id] = {
      displayName: config.displayName,
      provider: config.provider,
      model: getAgentModel(id),
      mcpSupport: config.mcpSupport,
      ...(boundAccountRef ? { accountRef: boundAccountRef } : {}),
      ...(trimmedProviderProfileId || boundAccountRef
        ? { providerProfileId: trimmedProviderProfileId || boundAccountRef }
        : {}),
    };
  }

  // A2A
  const a2aMaxDepth = Number(env.MAX_A2A_DEPTH) || 15;
  const defaultCodexModel = getAgentModel('codex');
  const codexExecutionModel = env.CAT_CODEX_EXEC_MODEL?.trim() || defaultCodexModel;
  const codexExecutionAuthMode = parseEnum<CodexAuthMode>(env.CODEX_AUTH_MODE, ['oauth', 'api_key', 'auto'], 'oauth');
  const codexExecutionPassModelArg = parseBoolean(env.CAT_CODEX_PASS_MODEL_ARG, true);

  return {
    coCreator: {
      name: coCreator.name,
      aliases: [...coCreator.aliases],
      mentionPatterns: [...coCreator.mentionPatterns],
      ...(coCreator.avatar ? { avatar: coCreator.avatar } : {}),
      ...(coCreator.color ? { color: coCreator.color } : {}),
    },
    context: {
      maxMessages,
      maxContentLength,
      maxTotalChars,
      maxPromptTokens,
      note: 'These are assembleContext defaults; see perAgentBudgets for actual per-agent limits',
    },
    perAgentBudgets: getAllAgentBudgets(),
    cli: { timeoutMs, killGraceMs, codexSandboxMode, codexApprovalPolicy },
    storage: { messageTTL, threadTTL, taskTTL, maxMessages: maxMessagesStore, maxThreads },
    upload: { maxFileSize, maxFiles },
    server: { port, host, redis },
    agents,
    a2a: { enabled: true, maxDepth: a2aMaxDepth },
    memory: { enabled: getLongTermMemoryEnabled(), maxKeysPerThread: 50 },
    f102: {
      embedMode: env.EMBED_MODE ?? 'off',
      abstractiveEnabled: env.F102_ABSTRACTIVE === 'on',
    },
    governance: {
      degradationEnabled: true,
      doneTimeoutMs: 5 * 60 * 1000,
      heartbeatIntervalMs: 30_000,
    },
    deliberate: { status: 'types_only' },
    codexExecution: {
      model: codexExecutionModel,
      authMode: codexExecutionAuthMode,
      passModelArg: codexExecutionPassModelArg,
    },
  };
}
