/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Socket.io Manager
 * 管理 WebSocket 连接和消息广播
 */

import { Server as HttpServer } from 'node:http';
import { createAgentId } from '@openjiuwen/relay-shared';
import { Server, Socket } from 'socket.io';
import { isOriginAllowed, resolveFrontendCorsOrigins } from '../../config/frontend-origin.js';
import type {
  CancelResult,
  InvocationTracker,
} from '../../domains/agents/services/agents/invocation/InvocationTracker.js';
import type { AgentMessage } from '../../domains/agents/services/types.js';
import { classifyAgentErrorCode } from '../../utils/model-sensitive-input-error.js';
import { FRONTEND_DEFAULT_USER_ID, resolveEffectiveUserId } from '../../utils/request-identity.js';
import { createModuleLogger, userVisibleFields } from '../logger.js';

const log = createModuleLogger('ws');

export const SOCKET_IO_PING_INTERVAL_ENV = 'SOCKET_IO_PING_INTERVAL_MS';
export const SOCKET_IO_PING_TIMEOUT_ENV = 'SOCKET_IO_PING_TIMEOUT_MS';

export interface SocketIoPingOptions {
  pingInterval?: number;
  pingTimeout?: number;
}

function readPositiveIntegerMs(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return undefined;
  return value;
}

export function resolveSocketIoPingOptions(env: NodeJS.ProcessEnv = process.env): SocketIoPingOptions {
  const opts: SocketIoPingOptions = {};
  const pingInterval = readPositiveIntegerMs(env, SOCKET_IO_PING_INTERVAL_ENV);
  const pingTimeout = readPositiveIntegerMs(env, SOCKET_IO_PING_TIMEOUT_ENV);
  if (pingInterval !== undefined) opts.pingInterval = pingInterval;
  if (pingTimeout !== undefined) opts.pingTimeout = pingTimeout;
  return opts;
}

function readSocketHandshakeUserId(socket: Socket): string | null {
  const auth = socket.handshake.auth;
  if (auth && typeof auth === 'object' && !Array.isArray(auth)) {
    const userId = Reflect.get(auth, 'userId');
    if (typeof userId === 'string' && userId.trim()) {
      return userId.trim();
    }
  }

  const queryUserId = socket.handshake.query?.userId;
  if (typeof queryUserId === 'string' && queryUserId.trim()) {
    return queryUserId.trim();
  }

  return null;
}

/**
 * Build the sequence of AgentMessages to broadcast after a successful cancel.
 * Pure function — extracted for testability (avoids duplicating logic in tests).
 */
export function buildCancelMessages(result: CancelResult): AgentMessage[] {
  if (!result.cancelled) return [];
  const agentIds = result.agentIds.length > 0 ? result.agentIds : ['opus'];
  const now = Date.now();
  const messages: AgentMessage[] = [];

  // Single system_info to avoid "cancel chorus"
  messages.push({
    type: 'system_info',
    agentId: createAgentId(agentIds[0]!),
    content: '⏹ 已取消',
    timestamp: now,
  });

  // Per-agent done to ensure each agent's loading state is cleared
  for (const agentId of agentIds) {
    messages.push({
      type: 'done',
      agentId: createAgentId(agentId),
      isFinal: true,
      timestamp: now,
    });
  }

  return messages;
}

export class SocketManager {
  private io: Server;
  private invocationTracker: InvocationTracker | null;
  private invocationThreadIndex: Map<string, string>;
  private multiMentionOrchestrator: {
    abortByThread(threadId: string): number;
    abortBySlot?(threadId: string, agentId: string): number;
  } | null;

