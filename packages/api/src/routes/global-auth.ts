/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getPassword, setPassword } from 'cross-keychain';
import envPaths from 'env-paths';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { extractRequestOrigin, isOriginAllowed } from '../config/frontend-origin.js';
import { resolveEffectiveUserId } from '../utils/request-identity.js';
import {
  isAuthWhitelisted,
  isCallbackAuthBypassRoute,
  isMcpInternalRoute,
  isSharedSchedulerMachineAuthRoute,
} from './auth-policy.js';

export const AUTH_SESSION_COOKIE_NAME = 'oc_sid';

const AUTH_COOKIE_KEYCHAIN_SERVICE = 'office-claw';
const AUTH_COOKIE_KEYCHAIN_ACCOUNT = 'auth-cookie-session-secret';
const AUTH_COOKIE_SECRET_FILE_NAME = 'auth-cookie-session-secret';
const SECURE_CONFIG_PROJECT_NAME = 'secure-config';
const SECURE_CONFIG_PROJECT_SUFFIX = 'nodejs';

let cachedDefaultAuthCookieSecret: string | null = null;

export interface GlobalAuthHookOptions {
  verifyPrimaryUserId: (userId: string) => boolean;
  resolveBearerUserId?: (request: FastifyRequest) => string | null;
  tryRenewSession?: (userId: string) => Date | null;
  isSkipAuthEnabled?: () => boolean;
  cookieName?: string;
  allowedBrowserOrigins?: readonly (string | RegExp)[];
}

export interface AuthCookieSecretStore {
  read: () => Promise<string | null>;
  write: (secret: string) => Promise<void>;
}

export interface ResolveAuthCookieSecretOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  persistentStore?: AuthCookieSecretStore;
}

type CookieAwareRequest = FastifyRequest & {
  cookies?: Record<string, string | undefined>;
  unsignCookie?: (value: string) => { valid: true; value: string } | { valid: false; value: null };
};

function isEnvFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function isGlobalAuthSkipEnabled(): boolean {
  return isEnvFlagEnabled(process.env.CAT_CAFE_SKIP_AUTH) || isEnvFlagEnabled(process.env.OFFICE_CLAW_SKIP_AUTH);
}

function normalizeSecret(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveEnvAuthCookieSecret(env: ResolveAuthCookieSecretOptions['env']): string | null {
  return (
    normalizeSecret(env?.OFFICE_CLAW_SESSION_SECRET) ||
    normalizeSecret(env?.CAT_CAFE_SESSION_SECRET) ||
    normalizeSecret(env?.OFFICE_CLAW_COOKIE_SECRET) ||
    normalizeSecret(env?.CAT_CAFE_COOKIE_SECRET)
  );
}

function getDefaultAuthCookieSecretFilePath(): string {
  const paths = envPaths(SECURE_CONFIG_PROJECT_NAME, { suffix: SECURE_CONFIG_PROJECT_SUFFIX });
  return join(paths.config, AUTH_COOKIE_SECRET_FILE_NAME);
}

export function createAuthCookieSecretFileStore(
  filePath = getDefaultAuthCookieSecretFilePath(),
): AuthCookieSecretStore {
  return {
    async read() {
      try {
        return normalizeSecret(readFileSync(filePath, 'utf8'));
      } catch {
        return null;
      }
    },
    async write(secret: string) {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, secret, { encoding: 'utf8', mode: 0o600 });
      try {
        chmodSync(filePath, 0o600);
      } catch {
        // Windows does not support POSIX file modes; rely on the user profile ACL.
      }
    },
  };
}

function createDefaultAuthCookieSecretStore(): AuthCookieSecretStore {
  const fileStore = createAuthCookieSecretFileStore();
  return {
    async read() {
      try {
        const keychainSecret = normalizeSecret(
          await getPassword(AUTH_COOKIE_KEYCHAIN_SERVICE, AUTH_COOKIE_KEYCHAIN_ACCOUNT),
        );
        if (keychainSecret) return keychainSecret;
      } catch {
        // Headless server environments may not expose an OS keychain.
      }
      return fileStore.read();
    },
    async write(secret: string) {
      try {
        await setPassword(AUTH_COOKIE_KEYCHAIN_SERVICE, AUTH_COOKIE_KEYCHAIN_ACCOUNT, secret);
        return;
      } catch {
        // Fall back to the per-user app config directory when the OS keychain is unavailable.
      }
      await fileStore.write(secret);
    },
  };
}

