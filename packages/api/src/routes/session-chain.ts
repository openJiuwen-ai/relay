/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Session Chain Routes
 * F24: API endpoints for session chain + context health data.
 *
 * GET   /api/threads/:threadId/sessions            - List sessions (optional agentId filter)
 * GET   /api/threads/:threadId/usage               - Thread-level token usage aggregation
 * GET   /api/sessions/:sessionId                   - Get single session record
 * POST  /api/sessions/:sessionId/unseal            - Manual unseal fallback (#F062)
 * PATCH /api/threads/:threadId/sessions/:agentId/bind - Manual bind CLI session ID (#72)
 */

import { type AgentId, officeClawRegistry } from '@openjiuwen/relay-shared';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { AuditEventTypes, getEventAuditLog } from '../domains/agents/services/orchestration/EventAuditLog.js';
import { backfillBoundSessionHistory } from '../domains/agents/services/session/BoundSessionHistoryImporter.js';
import type { ISessionSealer } from '../domains/agents/services/session/SessionSealer.js';
import type { TranscriptReader } from '../domains/agents/services/session/TranscriptReader.js';
import type { IMessageStore } from '../domains/agents/services/stores/ports/MessageStore.js';
import type { ISessionChainStore } from '../domains/agents/services/stores/ports/SessionChainStore.js';
import type { IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import { resolveUserId } from '../utils/request-identity.js';

interface AgentUsageBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  sessions: number;
}

function aggregateSessionUsage(
  threadId: string,
  sessions: {
    agentId: string;
    lastUsage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; costUsd?: number };
  }[],
) {
  const byCat: Record<string, AgentUsageBucket> = {};
  for (const s of sessions) {
    if (!s.lastUsage) continue;
    if (!byCat[s.agentId]) {
      byCat[s.agentId] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, sessions: 0 };
    }
    const c = byCat[s.agentId];
    c.inputTokens += s.lastUsage.inputTokens ?? 0;
    c.outputTokens += s.lastUsage.outputTokens ?? 0;
    c.cacheReadTokens += s.lastUsage.cacheReadTokens ?? 0;
    c.costUsd += s.lastUsage.costUsd ?? 0;
    c.sessions += 1;
  }
  const total = Object.values(byCat).reduce(
    (acc, c) => ({
      inputTokens: acc.inputTokens + c.inputTokens,
      outputTokens: acc.outputTokens + c.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + c.cacheReadTokens,
      costUsd: acc.costUsd + c.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 },
  );
  return { threadId, total, byCat, sessionCount: sessions.length };
}

const bindSessionSchema = z.object({
  cliSessionId: z.string().min(1).max(500),
});

interface SessionChainRouteOptions extends FastifyPluginOptions {
  sessionChainStore: ISessionChainStore;
  threadStore: IThreadStore;
  messageStore?: IMessageStore;
  transcriptReader?: TranscriptReader;
  sessionSealer?: ISessionSealer;
}

export async function sessionChainRoutes(app: FastifyInstance, opts: SessionChainRouteOptions): Promise<void> {
  const { sessionChainStore, threadStore, messageStore, transcriptReader, sessionSealer } = opts;
  const canAccessThread = (createdBy: string, userId: string) => createdBy === userId || createdBy === 'system';

  app.get<{
    Params: { threadId: string };
    Querystring: { agentId?: string };
  }>('/api/threads/:threadId/sessions', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const { threadId } = request.params;
    const thread = await threadStore.get(threadId);
    if (!thread || !canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    const { agentId } = request.query;
    const callerAgentId = request.headers['x-agent-id'] as string | undefined;

    // When caller identifies as a specific agent (MCP tool), restrict to own sessions only.
    // Query param `agentId` is ignored when it differs from caller — prevents cross-agent enumeration.
    const effectiveAgentId = callerAgentId ?? agentId;

    if (effectiveAgentId) {
      if (callerAgentId && agentId && agentId !== callerAgentId) {
        reply.status(403);
        return { error: `Cannot query sessions for agent '${agentId}' — you are '${callerAgentId}'` };
      }
      const sessions = await sessionChainStore.getChain(effectiveAgentId as AgentId, threadId);
      return reply.send({ sessions });
    }

    // No agentId filter at all (hub UI god-view) — return all sessions for the thread
    const sessions = await sessionChainStore.getChainByThread(threadId);
    return reply.send({ sessions });
  });

  // GET /api/threads/:threadId/usage — Thread-level token usage aggregation
  app.get<{
    Params: { threadId: string };
    Querystring: { agentId?: string };
  }>('/api/threads/:threadId/usage', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) return reply.status(401).send({ error: 'Identity required' });

    const { threadId } = request.params;
    const thread = await threadStore.get(threadId);
    if (!thread || !canAccessThread(thread.createdBy, userId)) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    // x-agent-id isolation: agent-scoped callers (MCP tools) can only see own usage
    const { agentId } = request.query;
    const callerAgentId = request.headers['x-agent-id'] as string | undefined;
    const effectiveAgentId = callerAgentId ?? agentId;
    if (callerAgentId && agentId && agentId !== callerAgentId) {
      return reply.status(403).send({ error: `Cannot query usage for agent '${agentId}' — you are '${callerAgentId}'` });
    }

    const allSessions = await sessionChainStore.getChainByThread(threadId);
    const sessions = effectiveAgentId ? allSessions.filter((s) => s.agentId === effectiveAgentId) : allSessions;

    return aggregateSessionUsage(threadId, sessions);
  });

  app.get<{
    Params: { sessionId: string };
  }>('/api/sessions/:sessionId', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const { sessionId } = request.params;
    const session = await sessionChainStore.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    // Verify thread ownership via session -> thread
    const thread = await threadStore.get(session.threadId);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }
    if (!canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    return reply.send(session);
  });

  // POST /api/sessions/:sessionId/unseal — Manual fallback (#F062)
  // Re-open a sealed/sealing session by creating a fresh active chain record
  // bound to the same CLI session ID.
  app.post<{
    Params: { sessionId: string };
  }>('/api/sessions/:sessionId/unseal', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const { sessionId } = request.params;
    const session = await sessionChainStore.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const thread = await threadStore.get(session.threadId);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }
    if (!canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    if (session.status === 'active') {
      return reply.send({ session, mode: 'already_active' as const });
    }
    if (session.status !== 'sealed' && session.status !== 'sealing') {
      reply.status(409);
      return { error: `Session status ${session.status} cannot be reopened` };
    }

    const active = await sessionChainStore.getActive(session.agentId, session.threadId);
    if (active && active.id !== session.id) {
      // Only displace the active session if it's empty (no messages).
      // A non-empty active session is real work — refuse to destroy it.
      if ((active.messageCount ?? 0) > 0) {
        reply.status(409);
        return {
          error: 'Another active session with messages already exists for this agent/thread',
          activeSessionId: active.id,
        };
      }
      // Empty replacement (e.g., auto-seal created it) → safe to displace.
      // Use sessionSealer when available for consistent seal semantics.
      let displaced = false;
      if (sessionSealer) {
        try {
          const result = await sessionSealer.requestSeal({ sessionId: active.id, reason: 'unseal_displacement' });
          if (result.accepted) {
            sessionSealer.finalize({ sessionId: active.id }).catch(() => {});
            displaced = true;
          }
        } catch {
          /* best-effort — empty session, no data to lose */
        }
      } else {
        await sessionChainStore.update(active.id, {
          status: 'sealed',
          sealReason: 'unseal_displacement',
          sealedAt: Date.now(),
          updatedAt: Date.now(),
        });
        displaced = true;
      }
      if (!displaced) {
        reply.status(409);
        return {
          error: 'Failed to displace active session (CAS race) — retry unseal',
          activeSessionId: active.id,
        };
      }
    }

    const reopened = await sessionChainStore.create({
      cliSessionId: session.cliSessionId,
      threadId: session.threadId,
      agentId: session.agentId,
      userId: session.userId,
    });

    getEventAuditLog()
      .append({
        type: AuditEventTypes.SESSION_BIND,
        threadId: session.threadId,
        data: {
          mode: 'unseal_reopen',
          fromSessionId: session.id,
          toSessionId: reopened.id,
          agentId: session.agentId,
          cliSessionId: session.cliSessionId,
          userId,
        },
      })
      .catch(() => {
        /* best-effort */
      });

    return reply.send({
      mode: 'reopened' as const,
      fromSessionId: session.id,
      session: reopened,
    });
  });

  // PATCH /api/threads/:threadId/sessions/:agentId/bind — Manual bind (#72)
  // Allows 用户 to bind a known-good CLI session ID to an agent's thread session.
  // If active session exists → update cliSessionId; otherwise → create new session.
  app.patch<{
    Params: { threadId: string; agentId: string };
  }>('/api/threads/:threadId/sessions/:agentId/bind', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Office-Claw-User header or userId query)' };
    }

    const { threadId, agentId } = request.params;

    // Validate agentId against runtime registry
    if (!officeClawRegistry.has(agentId)) {
      reply.status(400);
      return { error: `Invalid agentId: ${agentId}. Must be one of: ${officeClawRegistry.getAllIds().join(', ')}` };
    }

    // Validate body
    const parseResult = bindSessionSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { cliSessionId } = parseResult.data;

    // Verify thread exists + ownership
    const thread = await threadStore.get(threadId);
    if (!thread) {
      reply.status(404);
      return { error: 'Thread not found' };
    }
    if (!canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    // Check for active session
    const active = await sessionChainStore.getActive(agentId as AgentId, threadId);

    let session;
    let mode: 'updated' | 'created';

    if (active) {
      // Update existing active session's cliSessionId
      const updated = await sessionChainStore.update(active.id, {
        cliSessionId,
        updatedAt: Date.now(),
      });
      if (!updated) {
        reply.status(409);
        return { error: 'Session was modified concurrently, please retry' };
      }
      session = updated;
      mode = 'updated';
    } else {
      // No active session → create new one
      session = await sessionChainStore.create({
        cliSessionId,
        threadId,
        agentId: agentId as AgentId,
        userId,
      });
      mode = 'created';
    }

    // Audit trail (best-effort, fire-and-forget)
    getEventAuditLog()
      .append({
        type: AuditEventTypes.SESSION_BIND,
        threadId,
        data: { agentId, cliSessionId, mode, sessionId: session.id, userId },
      })
      .catch(() => {
        /* best-effort */
      });

    const historyImport = await backfillBoundSessionHistory({
      sessionChainStore,
      transcriptReader,
      messageStore,
      threadId,
      agentId: agentId as AgentId,
      userId,
    });

    return reply.send({ session, mode, historyImport });
  });
}
