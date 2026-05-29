/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * DARE Event Transformer
 * DARE headless envelope → OfficeClaw AgentMessage 映射
 *
 * DARE headless envelope (client-headless-event-envelope.v1):
 *   { schema_version, ts, session_id, run_id, seq, event, data }
 *
 * Event mapping:
 *   session.started  → session_init
 *   tool.invoke      → tool_use
 *   tool.result      → tool_result
 *   tool.error       → tool_result (with error content)
 *   task.completed   → text (rendered_output is the agent's final answer)
 *   task.failed      → error
 *   approval.pending → null (skip transient full-auto approval noise)
 *   Others (log.*, transport.*, model.response, plan.*) → null (skip)
 */


import type { AgentId } from '@openjiuwen/relay-shared';
import type { AgentMessage } from '../../types.js';

const DARE_SCHEMA = 'client-headless-event-envelope.v1';

interface DareEnvelope {
  schema_version: string;
  ts: number;
  session_id: string;
  run_id: string;
  seq: number;
  event: string;
  data: Record<string, unknown>;
}

function isDareEnvelope(event: unknown): event is DareEnvelope {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Record<string, unknown>;
  return e.schema_version === DARE_SCHEMA && typeof e.event === 'string';
}

function str(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val : fallback;
}

function extractTransportThinking(data: Record<string, unknown>): string | null {
  const payload =
    typeof data.payload === 'object' && data.payload !== null ? (data.payload as Record<string, unknown>) : data;
  if (payload.message_kind !== 'thinking') return null;

  const text = str(payload.text).trim();
  return text || null;
}

export function transformDareEvent(event: unknown, agentId: AgentId | string): AgentMessage | null {
  if (!isDareEnvelope(event)) return null;

  const ts = typeof event.ts === 'number' ? Math.round(event.ts * 1000) : Date.now();
  const data = event.data ?? {};

  switch (event.event) {
    case 'session.started':
      return {
        type: 'session_init',
        agentId: agentId as AgentId,
        sessionId: event.session_id,
        timestamp: ts,
      };

    case 'tool.invoke': {
      const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : undefined;
      const msg: AgentMessage = {
        type: 'tool_use',
        agentId: agentId as AgentId,
        toolName: str(data.tool_name, 'unknown'),
        toolCallId,
        timestamp: ts,
      };
      // Forward DARE's tool.invoke arguments to toolInput.
      // Note: tool_call_id is extracted to the top-level toolCallId field above,
      // not embedded in toolInput (matching relayclaw-event-transform behavior).
      const input: Record<string, unknown> = {};
      if (typeof data.capability_id === 'string') input.capability_id = data.capability_id;
      if (data.arguments != null && typeof data.arguments === 'object') {
        Object.assign(input, data.arguments as Record<string, unknown>);
      }
      if (Object.keys(input).length > 0) msg.toolInput = input;
      return msg;
    }

    case 'tool.result': {
      const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : undefined;
      const resultContent =
        typeof data.output === 'string' && data.output.length > 0 ? data.output : `${str(data.tool_name)} completed`;
      return {
        type: 'tool_result',
        agentId: agentId as AgentId,
        toolName: str(data.tool_name),
        toolCallId,
        content: resultContent,
        timestamp: ts,
      };
    }

    case 'tool.error': {
      const toolCallId = typeof data.tool_call_id === 'string' ? data.tool_call_id : undefined;
      return {
        type: 'tool_result',
        agentId: agentId as AgentId,
        toolName: str(data.tool_name),
        toolCallId,
        content: `Error: ${str(data.error, 'tool execution failed')}`,
        timestamp: ts,
      };
    }

    case 'task.completed':
      return {
        type: 'text',
        agentId: agentId as AgentId,
        content: str(data.rendered_output),
        timestamp: ts,
      };

    case 'task.failed': {
      let errorMsg: string;
      if (typeof data.error === 'string') {
        errorMsg = data.error;
      } else if (Array.isArray(data.errors)) {
        errorMsg = (data.errors as unknown[]).map(String).join('; ');
      } else {
        errorMsg = 'DARE task failed';
      }
      return {
        type: 'error',
        agentId: agentId as AgentId,
        error: errorMsg,
        timestamp: ts,
      };
    }

    case 'approval.pending':
      return null;

    case 'transport.raw': {
      const thinkingText = extractTransportThinking(data);
      if (!thinkingText) return null;
      return {
        type: 'system_info',
        agentId: agentId as AgentId,
        content: JSON.stringify({ type: 'thinking', agentId, text: thinkingText }),
        timestamp: ts,
      };
    }

    default:
      return null;
  }
}
