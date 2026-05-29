/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * RelayClaw Event Transformer
 *
 * relay-claw AgentResponseChunk → OfficeClaw AgentMessage mapping.
 *
 * Mapping (event_type → AgentMessageType):
 *   task.start              → system_info (task_boundary + taskContext / taskPhase)
 *   task.update             → system_info (task_progress 全量快照)
 *   task.complete           → system_info (task_boundary complete)
 *   chat.delta              → text   (streaming text fragment)
 *   chat.reasoning          → system_info (thinking/reasoning content)
 *   chat.final              → (skip; completion marker only)
 *   chat.tool_calls.delta   → (skip; partial tool-call fragment)
 *   chat.tool_call          → tool_use
 *   chat.tool_result        → tool_result
 *   chat.tool_update        → (skip; tool execution update)
 *   chat.error              → error
 *   chat.processing_status  → system_info
 *   chat.ask_user_question  → system_info
 *   chat.usage_metadata     → (skip; usage statistics)
 *   chat.evolution_status   → (skip; skill evolution status)
 *   chat.done               → (skip; completion marker)
 *   context.compressed      → (skip)
 *   todo.updated            → (skip)
 */

import type { AgentId, RelayClawChunkPayload, RelayClawWsFrame } from '@openjiuwen/relay-shared';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import type { AgentMessage } from '../../types.js';

const log = createModuleLogger('relayclaw-event-transform');

const RELAYCLAW_TRANSPORT_ERROR_TEXT_PATTERNS = [
  /^\s*\[(?:错误|error)\]\s*jiuwen WebSocket connection closed unexpectedly\s*$/i,
  /^\s*jiuwen WebSocket connection closed unexpectedly\s*$/i,
] as const;

function msg(type: AgentMessage['type'], agentId: AgentId, content?: string): AgentMessage {
  return { type, agentId, content, timestamp: Date.now() };
}

