/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Unified API client for OfficeClaw frontend.
 *
 * - Uses NEXT_PUBLIC_API_URL / VITE_API_URL (via import.meta.env) when set
 * - Auto-injects X-Office-Claw-User identity header on every request
 * - Configurable request timeout (default: 1 hour to match backend CLI timeout)
 */

import { readBuildEnv, readPublicEnv } from './client-env';
import { getUserId } from './userId';

/** Default API request timeout: 1 hour (matching backend CLI_TIMEOUT_MS) */
const DEFAULT_API_TIMEOUT_MS = 60 * 60 * 1000;

function getBrowserLocation(): Location | null {
  if (typeof globalThis !== 'object' || globalThis === null) return null;
  const candidate = (globalThis as { location?: Location }).location;
  return candidate ?? null;
}

function isLoopbackHost(hostname: string | undefined): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

const PROD_TUNNEL_API_URL = readPublicEnv('NEXT_PUBLIC_PROD_API_URL') ?? '';
const PROD_TUNNEL_FRONTEND_HOST = readPublicEnv('NEXT_PUBLIC_PROD_FRONTEND_HOST') ?? '';
/** Cloud / tunnel API origin (Vite: `API_CLOWDER_HOST` in env; name retained for compatibility). */
const OFFICE_CLAW_CLOUD_API_HOST = readBuildEnv('API_CLOWDER_HOST');
const DEFAULT_API_CLIENT_URL = readBuildEnv('DEFAULT_API_CLIENT_URL');

function resolveApiUrl(): string {
  const location = getBrowserLocation();

  // Cloudflare Tunnel: API 与前端分域名时，Access cookie 在共享父域上生效
  if (location?.hostname === PROD_TUNNEL_FRONTEND_HOST) {
    return OFFICE_CLAW_CLOUD_API_HOST;
  }
  if (isLoopbackHost(location?.hostname)) {
    const frontendPort = Number(location?.port ?? '') || 3003;
    const apiPort = frontendPort + 1;
    const protocol = location?.protocol ?? 'http:';
    const hostname = location?.hostname ?? '127.0.0.1';
    return `${protocol}//${hostname}:${apiPort}`;
  }
  const explicitPublic = readPublicEnv('NEXT_PUBLIC_API_URL') || readPublicEnv('VITE_API_URL');
  if (explicitPublic) return explicitPublic.replace(/\/+$/, '');
  if (typeof window === 'undefined') return DEFAULT_API_CLIENT_URL;
  // Derive API port from frontend port: convention is frontend + 1 = API
  // (runtime: 3001→3002, alpha: 3011→3012). Fallback to +1 of current port.
  const frontendPort = Number(location?.port ?? '') || 3001;
  const apiPort = frontendPort + 1;
  const protocol = location?.protocol ?? 'http:';
  const hostname = location?.hostname ?? 'localhost';
  return `${protocol}//${hostname}:${apiPort}`;
}
export const API_URL = resolveApiUrl();

export interface ApiFetchOptions extends RequestInit {
  /** Custom timeout in milliseconds (default: 1 hour) */
  timeoutMs?: number;
  /** @deprecated packages/web no longer owns login redirects; callers handle 401 locally. */
  suppressAuthRedirect?: boolean;
}

function resolveRequestCredentials(explicitCredentials?: RequestCredentials): RequestCredentials {
  if (explicitCredentials) return explicitCredentials;

  const location = getBrowserLocation();
  if (!location) {
    return API_URL.includes(PROD_TUNNEL_API_URL) ? 'include' : 'same-origin';
  }

  try {
    const apiOrigin = new URL(API_URL, location.href).origin;
    return apiOrigin === location.origin ? 'same-origin' : 'include';
  } catch {
    return API_URL.includes(PROD_TUNNEL_API_URL) ? 'include' : 'same-origin';
  }
}

/**
 * Fetch wrapper that injects identity header and supports timeout.
 * @param path - API path starting with '/' (e.g. '/api/messages')
 * @param init - Standard RequestInit options plus optional timeoutMs
 */
export async function apiFetch(path: string, init?: ApiFetchOptions): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('X-Office-Claw-User', getUserId());
  if (!headers.has('X-Trace-Id')) {
    headers.set('X-Trace-Id', crypto.randomUUID());
  }

  const timeoutMs = init?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  // Use AbortController for timeout support
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = init?.signal;
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', abortFromExternalSignal, { once: true });
    }
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      // Cookie auth requires credentials on cross-origin frontend→API hops
      credentials: resolveRequestCredentials(init?.credentials),
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}
