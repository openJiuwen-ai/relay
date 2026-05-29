/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Config Route
 * GET   /api/config              — 返回运行时配置快照
 * PATCH /api/config              — 热更新可变配置 (F4)
 * GET   /api/config/env-summary  — 返回用户可配的 env 变量及当前值 (F12)
 */

import os from 'node:os';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RuntimeEnvStore } from '@openjiuwen/relay-api-server-contracts/runtime-env';
import { z } from 'zod';
import type { ConnectorRuntimeReconciler } from '../infrastructure/connectors/ConnectorRuntimeManager.js';
import { findMonorepoRoot } from '../utils/monorepo-root.js';
import { collectConfigSnapshot } from '../config/ConfigRegistry.js';
import { configStore } from '../config/ConfigStore.js';
import type { ConfigSnapshot } from '../config/config-snapshot.js';
import type { AgentRegistry } from '../domains/agents/services/agents/registry/AgentRegistry.js';
import {
  buildEnvSummary,
  ENV_CATEGORIES,
  ENV_VARS,
  isConnectorEnvVarName,
  isConnectorSensitiveEditable,
  isEditableEnvVarName,
} from '../config/env-registry.js';
import {
  buildConnectorEnvRefVarName,
  isConnectorSecretBackedEnvVarName,
} from '../config/local-secret-store.js';
import { resolveRuntimeEnvStore } from '../config/runtime-env-store-resolver.js';
import { updateRuntimeCoCreator } from '../config/runtime-office-claw-catalog.js';
import { AuditEventTypes, getEventAuditLog } from '../domains/agents/services/orchestration/EventAuditLog.js';
import {
  createRelayClawSecurityClient,
  type RelayClawSecurityClient,
  type RelayClawSecurityPermissionsConfig,
} from './relayclaw-security-proxy.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { resolveTrustedUserId } from '../utils/request-identity.js';

const patchSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const envPatchSchema = z.object({
  updates: z.array(z.object({ name: z.string().min(1), value: z.string().nullable() })).min(1),
});