  constructor(httpServer: HttpServer, invocationTracker?: InvocationTracker) {
    this.invocationTracker = invocationTracker ?? null;
    this.invocationThreadIndex = new Map();
    this.multiMentionOrchestrator = null;
    const corsOrigins = resolveFrontendCorsOrigins(process.env, console);
    const pingOptions = resolveSocketIoPingOptions(process.env);
    this.io = new Server(httpServer, {
      cors: {
        origin: corsOrigins,
        credentials: true,
      },
      ...pingOptions,
      // Socket.IO's `cors` only protects HTTP long-polling; WebSocket upgrades
      // bypass CORS entirely. This hook is the real security boundary.
      allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        if (!origin) {
          // No Origin header = non-browser client (curl, MCP, etc.).
          // In single-user mode this is safe to allow.
          callback(null, true);
          return;
        }
        if (isOriginAllowed(origin, corsOrigins)) {
          callback(null, true);
          return;
        }
        log.warn({ origin }, 'WebSocket upgrade rejected: origin not in allowlist');
        callback('Origin not allowed', false);
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      // Real-time user-scoped events (`emitToUser`) route on the socket's room identity.
      // Until we have a server-verified socket auth substrate (cookie/session/ephemeral
      // token), keep consuming the existing handshake userId so multi-user delivery works.
      const requestedUserId = readSocketHandshakeUserId(socket) ?? FRONTEND_DEFAULT_USER_ID;
      const userId = resolveEffectiveUserId(requestedUserId) ?? FRONTEND_DEFAULT_USER_ID;

      log.info({ socketId: socket.id, userId }, 'Client connected');
      log.debug(
        {
          socketId: socket.id,
          transport: socket.conn.transport.name,
          remoteAddress: socket.handshake.address,
          userAgent: socket.handshake.headers['user-agent'],
        },
        'Client handshake details',
      );

      // Auto-join user-scoped room for emitToUser (multi-tab support)
      socket.join(`user:${userId}`);

      socket.on('disconnect', () => {
        log.info({ socketId: socket.id }, 'Client disconnected');
      });

      socket.on('join_room', (room: string) => {
        // Validate room name format — only allow known prefixes
        if (!/^(thread:|worktree:|workspace:global$|user:|preview:global$)/.test(room)) {
          log.warn({ socketId: socket.id, room }, 'Attempted to join invalid room');
          return;
        }
        // Room ACL: user-scoped rooms are identity-bound — deny cross-user joins
        if (room.startsWith('user:') && room !== `user:${userId}`) {
          log.warn({ socketId: socket.id, room, userId }, 'Denied cross-user room join');
          return;
        }
        socket.join(room);
        log.info({ socketId: socket.id, room }, 'Joined room');
      });

      socket.on('leave_room', (room: string) => {
        socket.leave(room);
        log.info({ socketId: socket.id, room }, 'Left room');
      });

      socket.on('cancel_invocation', (data: { threadId: string; agentId?: string }) => {
        if (!this.invocationTracker || !data?.threadId) return;
        // Only allow cancel if the socket is in the target thread's room
        const room = `thread:${data.threadId}`;
        if (!socket.rooms.has(room)) {
          log.warn({ socketId: socket.id, threadId: data.threadId }, 'Cancel attempt without room membership');
          return;
        }
        if (data.agentId) {
          // F108: Slot-specific cancel
          const result = this.invocationTracker.cancel(data.threadId, data.agentId, userId);
          if (result.cancelled) {
            const agentIds = result.agentIds.length > 0 ? result.agentIds : [data.agentId];
            log.info({ threadId: data.threadId, agentId: data.agentId, agents: agentIds }, 'Cancelled slot');
            for (const msg of buildCancelMessages(result)) {
              this.broadcastAgentMessage(msg, data.threadId);
            }
          }
          // F108 + F086: Also abort multi-mention dispatches for this specific agent
          this.multiMentionOrchestrator?.abortBySlot?.(data.threadId, data.agentId);
        } else {
          // Only cancel invocations owned by this socket's user.
          const cancelledAgentIds = this.invocationTracker.cancelAll(data.threadId, userId);
          if (cancelledAgentIds.length > 0) {
            for (const msg of buildCancelMessages({ cancelled: true, agentIds: cancelledAgentIds })) {
              this.broadcastAgentMessage(msg, data.threadId);
            }
          }
          for (const agentId of cancelledAgentIds) {
            this.multiMentionOrchestrator?.abortBySlot?.(data.threadId, agentId);
          }
          log.info(
            { threadId: data.threadId, socketId: socket.id, userId, cancelledAgentIds },
            'Cancelled all invocations',
          );
        }
      });
    });
  }

  /** Wire MultiMentionOrchestrator for cancel propagation (set after construction to avoid circular imports). */
  setMultiMentionOrchestrator(orch: {
    abortByThread(threadId: string): number;
    abortBySlot?(threadId: string, agentId: string): number;
  }): void {
    this.multiMentionOrchestrator = orch;
  }

  /**
   * Broadcast agent message to a thread room.
   * Always scoped to a room.
   * If threadId is missing, try recovering from invocationId -> threadId index first.
   * If recovery fails, the payload is rejected to avoid cross-thread contamination.
   * Never broadcasts globally to prevent cross-thread message leak.
   */
  broadcastAgentMessage(message: AgentMessage, threadId?: string): void {
    const indexedThreadId =
      typeof message.invocationId === 'string' && message.invocationId.trim()
        ? this.invocationThreadIndex.get(message.invocationId)
        : undefined;
    const explicitThreadId = threadId?.trim();
    const resolvedThreadId = explicitThreadId || indexedThreadId;

    if (!resolvedThreadId) {
      log.error(
        {
          messageType: message.type,
          agentId: message.agentId,
          invocationId: message.invocationId,
        },
        'Rejected agent_message broadcast: missing threadId',
      );
      return;
    }
    const tid = resolvedThreadId;
    if (!explicitThreadId && indexedThreadId) {
      log.warn(
        {
          messageType: message.type,
          agentId: message.agentId,
          invocationId: message.invocationId,
          recoveredThreadId: indexedThreadId,
        },
        'Recovered missing threadId from invocation index',
      );
    }
    if (message.invocationId) {
      this.invocationThreadIndex.set(message.invocationId, tid);
    }
    const room = `thread:${tid}`;
    const errorCode = message.type === 'error' ? classifyAgentErrorCode(message.error, message.errorCode) : undefined;
    const classifiedMessage = errorCode ? { ...message, errorCode } : message;
    this.io.to(room).emit('agent_message', { ...classifiedMessage, threadId: tid });
    log.info(
      userVisibleFields(message.type === 'done' || message.type === 'error' ? 'critical' : 'progress', {
        threadId: tid,
        messageType: message.type,
        agentId: message.agentId,
        invocationId: message.invocationId,
      }),
      '[SocketManager] agent message dispatched',
    );
    if (message.type === 'done' && message.isFinal && message.invocationId) {
      this.invocationThreadIndex.delete(message.invocationId);
    }
  }

  broadcastToRoom(room: string, event: string, data: unknown): void {
    this.io.to(room).emit(event, data);
  }

  /** F39: Emit to all sockets belonging to a specific user (multi-tab safe). */
  emitToUser(userId: string, event: string, data: unknown): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  getIO(): Server {
    return this.io;
  }

  /**
   * Close all WebSocket connections (graceful shutdown).
   */
  close(): void {
    this.io.close();
  }
}
