/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { FastifyRequest } from 'fastify';
import type { InvocationRecord, InvocationRegistry } from '../domains/agents/services/agents/invocation/InvocationRegistry.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';

export type ScheduleCallerKind = 'browser' | 'callback';

export type ScheduleCaller =
  | { kind: 'browser'; userId: string }
  | { kind: 'callback'; record: InvocationRecord };

export type BrowserUserVerifier = (userId: string) => boolean;

export interface ScheduleAuthError {
  statusCode: number;
  error: string;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function resolveScheduleCallbackCredentials(
  request: FastifyRequest,
): { invocationId?: string; callbackToken?: string } {
  const body =
    request.body && typeof request.body === 'object' && !Array.isArray(request.body)
      ? (request.body as Record<string, unknown>)
      : undefined;
  const query =
    request.query && typeof request.query === 'object' && !Array.isArray(request.query)
      ? (request.query as Record<string, unknown>)
      : undefined;

  return {
    invocationId:
      pickString(body?.['invocationId']) ??
      pickString(query?.['invocationId']) ??
      pickString(request.headers['x-invocation-id']),
    callbackToken:
      pickString(body?.['callbackToken']) ??
      pickString(query?.['callbackToken']) ??
      pickString(request.headers['x-callback-token']),
  };
}

export function resolveInvocationRecord(
  request: FastifyRequest,
  registry?: InvocationRegistry,
): { record: InvocationRecord | null; hadCredentials: boolean } {
  if (!registry) return { record: null, hadCredentials: false };
  const { invocationId, callbackToken } = resolveScheduleCallbackCredentials(request);
  const hadCredentials = Boolean(invocationId || callbackToken);
  if (!invocationId || !callbackToken) return { record: null, hadCredentials };
  return { record: registry.verify(invocationId, callbackToken), hadCredentials: true };
}

export function resolveScheduleCaller(
  request: FastifyRequest,
  options: {
    allowedKinds: ScheduleCallerKind[];
    registry?: InvocationRegistry;
    browserUserVerifier?: BrowserUserVerifier;
  },
): { caller: ScheduleCaller | null; error: ScheduleAuthError | null } {
  const declaredBrowserUserId = resolveHeaderUserId(request);
  const browserUserId =
    declaredBrowserUserId && options.browserUserVerifier?.(declaredBrowserUserId) ? declaredBrowserUserId : null;
  const { record, hadCredentials } = resolveInvocationRecord(request, options.registry);

  if (hadCredentials && !record) {
    return {
      caller: null,
      error: { statusCode: 401, error: 'Invalid or expired callback credentials' },
    };
  }

  if (declaredBrowserUserId && !browserUserId) {
    return {
      caller: null,
      error: { statusCode: 401, error: 'Invalid or expired browser session' },
    };
  }

  if (browserUserId && record && browserUserId !== record.userId) {
    return {
      caller: null,
      error: { statusCode: 403, error: 'Browser and callback identities do not match' },
    };
  }

  if (record) {
    if (!options.allowedKinds.includes('callback')) {
      return {
        caller: null,
        error: { statusCode: 403, error: 'Callback caller is not allowed on this route' },
      };
    }
    return { caller: { kind: 'callback', record }, error: null };
  }

  if (browserUserId) {
    if (!options.allowedKinds.includes('browser')) {
      return {
        caller: null,
        error: { statusCode: 403, error: 'Browser caller is not allowed on this route' },
      };
    }
    return { caller: { kind: 'browser', userId: browserUserId }, error: null };
  }

  return {
    caller: null,
    error: { statusCode: 401, error: 'Authentication required' },
  };
}
