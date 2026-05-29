/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authentication Routes — unified auth lifecycle endpoints.
 *
 * These routes are the thin orchestration layer between:
 * - AuthProvider (plugin-api contract)
 * - SessionStore (platform-owned)
 * - AuthMiddleware (platform-owned)
 */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthProvider, AuthSessionInfo } from '@openjiuwen/relay-api-server-contracts/auth';
import { createAuthModule, type AuthModule } from '../auth/module.js';
import type { AuthSessionRecord } from '../auth/types.js';
import { authSessionStore, InMemoryAuthSessionStore } from '../auth/session-store.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';
import { AUTH_SESSION_COOKIE_NAME } from './global-auth.js';

export interface AuthRoutesOptions {
  authModule?: AuthModule;
  sessionStore?: InMemoryAuthSessionStore;
  fetchImpl?: typeof fetch;
  /** Platform-level hook called after login completes. Provider-specific post-processing belongs here. */
  onPostLogin?: (request: FastifyRequest, session: AuthSessionRecord) => Promise<void>;
}

/** Backward-compat alias — exposes session lookup by userId for legacy consumers. */
export const sessions = authSessionStore.sessionsByUserId;

function serializePresentation(provider: AuthProvider) {
  return {
    id: provider.id,
    displayName: provider.displayName,
    mode: provider.presentation.mode,
    fields: provider.presentation.fields,
    ...(provider.presentation.redirectUrl ? { redirectUrl: provider.presentation.redirectUrl } : {}),
    ...(provider.presentation.submitLabel ? { submitLabel: provider.presentation.submitLabel } : {}),
    ...(provider.presentation.description ? { description: provider.presentation.description } : {}),
  };
}

async function buildPublicStatus(provider: AuthProvider) {
  const config = (await provider.getPublicConfig?.()) ?? {};
  return {
    ...(config.hascode !== undefined ? { hascode: config.hascode } : { hascode: true }),
    ...(config.canCreateModel !== undefined ? { canCreateModel: Boolean(config.canCreateModel) } : {}),
    ...(typeof config.loginUrl === 'string' && config.loginUrl.trim() ? { loginUrl: config.loginUrl.trim() } : {}),
    ...(typeof config.logoutUrl === 'string' && config.logoutUrl.trim() ? { logoutUrl: config.logoutUrl.trim() } : {}),
    ...(typeof config.pendingInvitation === 'boolean' ? { pendingInvitation: config.pendingInvitation } : {}),
    isskip: provider.presentation.mode === 'auto',
    provider: serializePresentation(provider),
  };
}

function setSignedSessionCookie(reply: FastifyReply, userId: string, expiresAt: Date | null): void {
  const setCookie = (reply as FastifyReply & {
    setCookie?: (name: string, value: string, options?: Record<string, unknown>) => FastifyReply;
  }).setCookie;
  if (!setCookie) return;

  setCookie.call(reply, AUTH_SESSION_COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    signed: true,
    ...(expiresAt ? { expires: expiresAt } : {}),
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  const clearCookie = (reply as FastifyReply & {
    clearCookie?: (name: string, options?: Record<string, unknown>) => FastifyReply;
  }).clearCookie;
  clearCookie?.call(reply, AUTH_SESSION_COOKIE_NAME, { path: '/' });
}

async function runPostLoginHooks(
  request: FastifyRequest,
  provider: AuthProvider,
  session: AuthSessionRecord,
  onPostLogin: AuthRoutesOptions['onPostLogin'],
): Promise<void> {
  if (provider.postLoginInit) {
    try {
      await provider.postLoginInit(toSessionInfo(session));
    } catch (error) {
      request.log.warn({ error, userId: session.userId }, 'postLoginInit failed (non-fatal)');
    }
  }

  if (onPostLogin) {
    try {
      await onPostLogin(request, session);
    } catch (error) {
      request.log.warn({ error, userId: session.userId }, 'onPostLogin hook failed (non-fatal)');
    }
  }
}

function toSessionInfo(record: { sessionId: string; userId: string; providerId: string; expiresAt: string | null; providerState?: unknown }): AuthSessionInfo {
  return {
    sessionId: record.sessionId,
    userId: record.userId,
    providerId: record.providerId,
    providerState: record.providerState,
    expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
  };
}

function toStringParams(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')]),
  );
}

function firstNonEmptyString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

async function resolveProviderLogoutUrl(provider: AuthProvider): Promise<string | undefined> {
  const config = (await provider.getPublicConfig?.()) ?? {};
  if (typeof config.logoutUrl !== 'string') return undefined;
  const normalized = config.logoutUrl.trim();
  return normalized.length > 0 ? normalized : undefined;
}

