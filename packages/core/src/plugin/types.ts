/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * OfficeClaw Provider Plugin Contract
 * Every @office-claw/provider-* package must export a default conforming to this interface.
 */

import type { AgentConfig, AgentId } from '@openjiuwen/relay-shared';
import type {
  AgentService,
  BuiltinAccountClient,
  ProviderProfileAuthType,
  ProviderProfileKind,
  ProviderProfileProtocol,
  RuntimeProviderProfile,
} from '../agent/types.js';

/**
 * Context passed to the factory function when creating an AgentService.
 */
export interface AgentServiceFactoryContext {
  /** The agentId this service will serve */
  agentId: AgentId;
  /** Full AgentConfig for this agent */
  agentConfig: AgentConfig;
  /** Environment variables (avoids direct process.env coupling) */
  env: Record<string, string | undefined>;
  /** Resolved project root path */
  projectRoot: string;
}

/**
 * Metadata about a built-in account that this provider ships with.
 */
export interface ProviderAccountSpec {
  /** Account identifier (e.g. 'claude', 'codex', 'gemini') */
  id: string;
  /** Human-readable name */
  displayName: string;
  /** The builtin client key */
  client: BuiltinAccountClient;
  /** Known model IDs available on this account */
  models: readonly string[];
}

/**
 * Maps a provider string to its credential routing metadata.
 */
export interface ProviderBindingSpec {
  /** Builtin client key (e.g. 'anthropic', 'openai') or null */
  builtinClient: BuiltinAccountClient | null;
  /** Expected protocol for provider profile validation */
  expectedProtocol: ProviderProfileProtocol | null;
}

/**
 * MCP config writer — generates CLI-specific MCP config files.
 * The servers parameter is typed loosely to avoid coupling to the full McpServerDescriptor type.
 */
export type McpConfigWriter = (filePath: string, servers: Array<Record<string, unknown>>) => Promise<void>;

/**
 * MCP config reader — reads existing CLI MCP config.
 */
export type McpConfigReader = (filePath: string) => Promise<Array<Record<string, unknown>>>;

/**
 * Context passed to resolveCredentialEnv — everything a plugin needs to build
 * provider-specific env vars for a single invocation.
 */
export interface CredentialResolutionContext {
  agentId: AgentId;
  provider: string;
  defaultModel?: string;
  resolvedAccount: RuntimeProviderProfile | null;
  effectiveProtocol: string | null;
  configProjectRoot: string;
  userId: string;
  agentConfig: AgentConfig;
  boundAccountRef?: string | null;
  modelConfigBinding?: {
    id: string;
    protocol?: ProviderProfileProtocol;
    apiKey?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    models: string[];
  } | null;
}

/**
 * The contract that every @office-claw/provider-* package must implement.
 * Exported as the default export of the package.
 */
export interface OfficeClawProviderPlugin {
  /** Human-readable plugin name for diagnostics */
  name: string;

  /**
   * Provider string(s) this plugin handles.
   * Must match the `provider` field in AgentVariant configs.
   */
  providers: readonly string[];

  /**
   * Create an AgentService instance for an agent.
   * Called once per agent at startup and on catalog mutations.
   */
  createAgentService(context: AgentServiceFactoryContext): AgentService | Promise<AgentService>;

  /**
   * Optional: validate that a runtime provider binding is compatible.
   * Returns null if valid, or an error message string.
   */
  validateBinding?: (
    provider: string,
    profile: {
      id: string;
      authType: ProviderProfileAuthType;
      kind: ProviderProfileKind;
      protocol?: ProviderProfileProtocol;
      client?: BuiltinAccountClient;
      models?: string[];
    },
    defaultModel?: string | null,
    options?: { embeddedAcpRuntime?: boolean },
  ) => string | null;

  /** Optional: built-in account specs this provider registers. */
  accountSpecs?: readonly ProviderAccountSpec[];

  /** Optional: provider-to-client binding metadata. */
  binding?: ProviderBindingSpec;

  /** Optional: MCP config writer for this provider's CLI. */
  mcpConfigWriter?: McpConfigWriter;

  /** Optional: MCP config reader for this provider's CLI. */
  mcpConfigReader?: McpConfigReader;

  /** Optional: resolve the MCP config file path for a given project root. */
  mcpConfigPath?: (projectRoot: string) => string;

  /**
   * Optional: resolve provider-specific credential env vars for a single invocation.
   * Called by invoke-single-agent before passing callbackEnv to the AgentService.
   */
  resolveCredentialEnv?(context: CredentialResolutionContext): Record<string, string> | Promise<Record<string, string>>;
}
