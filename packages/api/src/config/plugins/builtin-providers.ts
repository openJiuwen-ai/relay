/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { join } from 'node:path';
import {
  ProviderPluginRegistry,
  type AgentService,
  type AgentServiceFactoryContext,
  type OfficeClawProviderPlugin,
  type McpConfigWriter,
} from '@openjiuwen/relay-core';
import {
  resolveAnthropicCredentialEnv,
  resolveDareCredentialEnv,
  resolveGoogleCredentialEnv,
  resolveOpenAiCredentialEnv,
  resolveOpenCodeCredentialEnv,
  resolveRelayClawCredentialEnv,
} from './builtin-credential-resolvers.js';
import { A2AAgentService } from '../../domains/agents/services/agents/providers/A2AAgentService.js';
import { AntigravityAgentService } from '../../domains/agents/services/agents/providers/antigravity/AntigravityAgentService.js';
import { ClaudeAgentService } from '../../domains/agents/services/agents/providers/ClaudeAgentService.js';
import { CodexAgentService } from '../../domains/agents/services/agents/providers/CodexAgentService.js';
import { DareAgentService } from '../../domains/agents/services/agents/providers/DareAgentService.js';
import { GeminiAgentService } from '../../domains/agents/services/agents/providers/GeminiAgentService.js';
import { OpenCodeAgentService } from '../../domains/agents/services/agents/providers/OpenCodeAgentService.js';
import {
  resolveJiuwenClawAppDir,
  resolveJiuwenClawExecutable,
  resolveJiuwenClawPythonBin,
} from '../../utils/jiuwenclaw-paths.js';
import {
  writeClaudeMcpConfig,
  writeCodexMcpConfig,
  writeGeminiMcpConfig,
} from '../capabilities/mcp-config-adapters.js';

export const anthropicPlugin: OfficeClawProviderPlugin = {
  name: 'anthropic',
  providers: ['anthropic'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new ClaudeAgentService({ agentId: ctx.agentId });
  },
  accountSpecs: [
    {
      id: 'claude',
      displayName: 'Claude (OAuth)',
      client: 'anthropic',
      models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929'],
    },
  ],
  binding: { builtinClient: 'anthropic', expectedProtocol: 'anthropic' },
  mcpConfigWriter: writeClaudeMcpConfig as unknown as McpConfigWriter,
  resolveCredentialEnv: resolveAnthropicCredentialEnv,
};

export const openaiPlugin: OfficeClawProviderPlugin = {
  name: 'openai',
  providers: ['openai'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new CodexAgentService({ agentId: ctx.agentId });
  },
  accountSpecs: [
    {
      id: 'codex',
      displayName: 'Codex (OAuth)',
      client: 'openai',
      models: ['gpt-5.3-codex', 'gpt-5.4', 'gpt-5.3-codex-spark', 'codex'],
    },
  ],
  binding: { builtinClient: 'openai', expectedProtocol: 'openai' },
  mcpConfigWriter: writeCodexMcpConfig as unknown as McpConfigWriter,
  resolveCredentialEnv: resolveOpenAiCredentialEnv,
};

export const googlePlugin: OfficeClawProviderPlugin = {
  name: 'google',
  providers: ['google'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new GeminiAgentService({ agentId: ctx.agentId });
  },
  accountSpecs: [
    {
      id: 'gemini',
      displayName: 'Gemini (OAuth)',
      client: 'google',
      models: ['gemini-3.1-pro-preview', 'gemini-2.5-pro'],
    },
  ],
  binding: { builtinClient: 'google', expectedProtocol: 'google' },
  mcpConfigWriter: writeGeminiMcpConfig as unknown as McpConfigWriter,
  validateBinding(_provider, profile) {
    if (profile.kind !== 'builtin') {
      return 'client "google" only supports builtin Gemini auth';
    }
    return null;
  },
  resolveCredentialEnv: resolveGoogleCredentialEnv,
};

export const darePlugin: OfficeClawProviderPlugin = {
  name: 'dare',
  providers: ['dare'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new DareAgentService({ agentId: ctx.agentId });
  },
  accountSpecs: [
    {
      id: 'dare',
      displayName: 'Dare (client-auth)',
      client: 'dare',
      models: ['z-ai/glm-5'],
    },
  ],
  binding: { builtinClient: 'dare', expectedProtocol: 'openai' },
  resolveCredentialEnv: resolveDareCredentialEnv,
};

export const opencodePlugin: OfficeClawProviderPlugin = {
  name: 'opencode',
  providers: ['opencode'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new OpenCodeAgentService({ agentId: ctx.agentId });
  },
  accountSpecs: [
    {
      id: 'opencode',
      displayName: 'OpenCode (client-auth)',
      client: 'opencode',
      models: ['anthropic/claude-opus-4-6', 'anthropic/claude-sonnet-4-5'],
    },
  ],
  binding: { builtinClient: 'opencode', expectedProtocol: 'anthropic' },
  resolveCredentialEnv: resolveOpenCodeCredentialEnv,
};

