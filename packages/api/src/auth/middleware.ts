/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Auth Middleware — the global request interceptor.
 *
 * Extracts session credential from the request, resolves it via SessionStore,
 * and injects `request.auth` (AuthContext) for business code to consume.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { InMemoryAuthSessionStore } from './session-store.js';
import type { AuthContext } from './types.js';
import { AUTH_SESSION_COOKIE_NAME, resolveSignedAuthCookieUserId } from '../routes/global-auth.js';

function extractSessionId(request: FastifyRequest): string | null {
  // Primary: Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null;
  }
  // Fallback: session header (dual-read for backward compat)
  const sessionHeader =
    (request.headers['x-office-claw-session'] as string) ||
    (request.headers['x-office-claw-session'] as string);
  if (typeof sessionHeader === 'string' && sessionHeader.length > 0) {
    return sessionHeader;
  }
  return null;
}

export function registerAuthMiddleware(
  app: FastifyInstance,
  sessionStore: InMemoryAuthSessionStore,
  options: { skipAuth: boolean },
): void {
  // Decorate request with auth context
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip-auth mode (development only)
    if (options.skipAuth) {
      const userId =
        (request.headers['x-office-claw-user'] as string) ||
        (request.headers['x-office-claw-user'] as string) ||
        'debug-user';
      (request as FastifyRequest & { auth: AuthContext }).auth = {
        userId: typeof userId === 'string' ? userId.trim() : 'debug-user',
        sessionId: 'skip-auth',
        providerId: 'no-auth',
        authenticated: true,
      };
      return;
    }

    // Session-based auth only (Bearer token or session header).
    // X-Office-Claw-User is NOT trusted here — it is NOT an auth credential.
    // Internal/MCP callers that need identity without a session should use
    // resolveHeaderUserId() at the route level (weaker trust, not full auth).
    const sessionId = extractSessionId(request);
    if (sessionId) {
      const session = sessionStore.getBySessionId(sessionId);
      if (session) {
        (request as FastifyRequest & { auth: AuthContext }).auth = {
          userId: session.userId,
          sessionId: session.sessionId,
          providerId: session.providerId,
          authenticated: true,
        };
        return;
      }
    }

    const cookieUserId = request.authenticatedUserId?.trim() || resolveSignedAuthCookieUserId(request, AUTH_SESSION_COOKIE_NAME);
    if (cookieUserId) {
      const session = sessionStore.getByUserId(cookieUserId);
      if (session) {
        request.authenticatedUserId = session.userId;
        (request as FastifyRequest & { auth: AuthContext }).auth = {
          userId: session.userId,
          sessionId: session.sessionId,
          providerId: session.providerId,
          authenticated: true,
        };
      }
    }

    // No valid session — request.auth stays null.
  });
}
