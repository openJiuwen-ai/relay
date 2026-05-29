/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Cat Agent Services
 * 导出所有 Agent 服务
 */

export { InvocationRegistry } from './agents/invocation/InvocationRegistry.js';
export { InvocationTracker } from './agents/invocation/InvocationTracker.js';
export type { InvocationDeps, InvocationParams } from './agents/invocation/invoke-single-agent.js';
export { invokeSingleCat } from './agents/invocation/invoke-single-agent.js';
export { buildMcpCallbackInstructions, needsMcpInjection } from './agents/invocation/McpPromptInjector.js';
export { ClaudeAgentService } from './agents/providers/ClaudeAgentService.js';
export { CodexAgentService } from './agents/providers/CodexAgentService.js';
export { DareAgentService } from './agents/providers/DareAgentService.js';
export { GeminiAgentService } from './agents/providers/GeminiAgentService.js';
export { OpenCodeAgentService } from './agents/providers/OpenCodeAgentService.js';
export { AgentRegistry } from './agents/registry/AgentRegistry.js';
export type { AgentRouterOptions } from './agents/routing/AgentRouter.js';
export { AgentRouter } from './agents/routing/AgentRouter.js';
export type { PersistenceContext, RouteOptions, RouteStrategyDeps } from './agents/routing/route-helpers.js';
export { routeParallel } from './agents/routing/route-parallel.js';
export { routeSerial } from './agents/routing/route-serial.js';
export type { AssembledContext, ContextAssemblerOptions } from './context/ContextAssembler.js';
export { assembleContext, formatMessage } from './context/ContextAssembler.js';
export type { Intent, IntentResult } from './context/IntentParser.js';
export { parseIntent, stripIntentTags } from './context/IntentParser.js';
export type { InvocationContext } from './context/SystemPromptBuilder.js';
export { buildInvocationContext, buildStaticIdentity, buildSystemPrompt } from './context/SystemPromptBuilder.js';
export type { AuditEvent, AuditEventInput } from './orchestration/EventAuditLog.js';
export { AuditEventTypes, EventAuditLog, getEventAuditLog } from './orchestration/EventAuditLog.js';
export { createAuthorizationAuditStore } from './stores/factories/AuthorizationAuditStoreFactory.js';
export { createAuthorizationRuleStore } from './stores/factories/AuthorizationRuleStoreFactory.js';
export { createDraftStore } from './stores/factories/DraftStoreFactory.js';
export type { AnyInvocationRecordStore } from './stores/factories/InvocationRecordStoreFactory.js';
export { createInvocationRecordStore } from './stores/factories/InvocationRecordStoreFactory.js';
export type { AnyMessageStore } from './stores/factories/MessageStoreFactory.js';
export { createMessageStore } from './stores/factories/MessageStoreFactory.js';
export { createPendingRequestStore } from './stores/factories/PendingRequestStoreFactory.js';
export type { AnySessionChainStore } from './stores/factories/SessionChainStoreFactory.js';
export { createSessionChainStore } from './stores/factories/SessionChainStoreFactory.js';
export { createTaskStore } from './stores/factories/TaskStoreFactory.js';
export { createThreadStore } from './stores/factories/ThreadStoreFactory.js';
export { DeliveryCursorStore } from './stores/ports/DeliveryCursorStore.js';
export type { DraftRecord, IDraftStore } from './stores/ports/DraftStore.js';
export { DraftStore } from './stores/ports/DraftStore.js';
export type {
  CreateInvocationInput,
  CreateResult,
  IInvocationRecordStore,
  InvocationRecord,
  InvocationStatus,
  UpdateInvocationInput,
} from './stores/ports/InvocationRecordStore.js';
export { InvocationRecordStore } from './stores/ports/InvocationRecordStore.js';
export {
  ALL_STATUSES,
  getAllowedTransitions,
  isValidTransition,
  TERMINAL_STATES,
} from './stores/ports/invocation-state-machine.js';
export type {
  GovernanceEntry,
  GovernanceStatus,
  IMemoryGovernanceStore,
  PublishAction,
} from './stores/ports/MemoryGovernanceStore.js';
export {
  GovernanceConflictError,
  MemoryGovernanceStore,
  resolveTransition,
} from './stores/ports/MemoryGovernanceStore.js';
export type { AppendMessageInput, IMessageStore, StoredMessage } from './stores/ports/MessageStore.js';
export { MessageStore } from './stores/ports/MessageStore.js';
export type { CreateSessionInput, ISessionChainStore, SessionRecordPatch } from './stores/ports/SessionChainStore.js';
export { SessionChainStore } from './stores/ports/SessionChainStore.js';
export type { ITaskStore } from './stores/ports/TaskStore.js';
export { TaskStore } from './stores/ports/TaskStore.js';
export type { IThreadStore, Thread } from './stores/ports/ThreadStore.js';
export { DEFAULT_THREAD_ID, ThreadStore } from './stores/ports/ThreadStore.js';
export { RedisAuthorizationAuditStore } from './stores/redis/RedisAuthorizationAuditStore.js';
export { RedisAuthorizationRuleStore } from './stores/redis/RedisAuthorizationRuleStore.js';
export { RedisDraftStore } from './stores/redis/RedisDraftStore.js';
export { RedisInvocationRecordStore } from './stores/redis/RedisInvocationRecordStore.js';
export { RedisMessageStore } from './stores/redis/RedisMessageStore.js';
export { RedisPendingRequestStore } from './stores/redis/RedisPendingRequestStore.js';
export { RedisSessionChainStore } from './stores/redis/RedisSessionChainStore.js';
export { RedisTaskStore } from './stores/redis/RedisTaskStore.js';
export { RedisThreadStore } from './stores/redis/RedisThreadStore.js';

export * from './types.js';
