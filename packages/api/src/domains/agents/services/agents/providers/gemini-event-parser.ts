/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Gemini CLI NDJSON event parser — 从 GeminiAgentService 拆出的纯函数
 *
 * F23: 拆分以满足 350 行硬上限
 */

import type { AgentId } from '@openjiuwen/relay-shared';
import type { AgentMessage } from '../../types.js';

const KNOWN_POST_RESPONSE_CANDIDATES_CRASH = "Cannot read properties of undefined (reading 'candidates')";

/**
 * Transform a raw Gemini CLI NDJSON event into an AgentMessage.
 * Returns null to skip events we don't care about.
 */
export function transformGeminiEvent(event: unknown, agentId: AgentId): AgentMessage | null {
  if (typeof event !== 'object' || event === null) return null;
  const e = event as Record<string, unknown>;

  // init → session_init
  if (e.type === 'init') {
    const sessionId = e.session_id;
    if (typeof sessionId === 'string') {
      return {
        type: 'session_init',
        agentId,
        sessionId,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  // message with role:"assistant" → text
  if (e.type === 'message' && e.role === 'assistant') {
    const content = e.content;
    if (typeof content === 'string') {
      return {
        type: 'text',
        agentId,
        content,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  // tool_use → tool_use
  if (e.type === 'tool_use') {
    const toolName = e.tool_name;
    if (typeof toolName === 'string') {
      return {
        type: 'tool_use',
        agentId,
        toolName,
        toolInput: (e.parameters as Record<string, unknown>) ?? {},
        timestamp: Date.now(),
      };
    }
    return null;
  }

  // result with non-success status → error
  if (e.type === 'result' && e.status !== 'success') {
    const message = extractGeminiErrorMessage(e.error);
    if (!message) {
      // Let cli-exit error provide the detailed message.
      return null;
    }
    return {
      type: 'error',
      agentId,
      error: message,
      timestamp: Date.now(),
    };
  }

  // Everything else (message/user, tool_result, result/success) → skip
  return null;
}

export function isResultErrorEvent(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return e.type === 'result' && e.status !== 'success';
}

export function extractGeminiErrorMessage(rawError: unknown): string | null {
  if (typeof rawError === 'string') {
    const value = rawError.trim();
    return value.length > 0 ? value : null;
  }

  if (typeof rawError === 'object' && rawError !== null) {
    const message = (rawError as Record<string, unknown>).message;
    if (typeof message === 'string') {
      const value = message.trim();
      return value.length > 0 ? value : null;
    }
  }

  return null;
}

export function isKnownPostResponseCandidatesCrash(event: unknown): boolean {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  if (e.type !== 'result' || e.status === 'success') return false;

  const message = extractGeminiErrorMessage(e.error);
  return message?.includes(KNOWN_POST_RESPONSE_CANDIDATES_CRASH) ?? false;
}