export const antigravityPlugin: OfficeClawProviderPlugin = {
  name: 'antigravity',
  providers: ['antigravity'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new AntigravityAgentService({
      agentId: ctx.agentId,
      commandArgs: ctx.agentConfig.commandArgs,
    });
  },
};

export const relayclawPlugin: OfficeClawProviderPlugin = {
  name: 'relayclaw',
  providers: ['relayclaw'],
  async createAgentService(ctx: AgentServiceFactoryContext): Promise<AgentService> {
    const { RelayClawAgentService } = await import(
      '../../domains/agents/services/agents/providers/RelayClawAgentService.js'
    );
    const wsEnvKey = `CAT_${ctx.agentId.toUpperCase()}_WS_URL`;
    const wsUrl = (ctx.env[wsEnvKey] ?? '').trim();
    const appDir = resolveJiuwenClawAppDir();
    const executablePath = resolveJiuwenClawExecutable();
    const pythonBin = resolveJiuwenClawPythonBin(undefined, appDir);
    return new RelayClawAgentService({
      agentId: ctx.agentId,
      config: {
        ...(wsUrl ? { url: wsUrl, autoStart: false } : { autoStart: true }),
        executablePath,
        appDir,
        pythonBin,
        homeDir: join(ctx.projectRoot, '.office-claw', 'relayclaw', ctx.agentId),
        modelName: ctx.agentConfig.defaultModel,
        skills: ctx.agentConfig.skills,
      },
    });
  },
  binding: { builtinClient: 'openai', expectedProtocol: 'openai' },
  validateBinding(_provider, profile) {
    if (profile.authType !== 'api_key') {
      return 'client "relayclaw" ("jiuwen") requires an API key provider profile';
    }
    if (profile.protocol && profile.protocol !== 'openai') {
      return 'client "relayclaw" ("jiuwen") currently only supports openai-compatible API key profiles';
    }
    return null;
  },
  resolveCredentialEnv: resolveRelayClawCredentialEnv,
};

export const acpPlugin: OfficeClawProviderPlugin = {
  name: 'acp',
  providers: ['acp'],
  async createAgentService(ctx: AgentServiceFactoryContext): Promise<AgentService> {
    const { ACPAgentService } = await import('../../domains/agents/services/agents/providers/ACPAgentService.js');
    return new ACPAgentService({ agentId: ctx.agentId });
  },
  validateBinding(_provider, profile, _model, options) {
    if (options?.embeddedAcpRuntime) {
      if (profile.authType !== 'api_key' || profile.protocol !== 'openai') {
        return 'client "acp" built-in Agent Teams runtime requires an OpenAI-compatible API key provider profile';
      }
      if (profile.kind === 'builtin') {
        return 'client "acp" built-in Agent Teams runtime does not support builtin OAuth accounts';
      }
      return null;
    }
    if (profile.kind !== 'acp' || profile.authType !== 'none' || profile.protocol !== 'acp') {
      return 'client "acp" requires an ACP provider profile';
    }
    return null;
  },
};

export const a2aPlugin: OfficeClawProviderPlugin = {
  name: 'a2a',
  providers: ['a2a'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    const envKey = `CAT_${ctx.agentId.toUpperCase()}_A2A_URL`;
    const a2aUrl = (ctx.env[envKey] ?? '').trim();
    if (!a2aUrl) {
      throw new Error(`A2A agent "${ctx.agentId}" missing ${envKey} env var`);
    }
    return new A2AAgentService({ agentId: ctx.agentId, config: { url: a2aUrl } });
  },
};

export const BUILTIN_PLUGINS: readonly OfficeClawProviderPlugin[] = [
  anthropicPlugin,
  openaiPlugin,
  googlePlugin,
  darePlugin,
  opencodePlugin,
  antigravityPlugin,
  relayclawPlugin,
  acpPlugin,
  a2aPlugin,
];

export interface CreateProviderPluginRegistryOptions {
  extraPlugins?: readonly OfficeClawProviderPlugin[];
  searchPaths?: string[];
}

export async function createProviderPluginRegistry(
  options: CreateProviderPluginRegistryOptions = {},
): Promise<ProviderPluginRegistry> {
  const registry = new ProviderPluginRegistry();

  for (const plugin of BUILTIN_PLUGINS) {
    registry.register(plugin);
  }

  for (const plugin of options.extraPlugins ?? []) {
    registry.register(plugin);
  }

  await registry.discoverFromNodeModules(options.searchPaths);

  return registry;
}
