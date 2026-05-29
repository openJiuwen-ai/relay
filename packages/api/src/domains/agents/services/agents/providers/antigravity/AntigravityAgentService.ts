/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Antigravity Agent Service
 * CDP 桥接入口 — 通过 Chrome DevTools Protocol 与 Antigravity IDE 通信
 *
 * 与 GeminiAgentService 的 antigravity adapter 不同:
 *   GeminiAgentService.antigravity = spawn CLI + MCP 回传 (半自动)
 *   AntigravityAgentService       = CDP WebSocket 桥 (全自动, 无需 MCP callback)
 */

import { type AgentId, createAgentId } from '@openjiuwen/relay-shared';
import { getAgentModel } from '../../../../../../config/office-claw-models.js';
import type { AgentMessage, AgentService, AgentServiceOptions, MessageMetadata } from '../../../types.js';
import { AntigravityCdpClient, type PollResponseOptions, type PollResponseResult } from './AntigravityCdpClient.js';

/** Duck-typed CDP client interface for dependency injection */
interface CdpClientLike {
  connected: boolean;
  connect(runtimeTitleHint?: string): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(text: string): Promise<void>;
  pollResponse(idleTimeoutMs?: number, options?: PollResponseOptions): Promise<PollResponseResult | null>;
  newConversation(): Promise<void>;
  getCurrentModel?(): Promise<string | null>;
  switchModel?(targetModelLabel: string): Promise<void>;
}

/** Map agent-config model IDs to Antigravity UI dropdown labels. */
const MODEL_LABEL_MAP: Record<string, string> = {
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'gemini-3-flash': 'Gemini 3 Flash',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'gpt-oss-120b': 'GPT-OSS 120B',
};

function resolveModelLabel(modelId: string): string | undefined {
  return MODEL_LABEL_MAP[modelId];
}

export function resolveAntigravityCdpPort(commandArgs?: readonly string[]): number | undefined {
  if (!commandArgs || commandArgs.length === 0) return undefined;
  for (let index = 0; index < commandArgs.length; index += 1) {
    const token = commandArgs[index]?.trim();
    if (!token) continue;

    const inline = token.match(/^--remote-debugging-port=(\d{1,5})$/);
    if (inline) {
      const port = Number.parseInt(inline[1], 10);
      if (port >= 1 && port <= 65_535) return port;
      continue;
    }

    if (token !== '--remote-debugging-port') continue;
    const value = commandArgs[index + 1]?.trim();
    const port = Number.parseInt(value ?? '', 10);
    if (port >= 1 && port <= 65_535) return port;
  }
  return undefined;
}

export interface AntigravityAgentServiceOptions {
  agentId?: AgentId;
  model?: string;
  cdpPort?: number;
  commandArgs?: readonly string[];
  /** Substring to match in CDP target title (e.g. project name) */
  titleHint?: string;
  /** Inject mock CDP client for testing */
  cdpClient?: CdpClientLike;
}

export class AntigravityAgentService implements AgentService {
  readonly agentId: AgentId;
  private readonly model: string;
  private readonly cdpClient: CdpClientLike;

  constructor(options?: AntigravityAgentServiceOptions) {
    this.agentId = options?.agentId
      ? typeof options.agentId === 'string'
        ? createAgentId(options.agentId)
        : options.agentId
      : createAgentId('antigravity');
    this.model = options?.model ?? getAgentModel(this.agentId as string);
    const resolvedCdpPort = options?.cdpPort ?? resolveAntigravityCdpPort(options?.commandArgs);
    this.cdpClient =
      options?.cdpClient ??
      new AntigravityCdpClient({
        ...(resolvedCdpPort ? { port: resolvedCdpPort } : {}),
        ...(options?.titleHint ? { titleHint: options.titleHint } : {}),
      });
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const metadata: MessageMetadata = { provider: 'antigravity', model: this.model, modelVerified: false };

    try {
      if (!this.cdpClient.connected) {
        const titleHint = options?.workingDirectory
          ? options.workingDirectory.split('/').filter(Boolean).pop()
          : undefined;
        await this.cdpClient.connect(titleHint);
      }

      // Switch model if CDP client supports it (AC-9)
      if (this.cdpClient.switchModel) {
        const label = resolveModelLabel(this.model);
        if (label) {
          await this.cdpClient.switchModel(label);
          metadata.modelVerified = true;
        }
      }

      await this.cdpClient.newConversation();
      await this.cdpClient.sendMessage(prompt);

      const result = await this.cdpClient.pollResponse(60_000);

      if (result === null) {
        yield {
          type: 'error',
          agentId: this.agentId,
          error: 'Antigravity response timeout — 60s 内未收到回复',
          metadata,
          timestamp: Date.now(),
        };
      } else {
        if (result.thinking) {
          yield {
            type: 'system_info',
            agentId: this.agentId,
            content: JSON.stringify({ type: 'thinking', text: result.thinking }),
            metadata,
            timestamp: Date.now(),
          };
        }
        yield {
          type: 'text',
          agentId: this.agentId,
          content: result.text,
          metadata,
          timestamp: Date.now(),
        };
      }

      yield { type: 'done', agentId: this.agentId, metadata, timestamp: Date.now() };
    } catch (err) {
      yield {
        type: 'error',
        agentId: this.agentId,
        error: err instanceof Error ? err.message : String(err),
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', agentId: this.agentId, metadata, timestamp: Date.now() };
    } finally {
      try {
        await this.cdpClient.disconnect();
      } catch {
        /* best effort */
      }
    }
  }
}
