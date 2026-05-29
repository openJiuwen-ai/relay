/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Session Transcript Routes — F24 Phase D + F98
 * API endpoints for reading sealed session transcripts.
 *
 * GET  /api/sessions/:sessionId/events                    — Paginated events (view=raw|chat|handoff)
 * GET  /api/sessions/:sessionId/digest                    — Extractive digest
 * GET  /api/sessions/:sessionId/invocations/:invocationId — Events for one invocation
 * GET  /api/threads/:threadId/sessions/search              — Full-text search
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { formatEventsChat, formatEventsHandoff } from '../domains/agents/services/session/TranscriptFormatter.js';
import type { TranscriptReader } from '../domains/agents/services/session/TranscriptReader.js';
import type { ISessionChainStore } from '../domains/agents/services/stores/ports/SessionChainStore.js';
import type { IThreadStore } from '../domains/agents/services/stores/ports/ThreadStore.js';
import { resolveUserId } from '../utils/request-identity.js';

const VALID_VIEWS = new Set(['raw', 'chat', 'handoff']);

interface SessionTranscriptRouteOptions extends FastifyPluginOptions {
  sessionChainStore: ISessionChainStore;
  threadStore: IThreadStore;
  transcriptReader: TranscriptReader;
}

/** Strict integer parse: only pure decimal digit strings (no whitespace, no partial) */
function strictParseInt(s: string): number {
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

const searchSchema = z.object({
  q: z.string().min(1).max(500),
  agents: z.string().optional(),
  sessionIds: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  scope: z.enum(['digests', 'transcripts', 'both']).optional(),
});

function checkAgentIdAccess(request: { headers: Record<string, unknown> }, sessionAgentId: string): string | null {
  const callerAgentId = request.headers['x-agent-id'] as string | undefined;
  if (callerAgentId && sessionAgentId !== callerAgentId) {
    return 'Access denied: session belongs to a different agent';
  }
  return null;
}

export async function sessionTranscriptRoutes(
  app: FastifyInstance,
  opts: SessionTranscriptRouteOptions,
): Promise<void> {
  const { sessionChainStore, threadStore, transcriptReader } = opts;
  const canAccessThread = (createdBy: string, userId: string) => createdBy === userId || createdBy === 'system';

  // GET /api/sessions/:sessionId/events — Paginated event read (F98: view modes)
  app.get<{
    Params: { sessionId: string };
    Querystring: { cursor?: string; limit?: string; view?: string };
  }>('/api/sessions/:sessionId/events', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const { sessionId } = request.params;
    const session = await sessionChainStore.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const thread = await threadStore.get(session.threadId);
    if (!thread || !canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    const callerAgentIdErr = checkAgentIdAccess(request, session.agentId);
    if (callerAgentIdErr) {
      reply.status(403);
      return { error: callerAgentIdErr };
    }

    const view = (request.query.view ?? 'raw') as string;
    if (!VALID_VIEWS.has(view)) {
      reply.status(400);
      return { error: `Invalid view: must be one of raw, chat, handoff` };
    }

    const cursorParam = request.query.cursor;
    const cursorNum = cursorParam ? strictParseInt(cursorParam) : undefined;
    if (cursorNum != null && (Number.isNaN(cursorNum) || cursorNum < 0)) {
      reply.status(400);
      return { error: 'Invalid cursor: must be a non-negative integer' };
    }
    const cursor = cursorNum != null ? { eventNo: cursorNum } : undefined;

    const limitParam = request.query.limit;
    const limitNum = limitParam ? strictParseInt(limitParam) : undefined;
    if (limitNum != null && (Number.isNaN(limitNum) || limitNum < 1)) {
      reply.status(400);
      return { error: 'Invalid limit: must be a positive integer' };
    }
    const limit = limitNum != null ? Math.min(limitNum, 200) : 50;

    const result = await transcriptReader.readEvents(sessionId, session.threadId, session.agentId, cursor, limit);

    if (view === 'chat') {
      return reply.send({
        messages: formatEventsChat(result.events),
        nextCursor: result.nextCursor,
        total: result.total,
      });
    }
    if (view === 'handoff') {
      return reply.send({
        invocations: formatEventsHandoff(result.events),
        nextCursor: result.nextCursor,
        total: result.total,
      });
    }

    return reply.send(result);
  });

  // GET /api/sessions/:sessionId/digest — Extractive digest
  app.get<{
    Params: { sessionId: string };
  }>('/api/sessions/:sessionId/digest', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const { sessionId } = request.params;
    const session = await sessionChainStore.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const thread = await threadStore.get(session.threadId);
    if (!thread || !canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    const callerAgentIdErr2 = checkAgentIdAccess(request, session.agentId);
    if (callerAgentIdErr2) {
      reply.status(403);
      return { error: callerAgentIdErr2 };
    }

    const digest = await transcriptReader.readDigest(sessionId, session.threadId, session.agentId);
    if (!digest) {
      return reply.status(404).send({ error: 'Digest not found' });
    }

    return reply.send(digest);
  });

  // GET /api/sessions/:sessionId/invocations/:invocationId — F98 Gap 2
  app.get<{
    Params: { sessionId: string; invocationId: string };
  }>('/api/sessions/:sessionId/invocations/:invocationId', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const { sessionId, invocationId } = request.params;
    const session = await sessionChainStore.get(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const thread = await threadStore.get(session.threadId);
    if (!thread || !canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    const callerAgentIdErr3 = checkAgentIdAccess(request, session.agentId);
    if (callerAgentIdErr3) {
      reply.status(403);
      return { error: callerAgentIdErr3 };
    }

    const events = await transcriptReader.readInvocationEvents(
      sessionId,
      session.threadId,
      session.agentId,
      invocationId,
    );
    if (!events) {
      return reply.status(404).send({ error: 'Invocation not found' });
    }

    return reply.send({ invocationId, events, total: events.length });
  });

  // GET /api/threads/:threadId/sessions/search — Full-text search
  app.get<{
    Params: { threadId: string };
    Querystring: Record<string, string>;
  }>('/api/threads/:threadId/sessions/search', async (request, reply) => {
    const userId = resolveUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }

    const { threadId } = request.params;
    const thread = await threadStore.get(threadId);
    if (!thread || !canAccessThread(thread.createdBy, userId)) {
      reply.status(403);
      return { error: 'Access denied' };
    }

    const parseResult = searchSchema.safeParse(request.query);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parseResult.error.issues };
    }

    const { q, agents: agentsParam, sessionIds, limit, scope } = parseResult.data;

    // P0a enforcement: when x-agent-id header is present, force-filter to caller's own sessions only
    // Prevents game-playing agents from searching other agents' session content (KD-39)
    const callerAgentId = request.headers['x-agent-id'] as string | undefined;
    const agentsArr = callerAgentId ? [callerAgentId] : agentsParam?.split(',').filter(Boolean);
    const sessionIdsArr = sessionIds?.split(',').filter(Boolean);

    const hits = await transcriptReader.search(threadId, q, {
      ...(agentsArr ? { agents: agentsArr } : {}),
      ...(sessionIdsArr ? { sessionIds: sessionIdsArr } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(scope ? { scope } : {}),
    });

    return reply.send({ hits });
  });
}
