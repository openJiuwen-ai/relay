/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { OfficeClawStorageProvider } from '@openjiuwen/relay-api-server-contracts/storage';

const FACTORY_METHODS = [
  'createMessageStore',
  'createThreadStore',
  'createTaskStore',
  'createBacklogStore',
  'createMemoryStore',
  'createDraftStore',
  'createSessionChainStore',
  'createInvocationRecordStore',
  'createPendingRequestStore',
  'createAuthorizationRuleStore',
  'createAuthorizationAuditStore',
  'createPushSubscriptionStore',
  'createReadStateStore',
  'createWorkflowSopStore',
] as const;

const OPTIONAL_FACTORY_METHODS = ['createApprovalRecordStore'] as const;

export function isPartialStorageProvider(value: unknown): value is Record<string, unknown> & { id: string } {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.id !== 'string') return false;
  return (
    FACTORY_METHODS.some((m) => typeof rec[m] === 'function') ||
    OPTIONAL_FACTORY_METHODS.some((m) => typeof rec[m] === 'function')
  );
}

export function wrapPartialProvider(
  partial: Record<string, unknown> & { id: string },
  defaults: OfficeClawStorageProvider,
): OfficeClawStorageProvider {
  const wrapped: Record<string, unknown> = {
    id: partial.id,
    displayName: partial.displayName,
  };

  type AnyFn = (...args: never[]) => unknown;
  const bind = (fn: unknown, ctx: object) => (fn as AnyFn).bind(ctx);

  const fallbacks: string[] = [];
  for (const method of FACTORY_METHODS) {
    if (typeof partial[method] === 'function') {
      wrapped[method] = bind(partial[method], partial);
    } else {
      wrapped[method] = (...args: unknown[]) => (defaults[method] as (...a: unknown[]) => unknown)(...args);
      fallbacks.push(method);
    }
  }
  for (const method of OPTIONAL_FACTORY_METHODS) {
    if (typeof partial[method] === 'function') {
      wrapped[method] = bind(partial[method], partial);
    }
  }

  if (typeof partial.bootstrap === 'function') wrapped.bootstrap = bind(partial.bootstrap, partial);
  if (typeof partial.shutdown === 'function') wrapped.shutdown = bind(partial.shutdown, partial);

  if (fallbacks.length > 0) {
    const implemented = FACTORY_METHODS.length - fallbacks.length;
    console.log(
      `[storage] Provider '${partial.id}': ${implemented}/${FACTORY_METHODS.length} stores implemented, ` +
        `${fallbacks.length} falling back to '${defaults.id}' (${fallbacks.join(', ')})`,
    );
  }

  return wrapped as unknown as OfficeClawStorageProvider;
}