async function resolveCurrentSession(
  request: FastifyRequest,
  provider: AuthProvider,
  sessionStore: InMemoryAuthSessionStore,
) {
  // auto-mode providers (no-auth): authenticate automatically
  if (provider.presentation.mode === 'auto') {
    const result = await provider.authenticate({ credentials: {} });
    if (!result.success) return null;
    const existing = sessionStore.getByUserId(result.principal.userId);
    return existing ?? sessionStore.create(provider.id, result.principal);
  }

  // For form/redirect providers: check if user has an existing session
  const userId = request.authenticatedUserId?.trim() || resolveHeaderUserId(request);
  if (!userId) return null;

  const existing = sessionStore.getByUserId(userId);
  if (existing?.providerId === provider.id) return existing;

  // Try session restore (e.g., after server restart)
  const restored = await provider.restoreSession?.(userId);
  if (!restored) return null;
  return sessionStore.create(provider.id, restored);
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const authModule = opts.authModule ?? (await createAuthModule({ fetchImpl: opts.fetchImpl }));
  const sessionStore = opts.sessionStore ?? authSessionStore;
  const provider = authModule.getActiveProvider();

  // ── GET /api/islogin ─────────────────────────────────────────────
  app.get('/api/islogin', async (request, reply) => {
    const status = await buildPublicStatus(provider);
    const session = await resolveCurrentSession(request, provider, sessionStore);

    if (!session) {
      return { ...status, islogin: false, userId: null };
    }

    if (provider.presentation.mode === 'auto') {
      setSignedSessionCookie(reply, session.userId, null);
    }

    return { ...status, islogin: true, userId: session.userId ?? null, sessionId: session.sessionId };
  });

  // ── POST /api/login ──────────────────────────────────────────────
  app.post('/api/login', async (request, reply) => {
    const rawPayload = (request.body ?? {}) as Record<string, unknown>;

    // Wrap in AuthenticateInput format
    const result = await provider.authenticate({ credentials: rawPayload });
    if (!result.success) {
      return result;
    }

    const session = sessionStore.create(provider.id, result.principal);

    setSignedSessionCookie(reply, session.userId, result.principal.expiresAt);

    await runPostLoginHooks(request, provider, session, opts.onPostLogin);

    reply.header('X-Session-Id', session.sessionId);

    return {
      success: true,
      userId: session.userId,
      sessionId: session.sessionId,
      providerId: provider.id,
      message: '登录成功',
    };
  });

  // ── POST /api/login/callback ─────────────────────────────────────
  app.post('/api/login/callback', async (request, reply) => {
    if (!provider.handleCallback) {
      return reply.code(404).send({ message: 'Provider does not support callback flow' });
    }

    const params = (request.body ?? {}) as Record<string, unknown>;
    const callbackParams = toStringParams(params);
    const result = await provider.handleCallback(callbackParams);
    if (!result.success) {
      return result;
    }

    const session = sessionStore.create(provider.id, result.principal);
    setSignedSessionCookie(reply, session.userId, result.principal.expiresAt);
    await runPostLoginHooks(request, provider, session, opts.onPostLogin);
    reply.header('X-Session-Id', session.sessionId);

    const response: Record<string, unknown> = {
      success: true,
      userId: session.userId,
      sessionId: session.sessionId,
      providerId: provider.id,
    };
    if (result.principal.displayName) response.userName = result.principal.displayName;
    return response;
  });

  // ── POST /api/login/invitation ───────────────────────────────────
  app.post('/api/login/invitation', async (request, reply) => {
    if (!provider.handleCallback) {
      return reply.code(404).send({ message: 'Provider does not support callback flow' });
    }

    const params = (request.body ?? {}) as Record<string, unknown>;
    const pendingToken = firstNonEmptyString(params.pendingToken);
    const promotionCode = firstNonEmptyString(params.promotionCode, params.code, params.inviteCode);

    if (!promotionCode) {
      return reply.code(400).send({ success: false, needCode: true, message: '请输入邀请码' });
    }

    if (!pendingToken) {
      return reply.code(401).send({ success: false, needCode: true, message: '缺少登录状态，请重新登录' });
    }

    const callbackParams = toStringParams({ ...params, pendingToken, promotionCode });
    const result = await provider.handleCallback(callbackParams);
    if (!result.success) {
      return reply.code(result.needCode ? 400 : 401).send(result);
    }

    const session = sessionStore.create(provider.id, result.principal);
    setSignedSessionCookie(reply, session.userId, result.principal.expiresAt);
    await runPostLoginHooks(request, provider, session, opts.onPostLogin);
    reply.header('X-Session-Id', session.sessionId);

    const response: Record<string, unknown> = {
      success: true,
      userId: session.userId,
      sessionId: session.sessionId,
      providerId: provider.id,
      message: '登录成功',
      redirectTo: '/',
    };
    if (result.principal.displayName) response.userName = result.principal.displayName;
    return response;
  });

  // ── POST /api/logout ─────────────────────────────────────────────
  app.post('/api/logout', async (request, reply) => {
    const providerLogoutUrl = await resolveProviderLogoutUrl(provider);

    // Session identity only — no body.userId fallback (SessionAuthority is sole truth source)
    const userId = request.authenticatedUserId?.trim() || resolveHeaderUserId(request);

    if (!userId) {
      clearSessionCookie(reply);
      return {
        success: true,
        message: '退出登录成功',
        ...(providerLogoutUrl ? { logoutUrl: providerLogoutUrl } : {}),
      };
    }

    const session = sessionStore.deleteByUserId(userId);
    if (session && provider.logout) {
      try {
        await provider.logout(toSessionInfo(session));
      } catch (error) {
        // Log but don't fail the logout response
        console.warn('Provider logout hook failed:', error);
      }
    }

    clearSessionCookie(reply);

    return {
      success: true,
      message: '退出登录成功',
      ...(providerLogoutUrl ? { logoutUrl: providerLogoutUrl } : {}),
    };
  });
};

/**
 * Verify that a userId has an active session (used by global-auth hook and scheduler).
 * Returns true when skip-auth is enabled (OFFICE_CLAW_SKIP_AUTH=1).
 */
export function verifyPrimaryUserId(userId: string): boolean {
  const normalized = userId.trim();
  if (!normalized) return false;
  if (process.env.OFFICE_CLAW_SKIP_AUTH === '1' || process.env.CAT_CAFE_SKIP_AUTH === '1') return true;
  return authSessionStore.getByUserId(normalized) !== null;
}
