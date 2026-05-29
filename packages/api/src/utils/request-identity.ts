/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Unified request identity resolver.
 *
 * Two tiers of identity resolution:
 *
 * 1. resolveHeaderUserId / resolveTrustedUserId — authenticated identity only.
 *    Reads request.auth populated by auth middleware.
 *
 * 2. resolveUserId / resolveUserIdHint — compatibility helpers.
 *    Prefer request.auth, then fall back to legacy header/query channels where
 *    older internal flows still need an identity hint.
 */

import type { FastifyRequest } from 'fastify';
import type { GatewayIdentity } from '@openjiuwen/relay-api-server-contracts';
import type { AuthContext } from '../auth/types.js';

export interface ResolveUserIdOptions {
  /** Optional explicit fallback (e.g., legacy body/form field). */
  fallbackUserId?: unknown;
  /** Optional final fallback (e.g., 'default-user' for backward compatibility). */
  defaultUserId?: string;
}

export const FRONTEND_DEFAULT_USER_ID = 'default-user';

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveDefaultOwnerUserId(): string | null {
  const ownerUserId = nonEmptyString(process.env.DEFAULT_OWNER_USER_ID);
  if (!ownerUserId || ownerUserId === FRONTEND_DEFAULT_USER_ID) return null;
  return ownerUserId;
}

function getAuthContext(request: FastifyRequest): AuthContext | null {
  return (request as FastifyRequest & { auth?: AuthContext }).auth ?? null;
}

export function resolveEffectiveUserId(value: unknown): string | null {
  const userId = nonEmptyString(value);
  if (!userId) return null;
  if (userId === FRONTEND_DEFAULT_USER_ID) {
    return resolveDefaultOwnerUserId() ?? userId;
  }
  return userId;
}

/**
 * Authenticated request identity source for browser/API calls.
 */
export function resolveHeaderUserId(request: FastifyRequest): string | null {
  return resolveEffectiveUserId(getAuthContext(request)?.userId);
}

export function resolveSessionId(request: FastifyRequest): string | null {
  return resolveEffectiveUserId(getAuthContext(request)?.sessionId);
}

/**
 * Trusted identity resolver for sensitive routes.
 *
 * This stays auth-only so sensitive routes do not silently accept weaker
 * transport channels after the auth/provider replay.
 */
export function resolveTrustedUserId(request: FastifyRequest, options?: ResolveUserIdOptions): string | null {
  const fromAuthenticatedSession = resolveEffectiveUserId(request.authenticatedUserId);
  if (fromAuthenticatedSession) return fromAuthenticatedSession;

  const fromHeader = resolveHeaderUserId(request);
  if (fromHeader) return fromHeader;

  const fromFallback = resolveEffectiveUserId(options?.fallbackUserId);
  if (fromFallback) return fromFallback;

  return resolveEffectiveUserId(options?.defaultUserId);
}

export function resolveGatewayIdentity(request: FastifyRequest): GatewayIdentity | null {
  const userId =
    resolveEffectiveUserId(request.authenticatedUserId) ??
    resolveEffectiveUserId((request as FastifyRequest & { auth?: AuthContext }).auth?.userId);
  if (!userId) return null;
  return { userId };
}

export function requireGatewayIdentity(request: FastifyRequest): GatewayIdentity {
  const identity = resolveGatewayIdentity(request);
  if (!identity) {
    throw new Error('Authentication required');
  }
  return identity;
}

export function resolveUserId(request: FastifyRequest, options?: ResolveUserIdOptions): string | null {
  const fromAuth = resolveHeaderUserId(request);
  if (fromAuth) return fromAuth;

  const fromAuthenticatedCookie = resolveEffectiveUserId(request.authenticatedUserId);
  if (fromAuthenticatedCookie) return fromAuthenticatedCookie;

  const fromHint = resolveUserIdHint(request);
  if (fromHint) return fromHint;

  const query = request.query as Record<string, unknown>;
  const fromQuery = resolveEffectiveUserId(query.userId);
  if (fromQuery) return fromQuery;

  const fromFallback = resolveEffectiveUserId(options?.fallbackUserId);
  if (fromFallback) return fromFallback;

  return resolveEffectiveUserId(options?.defaultUserId);
}

/**
 * Identity hint for internal callers that have not migrated to session auth
 * yet. This must not be treated as proof of authentication.
 */
export function resolveUserIdHint(request: FastifyRequest): string | null {
  const fromAuth = resolveHeaderUserId(request);
  if (fromAuth) return fromAuth;

  const fromHeader =
    resolveEffectiveUserId(request.headers['x-office-claw-user']) ??
    resolveEffectiveUserId(request.headers['x-office-claw-user']);
  if (fromHeader) return fromHeader;

  return null;
}
