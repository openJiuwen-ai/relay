#!/usr/bin/env node
/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * OfficeClaw API Server
 * 后端 API 入口
 */

import './config/runtime-env-bootstrap.js';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import fastifyCookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import type { IApprovalRecordStore } from '@openjiuwen/relay-api-server-contracts/storage';
import type { OfficeClawProviderPlugin, ProviderPluginRegistry } from '@openjiuwen/relay-core';
import { type AgentId, createAgentId, type OfficeClawConfigEntry, officeClawRegistry } from '@openjiuwen/relay-shared';
import type { RedisClient } from '@openjiuwen/relay-shared/utils';
import { createRedisClient, SessionStore } from '@openjiuwen/relay-shared/utils';
import Fastify from 'fastify';
import { registerAuthMiddleware } from './auth/middleware.js';
import { createAuthModule, type AuthModule } from './auth/module.js';
import { authSessionStore } from './auth/session-store.js';
import { orchestrate } from './config/capabilities/capability-orchestrator.js';
import { resolveFrontendBaseUrl, resolveFrontendCorsOrigins } from './config/frontend-origin.js';
import { resolveBoundAccountRefForCat } from './config/office-claw-account-binding.js';
import { getAgentContextBudget } from './config/office-claw-budgets.js';
import {
  bootstrapDefaultAgentCatalog,
  getConfigSessionStrategy,
  getDefaultAgentId,
  toAllAgentConfigs,
} from './config/office-claw-config-loader.js';
import { createProviderPluginRegistry } from './config/plugins/builtin-providers.js';
import { initPluginRegistry } from './config/plugins/plugin-registry-singleton.js';
import {
  readProviderProfiles,
  resolveAnthropicRuntimeProfile,
  resolveRuntimeProviderProfileForClient,
} from './config/provider-profiles.js';
import { initRuntimeOverrides } from './config/session-strategy-overrides.js';
import { createTaskProgressStore } from './domains/agents/services/agents/invocation/createTaskProgressStore.js';
import { InvocationQueue } from './domains/agents/services/agents/invocation/InvocationQueue.js';
import { InvocationRegistry } from './domains/agents/services/agents/invocation/InvocationRegistry.js';
import { InvocationTracker } from './domains/agents/services/agents/invocation/InvocationTracker.js';
import type {
  InvocationRecordStoreLike,
  RouterLike,
} from './domains/agents/services/agents/invocation/QueueProcessor.js';
import { QueueProcessor } from './domains/agents/services/agents/invocation/QueueProcessor.js';
import { AntigravityAgentService } from './domains/agents/services/agents/providers/antigravity/AntigravityAgentService.js';
import { AgentRegistry } from './domains/agents/services/agents/registry/AgentRegistry.js';
import { getAskUserQuestionBridge } from './domains/agents/services/ask/AskUserQuestionBridge.js';
import { AuthorizationManager } from './domains/agents/services/auth/AuthorizationManager.js';
import { getExpertAgentConfigs, initExpertCatalog } from './domains/agents/services/experts/ExpertCatalog.js';
import { getJiuwenPermissionBridge } from './domains/agents/services/auth/JiuwenPermissionBridge.js';
import { parseIntent } from './domains/agents/services/context/IntentParser.js';
import {
  AgentRouter,
  AuditEventTypes,
  ClaudeAgentService,
  DeliveryCursorStore,
  getEventAuditLog,
  MemoryGovernanceStore,
  OpenCodeAgentService,
} from './domains/agents/services/index.js';
import { initPushNotificationService } from './domains/agents/services/push/PushNotificationService.js';
import type { HandoffConfig } from './domains/agents/services/session/SessionSealer.js';
import { SessionSealer } from './domains/agents/services/session/SessionSealer.js';
import { TranscriptReader } from './domains/agents/services/session/TranscriptReader.js';
import { TranscriptWriter } from './domains/agents/services/session/TranscriptWriter.js';
import { SkillOptionsChangeWatcher } from './domains/agents/services/skillhub/SkillOptionsChangeWatcher.js';
import { MlxAudioTtsProvider } from './domains/agents/services/tts/MlxAudioTtsProvider.js';
import { initStreamingTtsRegistry } from './domains/agents/services/tts/StreamingTtsChunker.js';
import { TtsRegistry } from './domains/agents/services/tts/TtsRegistry.js';
import { startTtsCacheCleaner } from './domains/agents/services/tts/tts-cache-cleaner.js';
import { initVoiceBlockSynthesizer } from './domains/agents/services/tts/VoiceBlockSynthesizer.js';
import type { AgentService } from './domains/agents/services/types.js';
import { PptTemplateGenerationService } from './domains/ppt/templates/PptTemplateGenerationService.js';
import { PptTemplateStore } from './domains/ppt/templates/PptTemplateStore.js';
import { AgentPaneRegistry } from './domains/terminal/agent-pane-registry.js';
import { TmuxGateway } from './domains/terminal/tmux-gateway.js';
import { MemoryConnectorThreadBindingStore } from './infrastructure/connectors/ConnectorThreadBindingStore.js';
import {
  loadConnectorGatewayConfig,
  startConnectorGateway,
} from './infrastructure/connectors/connector-gateway-bootstrap.js';
import { RedisConnectorThreadBindingStore } from './infrastructure/connectors/RedisConnectorThreadBindingStore.js';
import {
  CiCdRouter,
  ConnectorInvokeTrigger,
  GhCliReviewContentFetcher,
  MemoryProcessedEmailStore,
  MemoryPrTrackingStore,
  RedisPrTrackingStore,
  ReviewRouter,
  startGithubCiPoller,
  startGithubReviewWatcher,
  stopGithubCiPoller,
  stopGithubReviewWatcher,
} from './infrastructure/email/index.js';
import { SocketManager } from './infrastructure/websocket/index.js';
import { connectorWebhookRoutes } from './routes/connector-webhooks.js';
import { registerGlobalAuthHook, resolveAuthCookieSecret } from './routes/global-auth.js';
import {
  askUserQuestionRoutes,
  auditRoutes,
  authorizationRoutes,
  authRoutes,
  availableClientsRoutes,
  backlogRoutes,
  callbackAuthRoutes,
  callbacksRoutes,
  capabilitiesRoutes,
  catsRoutes,
  claudeRescueRoutes,
  commandsRoutes,
  configRoutes,
  connectorHubRoutes,
  connectorMediaRoutes,
  evidenceRoutes,
  executionDigestRoutes,
  exportRoutes,
  externalProjectRoutes,
  expertsRoutes,
  featureDocDetailRoutes,
  feedbackRoutes,
  intentCardRoutes,
  invocationsRoutes,
  maasModelsRoutes,
  memoryPublishRoutes,
  memoryRoutes,
  messageActionsRoutes,
  messagesRoutes,
  modelConfigProfilesRoutes,
  pptStudioRoutes,
  pptTemplatesRoutes,
  inspirationRoutes,
  projectsRoutes,
  providerProfilesRoutes,
  pushRoutes,
  queueRoutes,
  quotaRoutes,
  reflectRoutes,
  refluxRoutes,
  registerCallbackDocsRoutes,
  resolutionRoutes,
  sessionChainRoutes,
  sessionHooksRoutes,
  sessionStrategyConfigRoutes,
  sessionTranscriptRoutes,
  skillsRoutes,
  sliceRoutes,
  soulTemplatesRoutes,
  tasksRoutes,
  threadBranchRoutes,
  threadsRoutes,
  ttsRoutes,
  uploadsRoutes,
  usageRoutes,
  verifyPrimaryUserId,
  versionRoutes,
  workflowSopRoutes,
} from './routes/index.js';
import { prTrackingRoutes } from './routes/pr-tracking.js';
import { terminalRoutes } from './routes/terminal.js';
import { threadExportRoutes } from './routes/thread-export.js';
import { ApiInstanceLease, type ApiInstanceLeaseInvalidation } from './services/ApiInstanceLease.js';
import { initProtocolCredentialAdapter } from './integrations/protocol-credential-adapter.js';
import { createStorageModule, type StorageModule } from './storage/module.js';
import { createCatalogModule, type CatalogModule } from './catalog/module.js';
import { parseTtlEnv } from './storage/parse-ttl-env.js';
import { refreshRedisTtlBackground } from './storage/refresh-ttl.js';
import { resolveActiveProjectRoot } from './utils/active-project-root.js';
import { createWorkspaceModuleLoader } from './utils/workspace-module-loader.js';
import { findMonorepoRoot } from './utils/monorepo-root.js';
import { resolveOfficeClawHostRoot } from './utils/office-claw-root.js';
import { resolveUserId } from './utils/request-identity.js';
import { getApiSecurityHeaders } from './utils/response-security.js';

import type { EvidenceModule } from './evidence/module.js';
import type { FastifyInstance } from 'fastify';
import type {
  IBacklogStore,
  IInvocationRecordStore,
  IMemoryStore,
  IMessageStore,
  ISessionChainStore,
  ITaskStore,
  IThreadStore,
} from '@openjiuwen/relay-api-server-contracts/storage';
import { FeedbackStore } from './domains/agents/services/stores/ports/FeedbackStore.js';
import { RedisFeedbackStore } from './domains/agents/services/stores/redis/RedisFeedbackStore.js';