export function isRelayClawTransportErrorText(content: unknown): content is string {
  if (typeof content !== 'string') return false;
  const normalized = content.trim();
  if (!normalized) return false;
  return RELAYCLAW_TRANSPORT_ERROR_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Transform a single relay-claw WS chunk into an AgentMessage (or null to skip).
 */
export function transformRelayClawChunk(frame: RelayClawWsFrame, agentId: AgentId): AgentMessage | null {
  // connection.ack is handled at connection level, not yielded as a message
  if (frame.type === 'event' && frame.event === 'connection.ack') {
    return null;
  }

  const payload: RelayClawChunkPayload | null | undefined = frame.payload;
  if (!payload) return null;

  const eventType = payload.event_type;

  // Terminal chunk with no event_type — just marks stream end
  if (!eventType && payload.is_complete) return null;

  switch (eventType) {
    case 'task.update': {
      // 全量任务快照：直接转为 task_progress system_info，复用前端已有的消耗路径
      const rawTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      const tasks = rawTasks.map((t) => ({
        id: t.task_id,
        subject: t.task_content,
        // jiuwen 的 in_progress 对应前端的 in_progress；pending / completed 直接映射
        status: (t.status === 'in_progress' ? 'in_progress' : t.status === 'completed' ? 'completed' : 'pending') as
          | 'pending'
          | 'in_progress'
          | 'completed',
      }));
      return {
        type: 'system_info',
        agentId,
        content: JSON.stringify({ type: 'task_progress', agentId, tasks }),
        timestamp: Date.now(),
      };
    }

    case 'task.start': {
      const taskId = typeof payload.task_id === 'string' ? payload.task_id.trim() : '';
      const titleRaw = typeof payload.task_content === 'string' ? payload.task_content.trim() : '';
      if (!taskId) {
        log.warn({ requestId: frame.request_id }, 'jiuwen task.start without task_id — skipped');
        return null;
      }
      if (isRelayClawTransportErrorText(titleRaw)) return null;
      const taskIndex = typeof payload.task_index === 'number' ? payload.task_index : undefined;
      const totalTasks = typeof payload.total_tasks === 'number' ? payload.total_tasks : undefined;
      const taskContext = {
        id: taskId,
        ...(titleRaw ? { title: titleRaw } : {}),
        ...(taskIndex !== undefined ? { index: taskIndex } : {}),
        ...(totalTasks !== undefined ? { total: totalTasks } : {}),
      };
      return {
        type: 'system_info',
        agentId,
        content: JSON.stringify({
          type: 'task_boundary',
          phase: 'start',
          taskId,
          title: titleRaw || undefined,
          taskIndex,
          totalTasks,
        }),
        taskContext,
        taskPhase: 'start',
        timestamp: Date.now(),
      };
    }

    case 'task.complete': {
      const taskId = typeof payload.task_id === 'string' ? payload.task_id.trim() : '';
      if (!taskId) {
        log.warn({ requestId: frame.request_id }, 'jiuwen task.complete without task_id — skipped');
        return null;
      }
      const titleRaw = typeof payload.task_content === 'string' ? payload.task_content.trim() : '';
      const taskContext = {
        id: taskId,
        ...(titleRaw ? { title: titleRaw } : {}),
      };
      return {
        type: 'system_info',
        agentId,
        content: JSON.stringify({
          type: 'task_boundary',
          phase: 'complete',
          taskId,
          ...(titleRaw ? { title: titleRaw } : {}),
        }),
        taskContext,
        taskPhase: 'complete',
        timestamp: Date.now(),
      };
    }

    case 'chat.delta': {
      const content = payload.content;
      if (!content) return null;
      if (isRelayClawTransportErrorText(content)) return null;
      if (payload.source_chunk_type === 'llm_reasoning') {
        return {
          type: 'system_info',
          agentId,
          content: JSON.stringify({ type: 'thinking', agentId, text: content, mergeStrategy: 'append' }),
          timestamp: Date.now(),
        };
      }
      return msg('text', agentId, content);
    }

    case 'chat.reasoning': {
      const content = payload.content;
      if (!content) return null;
      return {
        type: 'system_info',
        agentId,
        content: JSON.stringify({ type: 'thinking', agentId, text: content, mergeStrategy: 'append' }),
        timestamp: Date.now(),
      };
    }

    case 'chat.final': {
      return null;
    }

    case 'chat.done': {
      return null;
    }

    case 'chat.tool_calls.delta': {
      return null;
    }

    case 'chat.tool_call': {
      const toolCall = payload.tool_call;
      if (!toolCall) return null;
      const toolName = (toolCall.name ?? toolCall.tool_name ?? 'unknown') as string;
      const toolInput = (toolCall.arguments ?? toolCall.input ?? toolCall) as Record<string, unknown>;
      const toolCallId = (toolCall.id ?? toolCall.tool_call_id ?? payload.tool_call_id) as string | undefined;
      return {
        type: 'tool_use',
        agentId,
        toolName,
        toolInput,
        toolCallId,
        timestamp: Date.now(),
      };
    }

    case 'chat.tool_result': {
      const toolResult = (payload.tool_result ?? payload) as Record<string, unknown>;
      const result = (payload.result ?? toolResult.result ?? '') as string | unknown;
      const toolCallId = (toolResult.tool_call_id ?? payload.tool_call_id) as string | undefined;
      const toolName = (toolResult.tool_name ?? payload.tool_name) as string | undefined;
      return {
        type: 'tool_result',
        agentId,
        content: typeof result === 'string' ? result : JSON.stringify(result),
        toolCallId,
        toolName,
        timestamp: Date.now(),
      };
    }

    case 'chat.error': {
      const error = payload.error ?? 'Unknown relay-claw error';
      // 提取 error_code，用于前端精准识别特定错误类型（如 ModelArts.81101 限流）
      const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
      const errorCodeMatch = errorStr.match(/'error_code':\s*'([^']+)'/) ||
        errorStr.match(/"error_code":\s*"([^"]+)"/)||
        errorStr.match(/'code':\s*'([^']+)'/) ||
        errorStr.match(/"code":\s*"([^"]+)"/); 
      const errorCode = errorCodeMatch?.[1];
      return { type: 'error', agentId, error: errorStr, ...(errorCode ? { errorCode } : {}), timestamp: Date.now() };
    }

    case 'chat.processing_status': {
      const status = payload.is_processing ? (payload.current_task ?? 'thinking') : 'idle';
      return msg('system_info', agentId, JSON.stringify({ type: 'processing_status', status }));
    }

    case 'chat.ask_user_question': {
      const question = payload.content ?? JSON.stringify(payload);
      return msg('system_info', agentId, question);
    }

    // Events we intentionally skip
    case 'context.compressed':
    case 'todo.updated':
    case 'chat.media':
    case 'chat.file':
    case 'chat.interrupt_result':
    case 'chat.subtask_update':
    case 'chat.session_result':
    case 'chat.usage_metadata':
    case 'chat.evolution_status':
    case 'chat.tool_update':
    case 'connection.ack':
      return null;

    default: {
      // Unknown event: extract content if present, otherwise skip
      log.warn({ eventType, requestId: frame.request_id }, 'jiuwen unknown event type — possible protocol drift');
      const content = payload.content;
      if (isRelayClawTransportErrorText(content)) return null;
      if (content) return msg('text', agentId, content);
      return null;
    }
  }
}
