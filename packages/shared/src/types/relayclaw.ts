/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * RelayClaw Agent Types
 *
 * Configuration and wire-protocol types for connecting to a relay-claw
 * AgentWebSocketServer (openJiuwen agent exposed via WebSocket).
 */

/** Configuration for connecting to a relay-claw agent server */
export interface RelayClawAgentConfig {
  /** WebSocket endpoint URL (e.g. "ws://127.0.0.1:18092") */
  url?: string;
  /** Request timeout in ms (default: 1_800_000 — agent tasks can be long) */
  timeoutMs?: number;
  /** Channel ID sent in requests (default: "officeclaw") */
  channelId?: string;
  /** Start a dedicated local jiuwenclaw sidecar when url is not provided */
  autoStart?: boolean;
  /** Preferred executable used to launch vendored jiuwenclaw on packaged runtimes */
  executablePath?: string;
  /** Python executable used to launch relay-claw */
  pythonBin?: string;
  /** relay-claw repository / package working directory */
  appDir?: string;
  /** Dedicated HOME for this agent's relay-claw runtime */
  homeDir?: string;
  /** Model name injected into sidecar env */
  modelName?: string;
  /** Optional fixed agent port for the sidecar */
  agentPort?: number;
  /** Optional fixed web port for the sidecar */
  webPort?: number;
  /** Sidecar boot timeout in ms */
  startupTimeoutMs?: number;
  /** 技能白名单配置 - 允许的技能 ID 列表 */
  skills?: readonly string[];
}

/**
 * Inbound event types from the relay-claw agent stream.
 * Maps to EventType enum in jiuwenclaw/schema/message.py.
 */
export type RelayClawEventType =
  | 'task.start'
  | 'task.update'
  | 'task.complete'
  | 'chat.delta'
  | 'chat.reasoning'
  | 'chat.final'
  | 'chat.done'
  | 'chat.tool_calls.delta'
  | 'chat.tool_call'
  | 'chat.tool_result'
  | 'chat.tool_update'
  | 'chat.error'
  | 'chat.processing_status'
  | 'chat.ask_user_question'
  | 'chat.usage_metadata'
  | 'chat.evolution_status'
  | 'chat.media'
  | 'chat.file'
  | 'chat.interrupt_result'
  | 'chat.subtask_update'
  | 'chat.session_result'
  | 'context.compressed'
  | 'todo.updated'
  | 'connection.ack';

/** A streaming chunk received from the relay-claw agent WS server */
export interface RelayClawChunkPayload {
  event_type?: RelayClawEventType;
  content?: string;
  task_id?: string;
  task_content?: string;
  task_index?: number;
  total_tasks?: number;
  /** task.update: 完整的任务快照列表 */
  tasks?: Array<{
    task_id: string;
    task_content: string;
    task_index: number;
    source: string;
    status: 'pending' | 'in_progress' | 'completed';
    start_time?: number;
  }>;
  error?: string;
  tool_call?: Record<string, unknown>;
  tool_name?: string;
  tool_call_id?: string;
  result?: string;
  is_complete?: boolean;
  is_processing?: boolean;
  current_task?: string;
  todos?: unknown[];
  source_chunk_type?: string;
  [key: string]: unknown;
}

/** Raw WS frame from the relay-claw agent (both chunk and response) */
export interface RelayClawWsFrame {
  /** Present on connection.ack event frames */
  type?: 'event';
  event?: string;
  /** Present on request-correlated frames */
  request_id?: string;
  channel_id?: string;
  ok?: boolean;
  payload?: RelayClawChunkPayload | null;
  is_complete?: boolean;
  metadata?: Record<string, unknown>;
}

/** E2A protocol response status */
export type E2AResponseStatus = 'in_progress' | 'succeeded' | 'failed';

/** E2A protocol response kind */
export type E2AResponseKind = 'e2a.chunk' | 'e2a.complete' | 'e2a.error';

/** E2A protocol delta kind */
export type E2ADeltaKind = 'text' | 'reasoning' | 'custom';

/** E2A protocol body for chunk responses */
export interface E2ABody {
  delta_kind?: E2ADeltaKind;
  delta?: string | Record<string, unknown>;
  event_type?: string;
  source_chunk_type?: string;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

/** E2A protocol provenance */
export interface E2AProvenance {
  source_protocol?: string;
  converter?: string;
  converted_at?: string;
  details?: Record<string, unknown>;
}

/** E2A protocol response frame (new jiuwenclaw wire format) */
export interface E2AResponseFrame {
  protocol_version?: string;
  response_id?: string;
  request_id?: string;
  sequence?: number;
  is_final?: boolean;
  status?: E2AResponseStatus;
  response_kind?: E2AResponseKind;
  timestamp?: string;
  provenance?: E2AProvenance;
  body?: E2ABody;
  channel?: string;
  metadata?: Record<string, unknown>;
}

/** Union type for all possible wire frames */
export type JiuwenWireFrame = RelayClawWsFrame | E2AResponseFrame;

/** Check if a frame is E2A protocol format */
export function isE2AResponseFrame(frame: unknown): frame is E2AResponseFrame {
  if (typeof frame !== 'object' || frame === null) return false;
  const f = frame as Record<string, unknown>;
  return (
    typeof f.protocol_version === 'string' ||
    typeof f.response_kind === 'string' ||
    f.status !== undefined
  );
}

/** Convert E2A response frame to legacy RelayClawWsFrame format */
export function e2aToLegacyFrame(e2a: E2AResponseFrame): RelayClawWsFrame {
  const body = e2a.body ?? {};
  const metadata = e2a.metadata ?? {};

  if (e2a.response_kind === 'e2a.complete' && e2a.is_final) {
    if (e2a.status === 'failed') {
      return {
        request_id: e2a.request_id,
        channel_id: e2a.channel,
        payload: {
          event_type: 'chat.error',
          error: body.message ?? body.code ?? 'Unknown error',
        },
        is_complete: true,
        metadata,
      };
    }
    const result = body.result ?? {};
    const event_type = (typeof result.event_type === 'string' ? result.event_type : 'chat.final') as RelayClawEventType;
    const content = typeof result.content === 'string' ? result.content : '';
    return {
      request_id: e2a.request_id,
      channel_id: e2a.channel,
      payload: {
        event_type,
        content,
        ...result,
      },
      is_complete: true,
      metadata,
    };
  }

  if (e2a.response_kind === 'e2a.error') {
    return {
      request_id: e2a.request_id,
      channel_id: e2a.channel,
      payload: {
        event_type: 'chat.error',
        error: body.message ?? body.code ?? 'Unknown error',
      },
      is_complete: true,
      metadata,
    };
  }

  const event_type = body.event_type ?? 'chat.delta';
  const delta = body.delta;
  const content = typeof delta === 'string' ? delta : '';

  const payload: RelayClawChunkPayload = {
    event_type: event_type as RelayClawEventType,
    content,
    source_chunk_type: body.source_chunk_type,
  };

  if (typeof delta === 'object' && delta !== null) {
    Object.assign(payload, delta);
  }

  return {
    request_id: e2a.request_id,
    channel_id: e2a.channel,
    payload,
    is_complete: e2a.is_final ?? false,
    metadata,
  };
}
