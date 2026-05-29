/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * @openjiuwen/relay-core — The headless runtime for OfficeClaw
 *
 * Provides:
 * - Plugin interface (OfficeClawProviderPlugin) for building provider packages
 * - Plugin discovery and registration (ProviderPluginRegistry)
 * - Agent service types (AgentService, AgentMessage, AgentServiceOptions)
 * - Runtime profile types (RuntimeProviderProfile, RuntimeAcpModelProfile)
 */

// ── Agent types ──
export type {
  ACPModelAccessMode,
  AcpModelProviderType,
  AgentMessage,
  AgentMessageType,
  AgentService,
  AgentServiceOptions,
  AuditContext,
  BuiltinAccountClient,
  ChildProcessLike,
  CliSpawnOptions,
  MessageMetadata,
  ProviderProfileAuthType,
  ProviderProfileKind,
  ProviderProfileProtocol,
  RuntimeAcpModelProfile,
  RuntimeProviderProfile,
  TokenUsage,
} from './agent/index.js';
export { mergeTokenUsage } from './agent/index.js';
// ── Plugin system ──
export type {
  AgentServiceFactoryContext,
  CredentialResolutionContext,
  OfficeClawProviderPlugin,
  DiscoveryResult,
  McpConfigReader,
  McpConfigWriter,
  ProviderAccountSpec,
  ProviderBindingSpec,
} from './plugin/index.js';
export { ProviderPluginRegistry } from './plugin/index.js';