const relayClawSecurityPatchSchema = z.object({
  permissions: z
    .object({
      enabled: z.boolean().optional(),
      rw_enabled: z.boolean().optional(),
      tools: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, 'permissions patch must not be empty'),
});

const coCreatorPatchSchema = z.object({
  name: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  mentionPatterns: z.array(z.string().trim().min(1)).min(1),
  avatar: z.string().trim().nullable().optional(),
  color: z
    .object({
      primary: z.string().min(1),
      secondary: z.string().min(1),
    })
    .nullable()
    .optional(),
});

const runtimeStatusQuerySchema = z.object({
  category: z.string().optional(),
});

interface ConfigRoutesOptions {
  auditLog?: {
    append(input: { type: string; threadId?: string; data: Record<string, unknown> }): Promise<unknown>;
  };
  envFilePath?: string;
  projectRoot?: string;
  runtimeEnvStore?: RuntimeEnvStore;
  connectorRuntimeManager?: ConnectorRuntimeReconciler;
  relayClawSecurityClient?: RelayClawSecurityClient;
  agentRegistry?: AgentRegistry;
}

function captureProcessEnvSnapshot(names: Iterable<string>): Map<string, string | undefined> {
  const snapshot = new Map<string, string | undefined>();
  for (const name of names) {
    snapshot.set(name, process.env[name]);
  }
  return snapshot;
}

function restoreProcessEnvSnapshot(snapshot: Map<string, string | undefined>): void {
  for (const [name, value] of snapshot) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function getSnapshotValue(snapshot: ConfigSnapshot, key: string): unknown {
  const path = configStore.getSnapshotPath(key);
  if (!path) return undefined;
  return path.reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, snapshot);
}

export async function configRoutes(app: FastifyInstance, opts: ConfigRoutesOptions = {}): Promise<void> {
  const auditLog = opts.auditLog ?? getEventAuditLog();
  const projectRoot = opts.projectRoot ?? resolveActiveProjectRoot();
  const envFilePath = opts.envFilePath ?? resolve(projectRoot, '.env');
  const runtimeEnvStore = await resolveRuntimeEnvStore({
    envFilePath,
    runtimeEnvStore: opts.runtimeEnvStore,
  });
  const relayClawSecurityClient = opts.relayClawSecurityClient ?? createRelayClawSecurityClient(projectRoot, opts.agentRegistry);

  app.get('/api/config', async () => ({
    config: collectConfigSnapshot(),
  }));

  app.patch('/api/config', async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveTrustedUserId(request);
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required' };
    }

    const before = collectConfigSnapshot();
    const oldValue = getSnapshotValue(before, parsed.data.key);
    try {
      configStore.set(parsed.data.key, parsed.data.value);
    } catch (err) {
      reply.status(400);
      return { error: (err as Error).message };
    }
    const after = collectConfigSnapshot();
    const newValue = getSnapshotValue(after, parsed.data.key);
    const riskLevel = configStore.getRiskLevel(parsed.data.key) ?? 'standard';

    if (riskLevel === 'high') {
      request.log.warn(
        {
          key: parsed.data.key,
          operator,
        },
        'high-risk config key updated',
      );
    }

    try {
      await auditLog.append({
        type: AuditEventTypes.CONFIG_UPDATED,
        data: {
          key: parsed.data.key,
          oldValue,
          newValue,
          operator,
          riskLevel,
          source: configStore.source(parsed.data.key) ?? 'default',
        },
      });
    } catch (err) {
      request.log.warn({ err, key: parsed.data.key }, 'config audit append failed');
    }

    return { config: after };
  });

  const handleCoCreatorPatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = coCreatorPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveTrustedUserId(request);
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required' };
    }

    try {
      updateRuntimeCoCreator(projectRoot, {
        name: parsed.data.name,
        aliases: parsed.data.aliases,
        mentionPatterns: parsed.data.mentionPatterns,
        ...(parsed.data.avatar !== undefined ? { avatar: parsed.data.avatar } : {}),
        ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      });
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }

    const next = collectConfigSnapshot();
    try {
      await auditLog.append({
        type: AuditEventTypes.CONFIG_UPDATED,
        data: {
          target: 'coCreator',
          operator,
          name: next.coCreator.name,
          mentionPatterns: next.coCreator.mentionPatterns,
        },
      });
    } catch (err) {
      request.log.warn({ err }, 'coCreator config audit append failed');
    }

    return { config: next };
  };

  app.patch('/api/config/co-creator', handleCoCreatorPatch);

  // Backward-compat: old path delegates to same handler (deprecated)
  app.patch('/api/config/owner', async (request, reply) => {
    request.log.warn('DEPRECATED: /api/config/owner — use /api/config/co-creator');
    return handleCoCreatorPatch(request, reply);
  });

  app.get('/api/config/relayclaw/security', async (request, reply) => {
    const operator = resolveTrustedUserId(request);
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required' };
    }

    try {
      const permissions = await relayClawSecurityClient.getPermissions();
      return { permissions };
    } catch (err) {
      reply.status(502);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.patch('/api/config/relayclaw/security', async (request, reply) => {
    const parsed = relayClawSecurityPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveTrustedUserId(request);
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required' };
    }

    try {
      const permissions = await relayClawSecurityClient.setPermissions(
        parsed.data.permissions as RelayClawSecurityPermissionsConfig,
      );
      return { permissions };
    } catch (err) {
      reply.status(502);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 防休眠配置路由（仅浏览器环境使用，桌面应用通过 WebView2 直接与 C# launcher 通信）
  app.get('/api/config/prevent-sleep', async () => {
    // 桌面应用环境下，前端通过 WebView2 与 C# launcher 通信，不会调用此 API
    // 浏览器环境调用时，返回提示信息
    return {
      enabled: false,
      warning: '防休眠功能需要在桌面应用中才能生效。当前为浏览器环境。',
    };
  });

  app.patch('/api/config/prevent-sleep', async () => {
    // 桌面应用环境下，前端通过 WebView2 与 C# launcher 通信，不会调用此 API
    // 浏览器环境调用时，返回提示信息
    return {
      enabled: false,
      warning: '防休眠功能需要在桌面应用中才能生效。当前为浏览器环境，设置无法保存。',
    };
  });

  app.get('/api/config/env-summary', async () => {
    const monoRoot = findMonorepoRoot();
    const home = os.homedir();
    return {
      categories: ENV_CATEGORIES,
      variables: buildEnvSummary(),
      paths: {
        projectRoot,
        homeDir: home,
        dataDirs: {
          auditLogs: resolve(monoRoot, process.env.AUDIT_LOG_DIR ?? 'data/audit-logs'),
          runtimeLogs: resolve(monoRoot, 'data/logs/api'),
          cliArchive: resolve(monoRoot, process.env.CLI_RAW_ARCHIVE_DIR ?? 'data/cli-raw-archive'),
          redisDevSandbox: resolve(home, '.office-claw/redis-dev-sandbox'),
          uploads: resolve(monoRoot, process.env.UPLOAD_DIR ?? 'data/uploads'),
        },
      },
    };
  });

  app.patch('/api/config/env', async (request, reply) => {
    const parsed = envPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid request', details: parsed.error.issues };
    }
    const operator = resolveTrustedUserId(request);
    if (!operator) {
      reply.status(400);
      return { error: 'Identity required' };
    }

    const updates = new Map<string, string | null>();
    for (const update of parsed.data.updates) {
      if (!isEditableEnvVarName(update.name)) {
        reply.status(400);
        return { error: `Env var '${update.name}' is not editable from Hub` };
      }
      updates.set(update.name, update.value);
    }

    const persistedUpdates: Record<string, string | null> = {};
    const snapshotKeys = new Set<string>();
    for (const [name] of updates) {
      snapshotKeys.add(name);
      snapshotKeys.add(buildConnectorEnvRefVarName(name));
    }
    const envSnapshot = captureProcessEnvSnapshot(snapshotKeys);

    for (const [name, value] of updates) {
      const definition = ENV_VARS.find((item) => item.name === name);
      const isConnectorSecret = Boolean(definition && isConnectorSensitiveEditable(definition));
      const refName = buildConnectorEnvRefVarName(name);
      const normalizedValue = isConnectorEnvVarName(name) ? (value?.trim() ?? '') : value;

      if (normalizedValue == null || normalizedValue === '') {
        delete process.env[name];
        delete process.env[refName];
        persistedUpdates[name] = null;
      } else {
        process.env[name] = normalizedValue;
        persistedUpdates[name] = normalizedValue;
        if (!(isConnectorSecret && isConnectorSecretBackedEnvVarName(name))) {
          delete process.env[refName];
        }
      }
    }

    try {
      await runtimeEnvStore.save(persistedUpdates);
    } catch (error) {
      restoreProcessEnvSnapshot(envSnapshot);
      throw error;
    }

    for (const [name] of updates) {
      if (isConnectorSecretBackedEnvVarName(name)) {
        const refName = buildConnectorEnvRefVarName(name);
        const refValue = process.env[refName];
        if (refValue == null || refValue === '') delete process.env[refName];
      }
    }

    const changedKeys: string[] = [];
    for (const [name] of updates) {
      changedKeys.push(name);
    }

    const changedConnectorEnv = changedKeys.some((name) => isConnectorEnvVarName(name));
    if (changedConnectorEnv && opts.connectorRuntimeManager?.setOwnerUserId) {
      await opts.connectorRuntimeManager.setOwnerUserId(operator);
    }

    const runtime = opts.connectorRuntimeManager && changedKeys.length > 0
      ? await opts.connectorRuntimeManager.reconcile(changedKeys)
      : undefined;
    const needsRestart = changedConnectorEnv && (!runtime || !runtime.applied);

    try {
      await auditLog.append({
        type: AuditEventTypes.CONFIG_UPDATED,
        data: {
          target: '.env',
          keys: [...updates.keys()],
          operator,
        },
      });
    } catch (err) {
      request.log.warn({ err, keys: [...updates.keys()] }, 'env config audit append failed');
    }

    return { ok: true, requiresRestart: needsRestart, runtime, envFilePath, summary: buildEnvSummary() };
  });
}