// ============================================================================
// Plugin API: Module Injection Interfaces
// ============================================================================

/**
 * Feature names that can be skipped during route registration.
 */
export type FeatureName =
  | 'terminal'
  | 'ppt'
  | 'connector'
  | 'scheduler'
  | 'memory'
  | 'session'
  | 'push'
  | 'uploads'
  | 'tts';

/**
 * API initialization context - provides internal services access.
 */
export interface ApiInitContext {
  env: NodeJS.ProcessEnv;
  cwd: string;
  app: FastifyInstance;
  stores: {
    messageStore: IMessageStore;
    threadStore: IThreadStore;
    taskStore: ITaskStore;
    backlogStore: IBacklogStore;
    memoryStore: IMemoryStore;
    sessionChainStore: ISessionChainStore;
    invocationRecordStore: IInvocationRecordStore;
  };
  services: {
    socketManager: SocketManager;
    invocationRegistry: InvocationRegistry;
    agentServiceRegistry: AgentRegistry;
    router: AgentRouter;
    authManager: AuthorizationManager;
  };
  modules: {
    authModule: AuthModule;
    storageModule: StorageModule;
    catalogModule: CatalogModule;
    evidenceModule: EvidenceModule;
    pluginRegistry: ProviderPluginRegistry;
  };
}

/**
 * API startup options - supports module injection and extension.
 */
export interface ApiStartOptions {
  /** Storage module (inject to replace storage backend) */
  storageModule?: StorageModule;

  /** Catalog module (inject to replace Agent config loading) */
  catalogModule?: CatalogModule;

  /** Lifecycle hooks for advanced customization */
  hooks?: {
    /** App created, before registerGlobalAuthHook (for custom auth middleware) */
    afterAppCreated?: (app: FastifyInstance) => Promise<void>;
    /** After stores/services created */
    afterInit?: (ctx: ApiInitContext) => Promise<void>;
    /** After registerAuthMiddleware (for JWT request.auth injection) */
    afterAuthMiddleware?: (app: FastifyInstance) => Promise<void>;
    /** SocketManager created (for WebSocket auth middleware) */
    afterSocketManagerCreated?: (socketManager: SocketManager, app: FastifyInstance) => Promise<void>;
  };

  /**
   * Routes to skip during registration.
   */
  skipFeatures?: Set<FeatureName> | FeatureName[];
}

const API_BODY_LIMIT_BYTES = 100 * 1024 * 1024;

let socketManager: SocketManager | null = null;
let redisClient: RedisClient | null = null;

/**
 * Get the SocketManager instance
 * @throws Error if SocketManager is not initialized
 */
export function getSocketManager(): SocketManager {
  if (!socketManager) {
    throw new Error('SocketManager not initialized');
  }
  return socketManager;
}

const PROCESS_START_AT = Date.now();

/**
 * Sensitive query params to redact from request URL logs.
 */
const SENSITIVE_QUERY_PARAMS = [
  'callbackToken',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'password',
  'accessToken',
  'hookToken',
];

/**
 * Redact sensitive query params from URL string.
 * E.g., "?callbackToken=xxx&foo=bar" → "?callbackToken=[REDACTED]&foo=bar"
 */
function redactUrlQuery(url: string): string {
  const idx = url.indexOf('?');
  if (idx === -1) return url;
  const path = url.slice(0, idx);
  const query = url.slice(idx + 1);
  const redacted = query.replace(
    /([?&])(callbackToken|token|apiKey|api_key|secret|password|accessToken|hookToken)=([^&]*)/gi,
    '$1$2=[REDACTED]',
  );
  return `${path}?${redacted}`;
}

declare module 'fastify' {
  interface FastifyRequest {
    traceId: string;
  }
}

