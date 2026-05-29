/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * XiaoYi OpenClaw Protocol — types, constants, auth, message builders
 *
 * A2A JSON-RPC 2.0 protocol helpers for HAG communication.
 * Separated from XiaoyiAdapter to keep file sizes within project limits.
 *
 * F151 | ADR-014
 */

import { createHmac } from 'node:crypto';

let msgSeq = 0;
function nextMsgId(): string {
  return `msg_${Date.now()}_${++msgSeq}`;
}

// ── Constants ──

export const WS_PRIMARY = `${process.env.XIAOYI_WS_PRIMARY_URL ?? ''}/openclaw/v1/ws/link`;
export const WS_BACKUP = `${process.env.XIAOYI_WS_BACKUP_URL ?? ''}/openclaw/v1/ws/link`;
export const APP_HEARTBEAT_MS = 20_000;
export const WS_PING_MS = 30_000;
export const PONG_TIMEOUT_MS = 90_000;
export const MAX_RECONNECT = 10;
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
export const DEDUP_TTL_MS = 5 * 60_000;
export const STATUS_KEEPALIVE_MS = 20_000;
export const TASK_TIMEOUT_MS = 120_000;

// ── Types ──

export interface A2AFilePart {
  name: string;
  mimeType: string;
  uri: string;
}

export interface A2AInbound {
  jsonrpc?: string;
  method?: string;
  id?: string;
  agentId?: string;
  sessionId?: string;
  params?: {
    id?: string;
    sessionId?: string;
    agentId?: string;
    message?: {
      role?: string;
      parts?: Array<{ kind?: string; text?: string; file?: A2AFilePart }>;
    };
  };
}

export interface WsChannel {
  ws: import('ws').default | null;
  url: string;
  label: string;
  appTimer: ReturnType<typeof setInterval> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  lastPong: number;
  reconnects: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface TaskRecord {
  taskId: string;
  source: string;
}

export interface XiaoyiAttachment {
  type: 'image' | 'file' | 'audio';
  /** URI from HAG — direct download URL (maps to platformKey in ConnectorRouter) */
  xiaoyiUri: string;
  fileName?: string;
  mimeType?: string;
}

export interface XiaoyiInboundMessage {
  chatId: string;
  text: string;
  messageId: string;
  taskId: string;
  /** ADR-014 decision #2: owner:{agentId} — pseudo-user-id for Principal Link */
  senderId: string;
  attachments?: XiaoyiAttachment[];
}

/** Extract file parts from A2A inbound message parts (validates mimeType is string). */
export function extractFileParts(parts: Array<{ kind?: string; text?: string; file?: A2AFilePart }>): A2AFilePart[] {
  return parts
    .filter(
      (p): p is { kind: 'file'; file: A2AFilePart } =>
        p.kind === 'file' && p.file != null && typeof p.file.uri === 'string' && typeof p.file.mimeType === 'string',
    )
    .map((p) => p.file);
}

/**
 * SSRF guard — validates that a XiaoYi file URI is safe to fetch.
 * Deny-list approach: rejects non-https, localhost, private-network IPs.
 * No domain allowlist — HAG uses multiple CDN domains (huawei.com,
 * huaweicloud.com, dbankcloud.com, etc.) and the URI comes from an
 * authenticated WebSocket connection (trusted source).
 */
const PRIVATE_IP =
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|169\.254\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:|::ffff:)/;

export function assertSafeXiaoyiUri(uri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`XiaoYi media URI is not a valid URL: ${uri.slice(0, 120)}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`XiaoYi media URI must be https, got: ${parsed.protocol}`);
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || PRIVATE_IP.test(host)) {
    throw new Error(`XiaoYi media URI points to private network: ${parsed.hostname}`);
  }
}

export interface XiaoyiAdapterOptions {
  agentId: string;
  ak: string;
  sk: string;
}

// ── Auth ──

export function generateXiaoyiSignature(sk: string, timestamp: string): string {
  return createHmac('sha256', sk).update(timestamp).digest('base64');
}

// ── Protocol Message Builders ──

export function envelope(agentId: string, msgType: string): string {
  return JSON.stringify({ msgType, agentId });
}

export function agentResponse(
  agentId: string,
  sessionId: string,
  taskId: string,
  detail: Record<string, unknown>,
): string {
  return JSON.stringify({
    msgType: 'agent_response',
    agentId,
    sessionId,
    taskId,
    msgDetail: JSON.stringify(detail),
  });
}

export function artifactUpdate(
  taskId: string,
  artifactId: string,
  text: string,
  opts: { append: boolean; lastChunk: boolean; partKind?: 'text' | 'reasoningText' },
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id: nextMsgId(),
    result: {
      taskId,
      kind: 'artifact-update',
      append: opts.append,
      lastChunk: opts.lastChunk,
      final: false,
      artifact: {
        artifactId,
        parts: [
          opts.partKind === 'reasoningText' ? { kind: 'reasoningText', reasoningText: text } : { kind: 'text', text },
        ],
      },
    },
  };
}

/** Close frame or keepalive. final derived from state: working→false, completed/failed→true. */
export function statusUpdate(
  taskId: string,
  state: 'working' | 'completed' | 'failed',
  message?: string,
): Record<string, unknown> {
  const status: Record<string, unknown> = { state };
  if (message !== undefined) {
    status.message = { parts: [{ kind: 'text', text: message }] };
  }
  return {
    jsonrpc: '2.0',
    id: nextMsgId(),
    result: {
      taskId,
      kind: 'status-update',
      final: state !== 'working',
      status,
    },
  };
}
