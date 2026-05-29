/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyRequest } from 'fastify';

const WHITELISTED_EXACT_PATHS = new Set(['/api/islogin', '/api/login', '/api/logout', '/api/curversion', '/health']);

function getPathname(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] || '/';
  }
}

export function isAuthWhitelisted(url: string): boolean {
  const pathname = getPathname(url);
  return WHITELISTED_EXACT_PATHS.has(pathname) || pathname.startsWith('/api/login/');
}

export function isCallbackAuthBypassRoute(url: string): boolean {
  const pathname = getPathname(url);
  return (
    pathname.startsWith('/api/callbacks/') || pathname.startsWith('/api/callback/') || pathname.startsWith('/api/limb/')
  );
}

const MCP_SESSION_CHAIN_PATTERNS = [
  /^\/api\/threads\/[^/]+\/sessions$/,
  /^\/api\/threads\/[^/]+\/sessions\/search$/,
  /^\/api\/sessions\/[^/]+\/events$/,
  /^\/api\/sessions\/[^/]+\/digest$/,
  /^\/api\/sessions\/[^/]+\/invocations\/[^/]+$/,
];

export function isMcpInternalRoute(request: FastifyRequest): boolean {
  const method = request.method.toUpperCase();
  const pathname = getPathname(request.url);

  if (method === 'GET' && pathname.startsWith('/api/evidence/')) return true;
  if (method === 'POST' && pathname === '/api/reflect') return true;
  if (method === 'GET' && MCP_SESSION_CHAIN_PATTERNS.some((re) => re.test(pathname))) return true;

  return false;
}

export function isSharedSchedulerMachineAuthRoute(request: FastifyRequest): boolean {
  const method = request.method.toUpperCase();
  const pathname = getPathname(request.url);

  if (method === 'GET' && (pathname === '/api/schedule/tasks' || pathname === '/api/schedule/templates')) return true;
  if (method === 'POST' && (pathname === '/api/schedule/tasks' || pathname === '/api/schedule/tasks/preview')) {
    return true;
  }
  if ((method === 'PATCH' || method === 'DELETE') && /^\/api\/schedule\/tasks\/[^/]+$/.test(pathname)) return true;

  return false;
}