export async function main(options: ApiStartOptions = {}): Promise<void> {
  const env = process.env;
  const PORT = parseInt(env.API_SERVER_PORT ?? '3004', 10);
  const HOST = env.API_SERVER_HOST ?? '127.0.0.1';

  // Parse skipFeatures into a Set for efficient lookup
  const skipFeaturesSet = new Set<FeatureName>(options.skipFeatures ?? []);

  /**
   * Check if a feature group should be skipped.
   */
  function shouldSkipFeature(feature: FeatureName): boolean {
    return skipFeaturesSet.has(feature);
  }

  const { logger: customLogger, isDebugMode, LOG_DIR_PATH } = await import('./infrastructure/logger.js');

  // Create child logger with custom request serializer that redacts URL query params
  const redactingLogger = customLogger.child(
    {},
    {
      serializers: {
        req: (req: {
          method?: string;
          url?: string;
          hostname?: string;
          remoteAddress?: string;
          remotePort?: number;
        }) => ({
          method: req.method,
          url: req.url ? redactUrlQuery(req.url) : undefined,
          hostname: req.hostname,
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
        }),
      },
    },
  );

  const app = Fastify({
    logger: redactingLogger as unknown as import('fastify').FastifyBaseLogger,
    bodyLimit: API_BODY_LIMIT_BYTES,
  });

  /**
   * Register feature routes with skip check and unified logging.
   */
  async function registerFeatureRoutes(
    feature: FeatureName,
    registerFn: () => Promise<void>
  ): Promise<void> {
    if (shouldSkipFeature(feature)) {
      app.log.info(`[api] Skipping ${feature} routes (skipFeatures)`);
      return;
    }
    await registerFn();
  }

  if (isDebugMode) {
    app.log.info({ logDir: LOG_DIR_PATH }, '[api] Debug mode enabled (--debug flag)');
  }

  // CORS for frontend
  await app.register(fastifyCookie, {
    secret: await resolveAuthCookieSecret(),
  });

  await app.register(cors, {
    origin: resolveFrontendCorsOrigins(env, app.log),
    credentials: true,
    exposedHeaders: [
      'x-trace-id',
      'x-office-claw-workspace-delete-requested',
      'x-office-claw-workspace-delete-attempted',
      'x-office-claw-workspace-delete-succeeded',
      'x-office-claw-workspace-delete-shared',
      'x-office-claw-workspace-delete-shared-count',
      'x-office-claw-workspace-delete-reason',
      'x-office-claw-memory-preserved',
    ],
  });

  // WebSocket support (F089 terminal)
  await app.register(fastifyWebsocket);

  // Prevent Fastify from intercepting Socket.IO paths — Socket.IO handles
  // them via its own http server listeners (both polling and WebSocket).
  // Without this, @fastify/websocket causes Fastify to send 404 for
  // /socket.io/ upgrade requests, killing WebSocket transport entirely.
  app.addHook('onRequest', (_request, reply, done) => {
    if (_request.url.startsWith('/socket.io/')) {
      reply.hijack();
    }
    done();
  });

  app.addHook('onRequest', (request, reply, done) => {
    request.traceId = (request.headers['x-trace-id'] as string)?.trim() || randomUUID();
    reply.header('X-Trace-Id', request.traceId);
    done();
  });

  // afterAppCreated hook: custom auth middleware before registerGlobalAuthHook
  await options.hooks?.afterAppCreated?.(app);

  registerGlobalAuthHook(app, {
    verifyPrimaryUserId,
    resolveBearerUserId: (request) => {
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith('Bearer ')) return null;
      const sessionId = authorization.slice(7).trim();
      if (!sessionId) return null;
      return authSessionStore.getBySessionId(sessionId)?.userId ?? null;
    },
    allowedBrowserOrigins: resolveFrontendCorsOrigins(process.env, app.log),
  });
  // D6-B: cookie gate and Bearer middleware still coexist here; new auth hooks must audit both paths until SSOT lands.

  // Security headers for all API responses
  app.addHook('onSend', async (_request, reply) => {
    for (const [name, value] of Object.entries(getApiSecurityHeaders(_request.url))) {
      reply.header(name, value);
    }
  });

  // Global error handler — catches unhandled route errors
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    app.log.error({ err: error, method: request.method, url: request.url, statusCode }, 'unhandled route error');
    reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      statusCode,
    });
  });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: Date.now() }));

  registerAuthMiddleware(app, authSessionStore, {
    skipAuth: env.OFFICE_CLAW_SKIP_AUTH === '1',
  });

  // afterAuthMiddleware hook: JWT request.auth injection
  await options.hooks?.afterAuthMiddleware?.(app);

  // Create invocation tracker for cancellation support
  const invocationTracker = new InvocationTracker();

  // Initialize WebSocket manager BEFORE routes (injected via opts, no circular import).
  // IMPORTANT: Socket.io must attach to the SAME server Fastify listens on.
  socketManager = new SocketManager(app.server, invocationTracker);

  // afterSocketManagerCreated hook: WebSocket auth middleware
  await options.hooks?.afterSocketManagerCreated?.(socketManager, app);

  const skillOptionsWatcher = new SkillOptionsChangeWatcher({
    hostRoot: resolveOfficeClawHostRoot(process.cwd()),
    logger: app.log,
    onChanged: ({ reason, changedAt }) => {
      socketManager?.getIO().emit('skill_options_changed', { reason, changedAt });
    },
  });
  await skillOptionsWatcher.start();

  // Create shared service instances for MCP callback flow
  const registry = new InvocationRegistry();
  const redisUrl = env.REDIS_URL;
  const redis = redisUrl ? createRedisClient({ url: redisUrl }) : undefined;
  redisClient = redis ?? null;
  const installRoot = findMonorepoRoot(process.cwd());
  const workspaceModuleLoader = createWorkspaceModuleLoader(resolveActiveProjectRoot(process.cwd()));

  // Storage module: plugin-based store creation with fast-fail.
  // When OFFICE_CLAW_STORAGE_PROVIDER is set, the specified provider must be available.
  // When not set, falls back to legacy behavior (Redis if available, else MEMORY_STORE=1).
  const storageModule = options.storageModule ?? await createStorageModule({ redis, env, moduleLoader: workspaceModuleLoader });
  const storageProvider = storageModule.getActiveProvider();
  app.log.info(`[api] Storage provider: ${storageModule.activeProviderId}`);

  // F102 KD-34: append listener placeholder (wired after memoryServices init)
  let appendListener: ((msg: { id: string; threadId: string; timestamp: number; content: string }) => void) | null =
    null;

  const messageTtlSeconds = parseTtlEnv(env.MESSAGE_TTL_SECONDS);
  const threadTtlSeconds = parseTtlEnv(env.THREAD_TTL_SECONDS);
  const taskTtlSeconds = parseTtlEnv(env.TASK_TTL_SECONDS);
  const backlogTtlSeconds = parseTtlEnv(env.BACKLOG_TTL_SECONDS);

  const messageStore = await storageProvider.createMessageStore({
    onAppend: (msg) => {
      appendListener?.(msg);
    },
    ...(messageTtlSeconds !== undefined ? { ttlSeconds: messageTtlSeconds } : {}),
  });
  const sessionStore = redis ? new SessionStore(redis) : undefined;
  const deliveryCursorStore = new DeliveryCursorStore(sessionStore);
  const feedbackStore = redis ? new RedisFeedbackStore(redis) : new FeedbackStore();
  const threadStore = await storageProvider.createThreadStore({
    ...(threadTtlSeconds !== undefined ? { ttlSeconds: threadTtlSeconds } : {}),
  });
  const taskStore = await storageProvider.createTaskStore({
    ...(taskTtlSeconds !== undefined ? { ttlSeconds: taskTtlSeconds } : {}),
  });
  const backlogStore = await storageProvider.createBacklogStore({
    ...(backlogTtlSeconds !== undefined ? { ttlSeconds: backlogTtlSeconds } : {}),
  });
  const workflowSopStore = await storageProvider.createWorkflowSopStore();
  const memoryStore = await storageProvider.createMemoryStore();
  const taskProgressStore = createTaskProgressStore(redis);
  const invocationRecordStore = await storageProvider.createInvocationRecordStore();
  const draftStore = await storageProvider.createDraftStore();
  const readStateStore = await storageProvider.createReadStateStore();
  const { ExecutionDigestStore } = await import('./domains/projects/execution-digest-store.js');
  const executionDigestStore = new ExecutionDigestStore();

  const sessionChainStore = await storageProvider.createSessionChainStore();
  // F24: Transcript Writer/Reader for session chain
  // E7 fix: resolve relative to monorepo root, not CWD (same fix as docsRoot in PR #524)
  const transcriptDataDir = env.TRANSCRIPT_DATA_DIR ?? `${findMonorepoRoot(process.cwd())}/data/transcripts`;
  const transcriptWriter = new TranscriptWriter({ dataDir: transcriptDataDir });
  const transcriptReader = new TranscriptReader({ dataDir: transcriptDataDir });
  // F065 Phase C: HandoffConfig for LLM-generated digest on seal
  const handoffConfig: HandoffConfig = {
    getBootstrapDepth: (agentId: string) => getConfigSessionStrategy(agentId)?.handoff?.bootstrapDepth ?? 'extractive',
    resolveProfile: async (threadId: string, agentId: string) => {
      try {
        let projectRoot = findMonorepoRoot(process.cwd());
        const thread = await threadStore.get(threadId);
        if (thread?.projectPath && thread.projectPath !== 'default') {
          projectRoot = thread.projectPath;
        }
        const agentConfig = officeClawRegistry.tryGet(agentId)?.config;
        if (agentConfig?.provider === 'anthropic' || agentConfig?.provider === 'opencode') {
          const boundAccountRef = resolveBoundAccountRefForCat(
            projectRoot,
            agentId,
            agentConfig as OfficeClawConfigEntry & { providerProfileId?: string },
          );
          const runtime = await resolveRuntimeProviderProfileForClient(
            projectRoot,
            agentConfig.provider,
            boundAccountRef,
          );
          if (!runtime?.apiKey) return null;
          return { apiKey: runtime.apiKey, baseUrl: runtime.baseUrl || process.env.ANTHROPIC_API_BASE_URL! };
        }

        const runtime = await resolveAnthropicRuntimeProfile(projectRoot);
        if (!runtime.apiKey) return null;
        return { apiKey: runtime.apiKey, baseUrl: runtime.baseUrl || process.env.ANTHROPIC_API_BASE_URL! };
      } catch {
        return null;
      }
    },
  };
  const sessionSealer = new SessionSealer(
    sessionChainStore,
    transcriptWriter,
    threadStore,
    transcriptReader,
    (agentId) => getAgentContextBudget(agentId).maxPromptTokens,
    handoffConfig,
  );

  // F102: Evidence services — provider-based, default noop
  // Evidence module: create with default input
  const { createEvidenceModule } = await import('./evidence/module.js');
  const evidenceModule = await createEvidenceModule({
    env,
    moduleLoader: workspaceModuleLoader,
    input: {
      sqlitePath: env.EVIDENCE_DB ?? resolve(installRoot, 'data', 'evidence.sqlite'),
      docsRoot: env.DOCS_ROOT ?? resolve(installRoot, 'docs'),
      transcriptDataDir,
      embed: env.EMBED_MODE ? { embedMode: env.EMBED_MODE as 'off' | 'shadow' | 'on' } : undefined,
      messageListFn: async (threadId: string, limit?: number) => {
        const messages = await messageStore.getByThread(threadId, limit ?? 2000, 'default-user');
        return messages.map(
          (m: { id: string; content: string; agentId?: string | null; threadId: string; timestamp: number }) => ({
            id: m.id,
            content: m.content,
            agentId: m.agentId ?? undefined,
            threadId: m.threadId,
            timestamp: m.timestamp,
          }),
        );
      },
    },
  });
  app.log.info(`[api] F102: evidence provider initialized: ${evidenceModule.activeProviderId}`);

  const { KnowledgeResolver } = await import('./domains/memory/KnowledgeResolver.js');
  const { MarkerQueue } = await import('./domains/memory/MarkerQueue.js');
  const { MaterializationService } = await import('./domains/memory/MaterializationService.js');
  const { ReflectionService } = await import('./domains/memory/ReflectionService.js');
  const docsRoot = env.DOCS_ROOT ?? resolve(installRoot, 'docs');
  const markerQueue = new MarkerQueue(resolve(installRoot, 'docs', 'markers'));
  const memoryServices = {
    evidenceStore: evidenceModule.services.store,
    markerQueue,
    reflectionService: new ReflectionService(
      async () => '[reflect not configured — use search_evidence to find project knowledge]',
    ),
    knowledgeResolver: new KnowledgeResolver({ projectStore: evidenceModule.services.store }),
    indexBuilder: evidenceModule.services.index,
    materializationService: new MaterializationService(markerQueue, docsRoot),
  };

  // F102 D-2: Auto-rebuild evidence index on startup (AC-D4)
  if (memoryServices.indexBuilder) {
    const startMs = Date.now();
    try {
      const result = await memoryServices.indexBuilder.rebuild();
      app.log.info(
        `[api] F102: evidence index rebuilt — ${result.docsIndexed} indexed, ${result.docsSkipped} skipped (${Date.now() - startMs}ms)`,
      );
    } catch (err) {
      app.log.warn(`[api] F102: evidence index rebuild failed (non-fatal): ${err}`);
    }
  }

  // Phase E-2: Dirty-thread debounce — flush modified thread summaries every 30s
  const DIRTY_THREAD_FLUSH_INTERVAL_MS = 30_000;
  if (memoryServices.indexBuilder) {
    const ib = memoryServices.indexBuilder;
    if (
      typeof (ib as { markThreadDirty?: unknown }).markThreadDirty === 'function' &&
      typeof (ib as { accumulateSummaryDelta?: unknown }).accumulateSummaryDelta === 'function' &&
      typeof (ib as { flushDirtyThreads?: unknown }).flushDirtyThreads === 'function'
    ) {
      // F102 KD-34: Wire append listener now that memoryServices is ready.
      // This covers ALL 36 messageStore.append() call sites via the store itself,
      // replacing the old HTTP onResponse hooks that only caught 2 routes.
      appendListener = (msg) => {
        if (msg.threadId) {
          (ib as unknown as { markThreadDirty: (threadId: string) => void }).markThreadDirty(msg.threadId);
          // G-3c P1 fix (砚砚 review): accumulate delta from actual new message,
          // not from rebuilt summary snapshot in flushDirtyThreads
          (
            ib as unknown as { accumulateSummaryDelta: (threadId: string, content: string) => void }
          ).accumulateSummaryDelta(msg.threadId, msg.content);
        }
      };

      const dirtyFlushTimer = setInterval(async () => {
        try {
          const flushed = await (ib as unknown as { flushDirtyThreads: () => Promise<number> }).flushDirtyThreads();
          if (flushed > 0) {
            app.log.info(`[api] F102 E-2: flushed ${flushed} dirty thread(s) to evidence index`);
          }
        } catch {
          // best-effort
        }
      }, DIRTY_THREAD_FLUSH_INTERVAL_MS);
      dirtyFlushTimer.unref();
    }
  }

  // ── Phase G: Summary Compaction Scheduler ──
  if (env.F102_ABSTRACTIVE === 'on') {
    app.log.warn('[api] F102 Phase G: summary compaction requires a provider capability and is disabled');
  }

  // ── F139: Unified Scheduler (TaskRunnerV2) — additive, runs alongside V1 ──
  // Hoist reference so invokeTrigger (created later) can be late-bound
  let taskRunnerV2Ref: import('./infrastructure/scheduler/TaskRunnerV2.js').TaskRunnerV2 | null = null;
  let dynamicTaskStoreRef: import('@openjiuwen/relay-api-server-contracts/scheduler').DynamicTaskPort | null = null;
  try {
    // Scheduler module: create with default input
    const { createSchedulerModule } = await import('./scheduler-persistence/module.js');
    const schedulerModule = await createSchedulerModule({
      env,
      moduleLoader: workspaceModuleLoader,
      input: {
        sqlitePath: env.EVIDENCE_DB ?? resolve(installRoot, 'data', 'evidence.sqlite'),
      },
    });
    app.log.info(`[api] F139: scheduler provider initialized: ${schedulerModule.activeProviderId}`);
    if (schedulerModule.activeProviderId === 'noop') {
      throw new Error('scheduler provider is noop');
    }

    const { TaskRunnerV2 } = await import('./infrastructure/scheduler/TaskRunnerV2.js');
    const { createActorResolver } = await import('./infrastructure/scheduler/ActorResolver.js');
    const { getRoster } = await import('./config/office-claw-config-loader.js');
    const runLedger = schedulerModule.persistence.ledger;
    const actorResolver = createActorResolver(getRoster);

    // Governance + Emission stores
    const globalControlStore = schedulerModule.persistence.globalControlStore;
    const emissionStore = schedulerModule.persistence.emissionStore;
    const packTemplateStore = schedulerModule.persistence.packTemplateStore;

    // Delivery + content fetch for template execution
    const { createDeliverFn } = await import('./infrastructure/scheduler/delivery.js');
    const { createFetchContentFn } = await import('./infrastructure/scheduler/content-fetcher.js');
    const schedulerDeliver = createDeliverFn({ messageStore, socketManager: getSocketManager() });
    const schedulerFetchContent = createFetchContentFn();

    const taskRunnerV2 = new TaskRunnerV2({
      logger: { info: app.log.info.bind(app.log), error: app.log.error.bind(app.log) },
      ledger: runLedger,
      actorResolver,
      globalControlStore,
      emissionStore,
      deliver: schedulerDeliver,
      fetchContent: schedulerFetchContent,
      resolveThreadTitle: async (threadId) => (await threadStore.get(threadId))?.title ?? null,
    });

    // Dynamic task store + template registry
    const { templateRegistry } = await import('./infrastructure/scheduler/templates/registry.js');
    const dynamicTaskStore = schedulerModule.persistence.dynamicTaskStore;
    dynamicTaskStoreRef = dynamicTaskStore;
    taskRunnerV2.setDynamicTaskStore(dynamicTaskStore);

    // Schedule panel API routes - part of 'scheduler' group
    if (!shouldSkipFeature('scheduler')) {
      const { scheduleRoutes } = await import('./routes/schedule.js');
      await app.register(scheduleRoutes, {
        taskRunner: taskRunnerV2,
        registry,
        browserUserVerifier: verifyPrimaryUserId,
        dynamicTaskStore,
        threadStore,
        templateRegistry,
        globalControlStore,
        packTemplateStore,
        deliver: schedulerDeliver,
      });
    }

    // Hydrate persisted dynamic tasks + start
    taskRunnerV2.hydrateDynamic(dynamicTaskStore, templateRegistry);
    taskRunnerV2.start();
    taskRunnerV2Ref = taskRunnerV2;
    app.log.info(`[api] F139: TaskRunnerV2 started, tasks: [${taskRunnerV2.getRegisteredTasks().join(', ')}]`);
  } catch (err) {
    app.log.warn(`[api] F139: TaskRunnerV2 init failed (non-fatal): ${err}`);
  }

  const extraPlugins = (globalThis as Record<string, unknown>).__clowder_extra_plugins;
  const configuredExtraPlugins = Array.isArray(extraPlugins)
    ? (extraPlugins as readonly OfficeClawProviderPlugin[])
    : undefined;
  const pluginRegistry = await createProviderPluginRegistry({
    extraPlugins: configuredExtraPlugins,
  });
  initPluginRegistry(pluginRegistry);
  app.log.info(`[api] PluginRegistry initialized: providers=[${pluginRegistry.getAllProviders().join(', ')}]`);

  const catalogModule = options.catalogModule ?? await createCatalogModule({ env, cwd: process.cwd() });
  const catalogProvider = catalogModule.getActiveProvider();
  app.log.info(
    `[api] Catalog provider: ${catalogModule.activeProviderId} (registered: ${catalogModule.providerRegistry.listIds().join(', ')})`,
  );

  const authModule = await createAuthModule({ moduleLoader: workspaceModuleLoader, env });
  initProtocolCredentialAdapter(authModule);

  const startupAuthResult =
    authModule.activeProviderId === 'no-auth'
      ? await authModule.getActiveProvider().authenticate({ credentials: {} })
      : null;
  const startupIdentity =
    startupAuthResult && startupAuthResult.success ? { userId: startupAuthResult.principal.userId } : null;
  const bootstrapIdentity = startupIdentity ?? { userId: 'system-bootstrap' };
  // ── F32-b: AgentRegistry (agentId → AgentService) — one instance per agent ──
  // Each agent gets its own AgentService instance with its agentId + model.
  const agentRegistry = new AgentRegistry();
  let router!: AgentRouter;
  const isGlobalCatalog = catalogProvider.id === 'file';
  const syncAgentRegistry = async (configs: Record<string, OfficeClawConfigEntry>) => {
    const projectRoot = resolveActiveProjectRoot(process.cwd());
    const previousEntries = agentRegistry.getAllEntries();
    if (isGlobalCatalog) {
      officeClawRegistry.reset();
      for (const [id, config] of Object.entries(configs)) {
        officeClawRegistry.register(id, config);
      }
    }
    agentRegistry.reset();
    for (const [id, config] of Object.entries(configs)) {
      const agentId = config.id;
      const plugin = pluginRegistry.get(config.provider);
      if (!plugin) {
        app.log.warn(`[api] Unknown provider "${config.provider}" for agent "${id}". It will not be routable.`);
        continue;
      }
      try {
        const service = await plugin.createAgentService({
          agentId,
          agentConfig: config,
          env: process.env,
          projectRoot,
        });
        agentRegistry.register(id, service);
      } catch (err) {
        app.log.warn(
          `[api] Failed to create AgentService for agent "${id}" via plugin "${plugin.name}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    for (const service of previousEntries.values()) {
      const disposable = service as { dispose?: () => void | Promise<void> };
      try {
        await disposable.dispose?.();
      } catch (err) {
        app.log.warn(`[api] Agent service dispose failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (router) router.refreshFromRegistry(agentRegistry);
  };
  const initialSnapshot = await catalogProvider.readCatalog(bootstrapIdentity);
  const initialConfigs = toAllAgentConfigs(initialSnapshot.catalog);
  initExpertCatalog();
  const expertConfigs = getExpertAgentConfigs();
  const mergedInitialConfigs = { ...initialConfigs, ...expertConfigs };
  if (isGlobalCatalog) {
    officeClawRegistry.reset();
    for (const [id, config] of Object.entries(mergedInitialConfigs)) {
      officeClawRegistry.register(id, config);
    }
    app.log.info(`[api] AgentRegistry initialized: ${officeClawRegistry.getAllIds().join(', ')}`);
  } else {
    app.log.info(
      `[api] AgentRegistry initialized from catalog provider for bootstrap identity ${bootstrapIdentity.userId}`,
    );
  }
  await syncAgentRegistry(mergedInitialConfigs);

  // F089 Phase 2: Shared instances for tmux agent pane execution (opt-in)
  const enableTmuxAgent = process.env.OFFICE_CLAW_TMUX_AGENT === '1';
  let tmuxGateway: TmuxGateway | undefined;
  if (enableTmuxAgent) {
    try {
      tmuxGateway = new TmuxGateway();
      app.log.info(`[tmux] enabled — binary: ${tmuxGateway.tmuxBin}`);
    } catch (err) {
      app.log.error(`[tmux] OFFICE_CLAW_TMUX_AGENT=1 but tmux not found: ${(err as Error).message}`);
    }
  }
  const agentPaneRegistry = tmuxGateway ? new AgentPaneRegistry() : undefined;

  // Shared AgentRouter — used by messagesRoutes and invocationsRoutes
  router = new AgentRouter({
    agentRegistry,
    catalogProvider,
    registry,
    messageStore,
    taskProgressStore,
    ...(deliveryCursorStore ? { deliveryCursorStore } : {}),
    ...(sessionStore ? { sessionStore } : {}),
    ...(threadStore ? { threadStore } : {}),
    sessionChainStore,
    transcriptWriter,
    transcriptReader,
    sessionSealer,
    draftStore,
    taskStore,
    ...(workflowSopStore ? { workflowSopStore } : {}),
    executionDigestStore,
    socketManager,
    ...(tmuxGateway ? { tmuxGateway } : {}),
    ...(agentPaneRegistry ? { agentPaneRegistry } : {}),
  });

  const hostRoot = resolveOfficeClawHostRoot(process.cwd());
  const pptTemplateLog = app.log.child({ scope: 'ppt-template-generate' });
  const pptTemplateStore = new PptTemplateStore(resolve(hostRoot, '.office-claw', 'ppt-template'), hostRoot);
  await pptTemplateStore.ensureReady();
  const pptTemplateGenerationService = new PptTemplateGenerationService({
    store: pptTemplateStore,
    hostRoot,
    invokeSkill: async ({ prompt, originFilePath, outputRoot, signal }) => {
      const internalUserId = process.env.CURRENT_USER_ID ?? process.env.DEFAULT_OWNER_USER_ID ?? 'system';
      pptTemplateLog.info(
        {
          originFilePath,
          outputRoot,
          promptLength: prompt.length,
        },
        'preparing internal skill invocation',
      );
      const internalThread = await threadStore.create(internalUserId, '[PPT Template Generation]', hostRoot);
      const targetAgents = [createAgentId('office')];
      const intent = parseIntent(prompt, targetAgents.length);
      pptTemplateLog.info(
        {
          internalThreadId: internalThread.id,
          internalUserId,
          targetAgents,
          originFilePath,
          outputRoot,
          promptLength: prompt.length,
        },
        'starting internal skill invocation',
      );
      const userMessage = await messageStore.append({
        userId: internalUserId,
        agentId: null,
        content: prompt,
        mentions: [],
        timestamp: Date.now(),
        threadId: internalThread.id,
      });
      const chunks: string[] = [];
      try {
        for await (const msg of router.routeExecution(
          internalUserId,
          prompt,
          internalThread.id,
          userMessage.id,
          targetAgents,
          intent,
          {
            callbackEnvOverrides: {
              OFFICE_CLAW_AUTO_APPROVE_PERMISSION_INTERRUPT: '1',
            },
            gatewayIdentity: { userId: internalUserId },
            interactiveAsk: true,
            ...(signal ? { signal } : {}),
          },
        )) {
          pptTemplateLog.info(
            {
              internalThreadId: internalThread.id,
              type: msg.type,
              agentId: msg.agentId,
              hasContent: Boolean(msg.content),
              hasError: Boolean(msg.error),
              isFinal: msg.isFinal,
            },
            'internal skill stream event',
          );
          if (msg.type === 'text' && msg.content) chunks.push(msg.content);
          if (msg.type === 'error' && msg.error) {
            throw new Error(msg.error);
          }
          if (msg.type === 'done' && msg.error) {
            throw new Error(msg.error);
          }
        }
      } finally {
        pptTemplateLog.info({ internalThreadId: internalThread.id }, 'cleaning up internal skill thread');
        await threadStore.delete(internalThread.id);
        await messageStore.deleteByThread(internalThread.id);
      }
      pptTemplateLog.info(
        {
          internalThreadId: internalThread.id,
          stdoutLength: chunks.join('').length,
        },
        'internal skill invocation completed',
      );
      return { stdout: chunks.join('') };
    },
  });

  // F39: Message queue delivery
  const invocationQueue = new InvocationQueue(redis);
  await invocationQueue.hydrate();
  const queueProcessor = new QueueProcessor({
    queue: invocationQueue,
    invocationTracker,
    invocationRecordStore: invocationRecordStore as unknown as InvocationRecordStoreLike,
    router: router as unknown as RouterLike,
    socketManager,
    messageStore,
    log: app.log,
  });

  // F142: Resolve data dirs relative to monorepo root (not API cwd) so they land in PRESERVE zone
  const monoRoot = findMonorepoRoot(process.cwd());
  const uploadDir = resolve(monoRoot, process.env.UPLOAD_DIR ?? 'data/uploads');

  // Register routes (socketManager injected, no circular import)
  const messagesOpts = {
    registry,
    messageStore,
    socketManager,
    router,
    deliveryCursorStore,
    ...(sessionStore ? { sessionStore } : {}),
    threadStore,
    invocationTracker,
    invocationRecordStore,
    draftStore,
    invocationQueue,
    queueProcessor,
    pptTemplateStore,
    uploadDir,
  };
  await app.register(messagesRoutes, messagesOpts);
  await app.register(queueRoutes, {
    threadStore,
    invocationQueue,
    queueProcessor,
    invocationTracker,
    socketManager,
    ...(sessionStore ? { sessionStore } : {}),
    ...(sessionChainStore ? { sessionChainStore } : {}),
    ...(sessionSealer ? { sessionSealer } : {}),
    ...(taskProgressStore ? { taskProgressStore } : {}),
    messageStore, // F117: for marking queued messages as canceled on withdraw/clear
  });
  await app.register(invocationsRoutes, {
    invocationRecordStore,
    messageStore,
    socketManager,
    router,
    invocationTracker,
    queueProcessor,
    uploadDir,
  });
  await app.register(messageActionsRoutes, {
    messageStore,
    socketManager,
    threadStore,
    feedbackStore,
  });
  await app.register(feedbackRoutes, {
    feedbackStore,
    messageStore,
  });
  await app.register(catsRoutes, { onCatalogChanged: syncAgentRegistry, catalogProvider });
  await app.register(expertsRoutes, { threadStore });
  await app.register(availableClientsRoutes);
  await app.register(quotaRoutes);
  // F128: Daily token usage aggregation
  await app.register(usageRoutes, { invocationRecordStore });

  // Connector hub routes - opts created inside registerFeatureRoutes to avoid dead allocation when skipped
  let connectorHubOpts: Parameters<typeof connectorHubRoutes>[1] | undefined;

  // TD091: Create prTrackingStore early so callbacks can use it for MCP registration
  const prTrackingStore = redis ? new RedisPrTrackingStore(redis) : new MemoryPrTrackingStore();
  app.log.info(`[api] PrTrackingStore: ${redis ? 'Redis' : 'Memory'}`);

  // F126: Create LimbRegistry + Phase B deps for device/hardware capability management
  const { LimbRegistry } = await import('./domains/limb/LimbRegistry.js');
  const { LimbAccessPolicy } = await import('./domains/limb/LimbAccessPolicy.js');
  const { LimbLeaseManager } = await import('./domains/limb/LimbLeaseManager.js');
  const { LimbActionLog } = await import('./domains/limb/LimbActionLog.js');
  const limbRegistry = new LimbRegistry();
  limbRegistry.setDeps({
    accessPolicy: new LimbAccessPolicy(),
    leaseManager: new LimbLeaseManager(),
    actionLog: new LimbActionLog(),
  });

  // F126 Phase C: Pairing store + limb node routes for remote devices
  const { LimbPairingStore } = await import('./domains/limb/LimbPairingStore.js');
  const { registerLimbNodeRoutes } = await import('./routes/limb-node-routes.js');
  const limbPairingStore = new LimbPairingStore();
  registerLimbNodeRoutes(app, { limbRegistry, pairingStore: limbPairingStore });

  const callbackOpts = {
    registry,
    messageStore,
    socketManager,
    taskStore,
    backlogStore,
    threadStore,
    router,
    invocationRecordStore,
    invocationTracker,
    deliveryCursorStore,
    prTrackingStore,
    ...(workflowSopStore ? { workflowSopStore } : {}),
    queueProcessor,
    invocationQueue,
    evidenceStore: memoryServices.evidenceStore,
    markerQueue: memoryServices.markerQueue,
    reflectionService: memoryServices.reflectionService,
    limbRegistry,
    limbPairingStore,
  } as Parameters<typeof callbacksRoutes>[1];
  await app.register(callbacksRoutes, callbackOpts);

  // Authorization system — 智能体动态权限 (provider-backed)
  const authRuleStore = await storageProvider.createAuthorizationRuleStore();
  const authPendingStore = await storageProvider.createPendingRequestStore();
  const authAuditStore = await storageProvider.createAuthorizationAuditStore();
  const approvalRecordProviderId = process.env.OFFICE_CLAW_APPROVAL_RECORD_PROVIDER?.trim();
  const approvalRecordProvider = approvalRecordProviderId
    ? storageModule.providerRegistry.get(approvalRecordProviderId)
    : storageProvider;
  const approvalRecordStore: IApprovalRecordStore | undefined = await approvalRecordProvider.createApprovalRecordStore?.({
    storagePath: process.env.AUTHORIZATION_APPROVAL_DB ?? resolve(installRoot, 'data', 'security-approval-records.sqlite'),
  });
  if (!approvalRecordStore) {
    app.log.warn('[api] Security approval record store unavailable; approval records API will return 503');
  }
  if (approvalRecordStore) {
    app.addHook('onClose', async () => {
      approvalRecordStore.close();
    });
  }
  const jiuwenPermissionBridge = getJiuwenPermissionBridge();
  const authManager = new AuthorizationManager({
    ruleStore: authRuleStore,
    pendingStore: authPendingStore,
    auditStore: authAuditStore,
    approvalRecordStore,
    resolveThreadTitle: async (threadId) => (await threadStore.get(threadId))?.title ?? null,
    invocationRegistry: registry,
    invocationRecordStore,
    jiuwenPermissionBridge,
    io: socketManager.getIO(),
  });
  jiuwenPermissionBridge.bindAuthorizationManager(authManager);
  jiuwenPermissionBridge.bindInvocationTracker(invocationTracker);
  getAskUserQuestionBridge().bindSocketManager(socketManager);
  const connectorBindingStore = redisClient
    ? new RedisConnectorThreadBindingStore(redisClient)
    : new MemoryConnectorThreadBindingStore();
  await app.register(callbackAuthRoutes, { registry, authManager });
  await app.register(authorizationRoutes, {
    authManager,
    ruleStore: authRuleStore,
    auditStore: authAuditStore,
    socketManager,
    approvalRecordStore,
    jiuwenPermissionBridge,
  });
  await app.register(askUserQuestionRoutes, {});
  await app.register(threadsRoutes, {
    threadStore,
    connectorBindingStore,
    messageStore,
    feedbackStore,
    taskStore,
    memoryStore,
    deliveryCursorStore,
    invocationTracker,
    draftStore,
    taskProgressStore,
    backlogStore,
    ...(readStateStore ? { readStateStore } : {}),
    ...(dynamicTaskStoreRef ? { dynamicTaskStore: dynamicTaskStoreRef } : {}),
    ...(taskRunnerV2Ref ? { taskRunner: taskRunnerV2Ref } : {}),
  });
  await app.register(threadBranchRoutes, {
    threadStore,
    messageStore,
    socketManager,
  });
  await app.register(threadExportRoutes, { threadStore });
  await app.register(tasksRoutes, { taskStore, socketManager });
  await app.register(backlogRoutes, { backlogStore, threadStore, messageStore });

  // F076: External projects + Need Audit
  const { ExternalProjectStore } = await import('./domains/projects/external-project-store.js');
  const { IntentCardStore } = await import('./domains/projects/intent-card-store.js');
  const { NeedAuditFrameStore } = await import('./domains/projects/need-audit-frame-store.js');
  const externalProjectStore = new ExternalProjectStore();
  const intentCardStore = new IntentCardStore();
  const needAuditFrameStore = new NeedAuditFrameStore();
  const { ResolutionStore } = await import('./domains/projects/resolution-store.js');
  const { SliceStore } = await import('./domains/projects/slice-store.js');
  const { RefluxPatternStore } = await import('./domains/projects/reflux-pattern-store.js');
  const resolutionStore = new ResolutionStore();
  const sliceStore = new SliceStore();
  const refluxPatternStore = new RefluxPatternStore();
  await app.register(externalProjectRoutes, { externalProjectStore, needAuditFrameStore, backlogStore });
  await app.register(intentCardRoutes, { externalProjectStore, intentCardStore });
  await app.register(resolutionRoutes, { externalProjectStore, resolutionStore });
  await app.register(sliceRoutes, { externalProjectStore, sliceStore });
  await app.register(refluxRoutes, { externalProjectStore, refluxPatternStore });
  await app.register(executionDigestRoutes, { executionDigestStore });
  if (workflowSopStore) {
    await app.register(workflowSopRoutes, { workflowSopStore, backlogStore });
  }
  await app.register(projectsRoutes);
  await app.register(exportRoutes, { messageStore, threadStore });
  const configRouteOpts: Parameters<typeof configRoutes>[1] = {
    agentRegistry,
  };
  await app.register(configRoutes, configRouteOpts);
  await app.register(featureDocDetailRoutes);
  await app.register(modelConfigProfilesRoutes);
  await app.register(pptTemplatesRoutes, {
    store: pptTemplateStore,
    generationService: pptTemplateGenerationService,
  });
  await app.register(inspirationRoutes);
  await app.register(providerProfilesRoutes);
  await app.register(claudeRescueRoutes);
  await app.register(auditRoutes, { threadStore });
  await app.register(authRoutes, {
    authModule,
    onPostLogin: async (request, session) => {
      await connectorGatewayHandle?.setOwnerUserId(session.userId);

      await request.server.inject({
        method: 'GET',
        url: '/api/maas-models',
        headers: {
          authorization: `Bearer ${session.sessionId}`,
          'x-office-claw-user': session.userId,
          'x-refresh': 'true',
        },
      });

      },
  });
  await app.register(versionRoutes);
  await app.register(maasModelsRoutes);
  await app.register(capabilitiesRoutes);

  // Terminal routes
  await registerFeatureRoutes('terminal', async () => {
    await app.register(terminalRoutes, {
      ...(tmuxGateway ? { tmuxGateway } : {}),
      ...(agentPaneRegistry ? { agentPaneRegistry } : {}),
    });
  });

  // PPT routes
  await registerFeatureRoutes('ppt', async () => {
    await app.register(pptStudioRoutes);
  });
  // PPT Templates already registered above (line ~1221)

  await app.register(skillsRoutes);
  await app.register(soulTemplatesRoutes);

  // Memory routes - all memory-related routes in one atomic registration
  const governanceStore = new MemoryGovernanceStore();
  await registerFeatureRoutes('memory', async () => {
    await app.register(memoryRoutes, { memoryStore, threadStore });
    await app.register(evidenceRoutes, {
      evidenceStore: memoryServices.evidenceStore,
      indexBuilder: memoryServices.indexBuilder,
    });
    await app.register(reflectRoutes, {
      reflectionService: memoryServices.reflectionService,
    });
    await app.register(memoryPublishRoutes, { governanceStore });
  });

  // Session chain (F24) - all session-related routes in one atomic registration
  await registerFeatureRoutes('session', async () => {
    await app.register(sessionChainRoutes, {
      sessionChainStore,
      threadStore,
      messageStore,
      transcriptReader,
      sessionSealer,
    });
    await app.register(sessionTranscriptRoutes, { sessionChainStore, threadStore, transcriptReader });
    const hookToken = env.OFFICE_CLAW_HOOK_TOKEN || '';
    await app.register(sessionHooksRoutes, {
      sessionChainStore,
      sessionSealer,
      transcriptReader,
      ...(hookToken ? { hookToken } : {}),
    });
    await app.register(sessionStrategyConfigRoutes);
  });

  // F33 Phase 3: Session strategy config (runtime overrides via Redis)
  if (redis) {
    try {
      await initRuntimeOverrides(redis);
      app.log.info('[api] Session strategy runtime overrides hydrated from Redis');
    } catch (err) {
      app.log.warn(
        `[api] Session strategy hydration failed (best-effort, continuing with empty cache): ${String(err)}`,
      );
    }
  }

  // Commands route needs opus service for task extraction
  const opusService = new ClaudeAgentService();
  await app.register(commandsRoutes, {
    messageStore,
    taskStore,
    socketManager,
    opusService,
    threadStore,
  });

  // Serve uploaded files (images)
  await registerFeatureRoutes('uploads', async () => {
    await app.register(uploadsRoutes, { uploadDir });
  });

  // F34: TTS Provider (mlx-audio → Python TTS server) - part of 'tts' group
  const ttsRegistry = new TtsRegistry();
  const ttsUrl = env.TTS_URL!;
  ttsRegistry.register(new MlxAudioTtsProvider({ baseUrl: ttsUrl }));
  const ttsCacheDir = resolve(monoRoot, env.TTS_CACHE_DIR ?? 'data/tts-cache');
  await registerFeatureRoutes('tts', async () => {
    await app.register(ttsRoutes, { ttsRegistry, cacheDir: ttsCacheDir });
  });
  initVoiceBlockSynthesizer(ttsRegistry, ttsCacheDir);
  initStreamingTtsRegistry(ttsRegistry);
  startTtsCacheCleaner(ttsCacheDir);

  // C1+C2: Web Push Notifications (optional — requires VAPID keys) - part of 'push' group
  const vapidPublicKey = env.VAPID_PUBLIC_KEY ?? '';
  const vapidPrivateKey = env.VAPID_PRIVATE_KEY ?? '';
  const vapidSubject = env.VAPID_SUBJECT ?? 'mailto:office-claw@localhost';
  const pushSubscriptionStore = await storageProvider.createPushSubscriptionStore();
  const pushService =
    vapidPublicKey && vapidPrivateKey
      ? initPushNotificationService({
          subscriptionStore: pushSubscriptionStore,
          vapidPublicKey,
          vapidPrivateKey,
          vapidSubject,
        })
      : null;
  if (pushService) {
    app.log.info('[api] Web Push enabled (VAPID configured)');
  } else {
    app.log.info('[api] Web Push disabled (VAPID keys not set)');
  }
  await registerFeatureRoutes('push', async () => {
    await app.register(pushRoutes, { pushSubscriptionStore, pushService, vapidPublicKey });
  });

  // F-BLOAT: Progressive disclosure docs endpoints (no auth, static content)
  await app.register(registerCallbackDocsRoutes);

  // GitHub Review Watcher stores + routes (BACKLOG #81)
  // Must register routes BEFORE app.listen()
  const processedEmailStore = new MemoryProcessedEmailStore();
  const reviewRouter = new ReviewRouter({
    prTrackingStore,
    processedEmailStore,
    threadStore,
    messageStore,
    socketManager,
    log: app.log,
    defaultUserId: 'default-user',
    reviewContentFetcher: new GhCliReviewContentFetcher(app.log),
  });
  await app.register(prTrackingRoutes, { prTrackingStore });

  // F088: Connector routes - all connector routes in one atomic registration (BEFORE listen)
  const connectorWebhookHandlers = new Map<string, import('./routes/connector-webhooks.js').ConnectorWebhookHandler>();
  await registerFeatureRoutes('connector', async () => {
    connectorHubOpts = { threadStore };
    await app.register(connectorHubRoutes, connectorHubOpts);
    const connectorMediaDir = resolve(monoRoot, env.CONNECTOR_MEDIA_DIR ?? 'data/connector-media');
    await app.register(connectorMediaRoutes, { mediaDir: connectorMediaDir });
    await app.register(connectorWebhookRoutes, { handlers: connectorWebhookHandlers });
  });

  // ApiInitContext for afterInit hook
  const initCtx: ApiInitContext = {
    env: process.env,
    cwd: process.cwd(),
    app,
    stores: {
      messageStore,
      threadStore,
      taskStore,
      backlogStore,
      memoryStore,
      sessionChainStore,
      invocationRecordStore,
    },
    services: {
      socketManager: getSocketManager(),
      invocationRegistry: registry,
      agentServiceRegistry: agentRegistry,
      router: router,
      authManager,
    },
    modules: {
      authModule,
      storageModule,
      catalogModule,
      evidenceModule,
      pluginRegistry,
    },
  };
  await options.hooks?.afterInit?.(initCtx);

  let apiInstanceLease: ApiInstanceLease | undefined;
  let shutdownForLeaseLoss: ((signal: string) => Promise<void>) | null = null;
  let forcedLeaseLossExitTimer: ReturnType<typeof setTimeout> | null = null;
  const handleLeaseInvalidation = (event: ApiInstanceLeaseInvalidation): void => {
    const errorDetail = event.error ? ` error=${String(event.error)}` : '';
    app.log.error(
      `[api] API namespace lease invalidated (${event.reason}) for ${event.holder.instanceId} pid=${event.holder.pid} host=${event.holder.hostname} port=${event.holder.apiPort}; shutting down to preserve Redis singleton.${errorDetail}`,
    );
    if (!forcedLeaseLossExitTimer) {
      forcedLeaseLossExitTimer = setTimeout(() => {
        app.log.error('[api] Lease-loss shutdown timed out; forcing process exit');
        process.exit(1);
      }, 5_000);
      forcedLeaseLossExitTimer.unref?.();
    }
    if (shutdownForLeaseLoss) {
      void shutdownForLeaseLoss(`API_INSTANCE_LEASE_${event.reason.toUpperCase()}`);
      return;
    }
    process.exitCode = 1;
    setImmediate(() => process.exit(1));
  };
  if (redis) {
    apiInstanceLease = new ApiInstanceLease(redis, {
      apiPort: PORT,
      cwd: process.cwd(),
      startedAt: PROCESS_START_AT,
      onLeaseInvalidated: handleLeaseInvalidation,
    });
    const leaseResult = await apiInstanceLease.acquire();
    if (!leaseResult.acquired) {
      await apiInstanceLease.release().catch(() => {});
      await redis.quit().catch(() => {});
      const holder = leaseResult.holder;
      const holderHint = holder
        ? ` holder=${holder.instanceId} pid=${holder.pid} host=${holder.hostname} port=${holder.apiPort}`
        : '';
      throw new Error(`[api] Redis namespace already has a live API instance; refusing to start.${holderHint}`);
    }
    const redisLabel = redisUrl
      ? (() => {
          try {
            const u = new URL(redisUrl);
            return `${u.hostname}:${u.port || '6379'}`;
          } catch {
            return 'configured';
          }
        })()
      : 'memory';
    app.log.info(
      `[api] API namespace lease acquired (${leaseResult.holder?.instanceId ?? 'unknown'}) on redis=${redisLabel}`,
    );
  }

  // Start listening
  let address: string;
  try {
    address = await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    await apiInstanceLease?.release().catch(() => {});
    throw err;
  }
  app.log.info(`[api] Server running on ${address}`);
  app.log.info(`[ws] WebSocket server ready`);

  // Refresh TTL on existing Redis keys to pick up current defaults (non-blocking)
  if (redisClient) {
    refreshRedisTtlBackground(redisClient, messageTtlSeconds, threadTtlSeconds);
  }

  try {
    const projectRoot = resolveActiveProjectRoot(process.cwd());
    await readProviderProfiles(projectRoot);
    app.log.info(`[api] provider profiles warmed up for ${projectRoot}`);
  } catch (err) {
    app.log.warn(`[api] provider profiles warmup failed (best-effort): ${String(err)}`);
  }

  // Detect available CLI clients at startup (non-blocking)
  const { detectAvailableClients } = await import('./utils/client-detection.js');
  detectAvailableClients()
    .then((clients) => {
      const available = clients.filter((c) => c.available).map((c) => c.label);
      app.log.info(`[api] Available CLI clients: ${available.length > 0 ? available.join(', ') : '(none)'}`);
    })
    .catch((err) => {
      app.log.warn(`[api] Client detection failed: ${err}`);
    });

  // F048 Phase A: Sweep orphaned invocations from previous process crash.
  // Runs only after the API has both:
  // 1) acquired the Redis namespace lease, and
  // 2) successfully bound its HTTP port.
  // This prevents a second worktree/runtime instance from sweeping another
  // live process that happens to share the same Redis namespace.
  if (redis) {
    const { StartupReconciler } = await import('./domains/agents/services/agents/invocation/StartupReconciler.js');
    const reconciler = new StartupReconciler({
      invocationRecordStore,
      taskProgressStore,
      log: app.log,
      processStartAt: PROCESS_START_AT,
      messageStore,
      socketManager: socketManager ?? undefined,
    });
    try {
      await reconciler.reconcileOrphans();
    } catch (err) {
      app.log.warn(`[api] Startup sweep failed (best-effort): ${String(err)}`);
    }
  }

  // F118 Hardening: Global session reaper — startup sweep + periodic scan.
  // Reconciles sessions stuck in 'sealing' state that the per-invoke lazy
  // reaper would never visit (e.g., threads with no subsequent invocations).
  const GLOBAL_REAPER_INTERVAL_MS = 5 * 60_000;
  try {
    const startupReaped = await sessionSealer.reconcileAllStuck();
    if (startupReaped > 0) {
      app.log.info(`[api] F118 global reaper: reconciled ${startupReaped} stuck sealing session(s) at startup`);
    }
  } catch (err) {
    app.log.warn(`[api] F118 global reaper startup sweep failed (best-effort): ${String(err)}`);
  }
  const globalReaperTimer = setInterval(async () => {
    try {
      const reaped = await sessionSealer.reconcileAllStuck();
      if (reaped > 0) {
        app.log.info(`[api] F118 global reaper: reconciled ${reaped} stuck sealing session(s)`);
      }
    } catch {
      // best-effort periodic reaper
    }
  }, GLOBAL_REAPER_INTERVAL_MS);
  globalReaperTimer.unref();

  // Log server startup to audit log (best-effort: don't crash if audit dir unwritable)
  const auditLog = getEventAuditLog();
  try {
    await auditLog.append({
      type: AuditEventTypes.SERVER_STARTED,
      data: { address, port: PORT, host: HOST, redis: redisClient ? 'connected' : 'memory' },
    });
  } catch (err) {
    app.log.warn(`[api] Audit log write failed (best-effort): ${String(err)}`);
  }

  // Best-effort: bootstrap capabilities + regenerate CLI configs at startup so
  // project-level MCP config files exist even before the Hub page is opened.
  try {
    const root = resolveOfficeClawHostRoot(process.cwd());
    await orchestrate(
      root,
      {
        claudeConfig: join(root, '.mcp.json'),
        codexConfig: join(root, '.codex', 'config.toml'),
        geminiConfig: join(root, '.gemini', 'settings.json'),
      },
      {
        anthropic: join(root, '.mcp.json'),
        openai: join(root, '.codex', 'config.toml'),
        google: join(root, '.gemini', 'settings.json'),
      },
      { officeClawRepoRoot: root },
    );
    app.log.info('[api] capabilities bootstrapped and CLI configs regenerated at startup');
  } catch (err) {
    app.log.warn(`[api] capability bootstrap / CLI config regeneration failed (best-effort): ${String(err)}`);
  }

  // F139 Phase 4b: late-bind invokeTrigger so scheduler templates can wake cats
  // (TaskRunnerV2 is constructed before invokeTrigger exists; bind here after both are ready)
  // Phase 3b: connector invoke trigger (auto-invoke agent after review email routing)
  const frontendBaseUrl = resolveFrontendBaseUrl(process.env, app.log);
  const invokeTrigger = new ConnectorInvokeTrigger({
    router,
    socketManager,
    invocationRecordStore,
    invocationTracker,
    invocationQueue,
    queueProcessor,
    threadMetaLookup: async (threadId) => {
      const thread = await threadStore.get(threadId);
      if (!thread) return undefined;
      return {
        threadShortId: threadId.slice(0, 15),
        threadTitle: thread.title ?? undefined,
        deepLinkUrl: `${frontendBaseUrl}/threads/${threadId}`,
      };
    },
    log: app.log,
  });

  // F139 Phase 4b: late-bind invokeTrigger so scheduler templates can wake cats
  if (taskRunnerV2Ref) {
    taskRunnerV2Ref.setInvokeTrigger(invokeTrigger);
    app.log.info('[api] F139: invokeTrigger bound to TaskRunnerV2');
  }

  // Start email watcher AFTER listen (non-blocking, best-effort)
  await startGithubReviewWatcher({
    log: app.log,
    reviewRouter,
    invokeTrigger,
  });

  // F133: Start CI/CD check poller (best-effort, after listen)
  const cicdRouter = new CiCdRouter({
    prTrackingStore,
    deliveryDeps: { messageStore, socketManager },
    log: app.log,
  });
  startGithubCiPoller({
    prTrackingStore,
    cicdRouter,
    invokeTrigger,
    log: app.log,
  });

  // F088: Start connector gateway (best-effort, after listen)
  let connectorGatewayHandle: Awaited<ReturnType<typeof startConnectorGateway>> | null = null;
  try {
    const gatewayConfig = loadConnectorGatewayConfig();
    connectorGatewayHandle = await startConnectorGateway(gatewayConfig, {
      bindingStore: connectorBindingStore,
      messageStore: {
        async append(input) {
          const result = await messageStore.append(input);
          return { id: result.id };
        },
        async getById(id: string) {
          const msg = messageStore.getById?.(id);
          if (!msg) return null;
          const resolved = msg instanceof Promise ? await msg : msg;
          return resolved ? { source: resolved.source } : null;
        },
      },
      threadStore,
      invokeTrigger,
      socketManager,
      defaultUserId: 'default-user',
      defaultAgentId: getDefaultAgentId(),
      redis: redisClient ?? undefined,
      log: app.log,
      frontendBaseUrl,
      hostRoot: resolveOfficeClawHostRoot(process.cwd()),
      webhookHandlers: connectorWebhookHandlers,
    });
    if (connectorGatewayHandle) {
      invokeTrigger.setOutboundHook(connectorGatewayHandle.outboundHook);
      invokeTrigger.setStreamingHook(connectorGatewayHandle.streamingHook);
      queueProcessor.setOutboundHook(
        connectorGatewayHandle.outboundHook as Parameters<typeof queueProcessor.setOutboundHook>[0],
      );
      queueProcessor.setStreamingHook(
        connectorGatewayHandle.streamingHook as Parameters<typeof queueProcessor.setStreamingHook>[0],
      );
      // Wire outbound delivery for proactive agent messages (post_message callback)
      (callbackOpts as { outboundHook?: typeof connectorGatewayHandle.outboundHook }).outboundHook =
        connectorGatewayHandle.outboundHook;
      // F088 ISSUE-15: Wire outbound delivery for web immediate path (messages route)
      (messagesOpts as { outboundHook?: typeof connectorGatewayHandle.outboundHook }).outboundHook =
        connectorGatewayHandle.outboundHook;
      (messagesOpts as { streamingHook?: typeof connectorGatewayHandle.streamingHook }).streamingHook =
        connectorGatewayHandle.streamingHook;
      queueProcessor.setThreadMetaLookup(async (threadId) => {
        const thread = await threadStore.get(threadId);
        if (!thread) return undefined;
        return {
          threadShortId: threadId.slice(0, 15),
          threadTitle: thread.title ?? undefined,
          deepLinkUrl: `${frontendBaseUrl}/threads/${threadId}`,
        };
      });
      // F137: Wire WeChat adapter to hub routes for QR login
      if (connectorHubOpts) {
        (connectorHubOpts as { weixinAdapter?: unknown }).weixinAdapter = connectorGatewayHandle.weixinAdapter;
        (connectorHubOpts as { startWeixinPolling?: () => void }).startWeixinPolling =
          connectorGatewayHandle.startWeixinPolling;
        (connectorHubOpts as { activateWeixinBotToken?: (token: string) => Promise<void> }).activateWeixinBotToken =
          connectorGatewayHandle.activateWeixinBotToken;
        (connectorHubOpts as { disconnectWeixinBotToken?: () => Promise<void> }).disconnectWeixinBotToken =
          connectorGatewayHandle.disconnectWeixinBotToken;
        (connectorHubOpts as { connectorRuntimeManager?: unknown }).connectorRuntimeManager = connectorGatewayHandle;
        (configRouteOpts as { connectorRuntimeManager?: unknown }).connectorRuntimeManager = connectorGatewayHandle;
        // F134 Phase D: Wire permission store to hub routes
        (connectorHubOpts as { permissionStore?: unknown }).permissionStore = connectorGatewayHandle.permissionStore;
      }
      app.log.info('[api] Connector gateway started');
    }
  } catch (err) {
    app.log.warn(`[api] Connector gateway startup failed (best-effort): ${String(err)}`);
  }

  // Graceful shutdown handler: persist Redis before exit
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      app.log.info(`[api] Received ${signal} while shutdown already in progress`);
      return;
    }
    shuttingDown = true;

    let exitCode = 0;
    try {
      app.log.info(`[api] Received ${signal}, shutting down gracefully...`);

      // Log shutdown to audit log FIRST (before any cleanup that might fail)
      try {
        await auditLog.append({
          type: AuditEventTypes.SERVER_SHUTDOWN,
          data: { signal, graceful: true },
        });
      } catch {
        // Audit log write failed, but continue with shutdown
      }

      // Trigger Redis BGSAVE to persist in-memory data before exit
      if (redisClient) {
        try {
          app.log.info('[api] Triggering Redis BGSAVE before shutdown...');
          await redisClient.bgsave();
          // Give Redis a moment to start the background save
          await new Promise((r) => setTimeout(r, 500));
          app.log.info('[api] Redis BGSAVE triggered');
        } catch (err) {
          app.log.error(`[api] Redis BGSAVE failed: ${String(err)}`);
        }
      }

      // Shut down storage provider (flush/close external connections)
      try {
        await storageProvider.shutdown?.();
      } catch (err) {
        app.log.error(`[api] Storage provider shutdown failed: ${String(err)}`);
      }

      // Stop GitHub review watcher
      try {
        await stopGithubReviewWatcher();
      } catch (err) {
        app.log.error(`[api] GithubReviewWatcher stop failed: ${String(err)}`);
      }

      stopGithubCiPoller();

      // Stop connector gateway
      try {
        await connectorGatewayHandle?.stop();
      } catch (err) {
        app.log.error(`[api] ConnectorGateway stop failed: ${String(err)}`);
      }

      try {
        skillOptionsWatcher.stop();
      } catch (err) {
        app.log.error(`[api] skill watcher stop failed: ${String(err)}`);
      }

      // Close WebSocket connections
      try {
        socketManager?.close();
      } catch (err) {
        exitCode = 1;
        app.log.error(`[api] SocketManager close failed: ${String(err)}`);
      }

      // Close Fastify server
      await app.close();

      try {
        await apiInstanceLease?.release();
      } catch (err) {
        exitCode = 1;
        app.log.error(`[api] API namespace lease release failed: ${String(err)}`);
      }

      app.log.info('[api] Shutdown complete');
    } catch (err) {
      exitCode = 1;
      app.log.error(`[api] Shutdown failed: ${String(err)}`);
    } finally {
      if (forcedLeaseLossExitTimer) {
        clearTimeout(forcedLeaseLossExitTimer);
        forcedLeaseLossExitTimer = null;
      }
      if (!process.env.__CLOWDER_PROGRAMMATIC) {
        process.exit(exitCode);
      } else {
        process.exitCode = exitCode;
      }
    }
  };
  shutdownForLeaseLoss = shutdown;
  _programmaticShutdownRef = shutdown;

  const onSigterm = () => {
    void shutdown('SIGTERM');
  };
  const onSigint = () => {
    void shutdown('SIGINT');
  };
  _signalCleanups = () => {
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  };
  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);
}

let _programmaticShutdownRef: ((reason: string) => Promise<void>) | null = null;
let _signalCleanups: (() => void) | null = null;

export async function _stopForProgrammatic(): Promise<void> {
  if (_programmaticShutdownRef) {
    await _programmaticShutdownRef('PROGRAMMATIC');
    _programmaticShutdownRef = null;
  }
  if (_signalCleanups) {
    _signalCleanups();
    _signalCleanups = null;
  }
}

/**
 * Create API module (for programmatic use by downstream projects).
 * Allows module injection without copying index.ts.
 */
export async function createApiModule(options: ApiStartOptions = {}): Promise<void> {
  return await main(options);
}

// Re-export module creation functions for downstream use
export { createAuthModule, type CreateAuthModuleOptions } from './auth/module.js';
export { createCatalogModule, type CreateCatalogModuleOptions } from './catalog/module.js';
export { createStorageModule, type CreateStorageModuleOptions } from './storage/module.js';

// Re-export auth session store for downstream use
export { authSessionStore } from './auth/session-store.js';

// Re-export plugin registry functions for downstream use
export { initPluginRegistry, getPluginRegistry } from './config/plugins/plugin-registry-singleton.js';
