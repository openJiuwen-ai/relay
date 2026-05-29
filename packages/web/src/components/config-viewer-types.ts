/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export interface CoCreatorConfig {
  name: string;
  aliases: string[];
  mentionPatterns: string[];
  avatar?: string;
  color?: {
    primary: string;
    secondary: string;
  };
}

export interface AgentDeskConfig {
  displayName: string;
  provider: string;
  model: string;
  mcpSupport: boolean;
  accountRef?: string;
  providerProfileId?: string;
  embeddedAcpExecutablePath?: string;
  embeddedAcpConfig?: {
    executablePath?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    provider?: 'openai_compatible' | 'bigmodel' | 'minimax' | 'echo';
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    sslVerify?: boolean | null;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    contextWindow?: number;
    connectTimeoutSeconds?: number;
  };
}

export interface ContextBudget {
  maxPromptTokens: number;
  maxContextTokens: number;
  maxMessages: number;
  maxContentLengthPerMsg: number;
}

export interface Capabilities {
  skills: string[];
  externalMcpServers: string[];
}

export interface ConfigData {
  coCreator?: CoCreatorConfig;
  agents: Record<string, AgentDeskConfig>;
  perAgentBudgets: Record<string, ContextBudget>;
  cli?: {
    codexSandboxMode: 'read-only' | 'workspace-write' | 'danger-full-access';
    codexApprovalPolicy: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  };
  a2a: { enabled: boolean; maxDepth: number };
  memory: { enabled: boolean; maxKeysPerThread: number };
  codexExecution?: {
    model: string;
    authMode: 'oauth' | 'api_key' | 'auto';
    passModelArg: boolean;
  };
  governance: { degradationEnabled: boolean; doneTimeoutMs: number; heartbeatIntervalMs: number };
}