export async function resolveAuthCookieSecret(options: ResolveAuthCookieSecretOptions = {}): Promise<string> {
  const envSecret = resolveEnvAuthCookieSecret(options.env ?? process.env);
  if (envSecret) return envSecret;

  const usesDefaultStore = !options.persistentStore;
  if (usesDefaultStore && cachedDefaultAuthCookieSecret) return cachedDefaultAuthCookieSecret;

  const store = options.persistentStore ?? createDefaultAuthCookieSecretStore();
  const storedSecret = normalizeSecret(await store.read());
  if (storedSecret) {
    if (usesDefaultStore) cachedDefaultAuthCookieSecret = storedSecret;
    return storedSecret;
  }

  const generatedSecret = randomBytes(32).toString('hex');
  await store.write(generatedSecret);
  if (usesDefaultStore) cachedDefaultAuthCookieSecret = generatedSecret;
  return generatedSecret;
}

export function resolveSignedAuthCookieUserId(
  request: FastifyRequest,
  cookieName = AUTH_SESSION_COOKIE_NAME,
): string | null {
  const cookieRequest = request as CookieAwareRequest;
  const rawCookie = cookieRequest.cookies?.[cookieName];
  if (!rawCookie || !cookieRequest.unsignCookie) return null;

  const unsigned = cookieRequest.unsignCookie(rawCookie);
  if (!unsigned.valid) return null;

  const userId = unsigned.value.trim();
  return userId.length > 0 ? userId : null;
}

function resolveDeclaredBrowserUserId(request: FastifyRequest): string | null {
  return resolveEffectiveUserId(request.headers['x-office-claw-user']);
}

function sendAuthError(reply: FastifyReply, statusCode: 401 | 403, error: string): void {
  reply.status(statusCode).send({ error, statusCode });
}

function refreshAuthSessionCookie(reply: FastifyReply, cookieName: string, userId: string, expires: Date): void {
  const setCookie = (
    reply as FastifyReply & {
      setCookie?: (name: string, value: string, options?: Record<string, unknown>) => FastifyReply;
    }
  ).setCookie;
  if (!setCookie) return;
  setCookie.call(reply, cookieName, userId, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    signed: true,
    expires,
  });
}

export function registerGlobalAuthHook(app: FastifyInstance, options: GlobalAuthHookOptions): void {
  const cookieName = options.cookieName ?? AUTH_SESSION_COOKIE_NAME;
  if (!app.hasRequestDecorator('authenticatedUserId')) {
    app.decorateRequest('authenticatedUserId', null);
  }

  app.addHook('onRequest', async (request, reply) => {
    if (options.isSkipAuthEnabled?.() ?? isGlobalAuthSkipEnabled()) return;
    if (isAuthWhitelisted(request.url) || isCallbackAuthBypassRoute(request.url) || isMcpInternalRoute(request)) {
      return;
    }

    const sessionUserId = resolveSignedAuthCookieUserId(request, cookieName);
    if (!sessionUserId) {
      const bearerUserId = options.resolveBearerUserId?.(request);
      if (bearerUserId) {
        const headerUserId = resolveDeclaredBrowserUserId(request);
        if (headerUserId && headerUserId !== bearerUserId) {
          sendAuthError(reply, 403, 'Browser identity header does not match authenticated session');
          return;
        }
        request.authenticatedUserId = bearerUserId;
        return;
      }
      if (isSharedSchedulerMachineAuthRoute(request)) return;
      sendAuthError(reply, 401, 'Authentication required');
      return;
    }

    if (!options.verifyPrimaryUserId(sessionUserId)) {
      sendAuthError(reply, 401, 'Invalid or expired browser session');
      return;
    }

    const headerUserId = resolveDeclaredBrowserUserId(request);
    if (headerUserId && headerUserId !== sessionUserId) {
      sendAuthError(reply, 403, 'Browser identity header does not match authenticated session');
      return;
    }

    request.authenticatedUserId = sessionUserId;

    const method = request.method.toUpperCase();
    if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
      const browserOrigins = options.allowedBrowserOrigins ?? [];
      const origin = extractRequestOrigin(request.headers as Record<string, unknown>);
      const secFetchSite =
        typeof request.headers['sec-fetch-site'] === 'string' ? request.headers['sec-fetch-site'] : '';

      if (origin && !isOriginAllowed(origin, browserOrigins)) {
        sendAuthError(reply, 403, 'Origin not allowed');
        return;
      }
      if (secFetchSite.toLowerCase() === 'cross-site' && !origin) {
        sendAuthError(reply, 403, 'Cross-site browser request not allowed');
        return;
      }
    }

    if (options.tryRenewSession) {
      const renewedExpiry = options.tryRenewSession(sessionUserId);
      if (renewedExpiry) {
        refreshAuthSessionCookie(reply, cookieName, sessionUserId, renewedExpiry);
      }
    }
  });
}
