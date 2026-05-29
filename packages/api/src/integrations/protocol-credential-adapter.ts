/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ProtocolCredentialResult, AuthSessionInfo } from '@openjiuwen/relay-api-server-contracts/auth';
import type { AuthModule } from '../auth/module.js';
import { authSessionStore } from '../auth/session-store.js';

export type ProtocolCredentialLookup = (protocol: string, userId: string) => ProtocolCredentialResult | null;

let lookup: ProtocolCredentialLookup | undefined;

export function initProtocolCredentialAdapter(authModule: AuthModule): void {
  lookup = (protocol, userId) => {
    const record = authSessionStore.getByUserId(userId);
    if (!record) return null;
    const session: AuthSessionInfo = {
      sessionId: record.sessionId,
      userId: record.userId,
      providerId: record.providerId,
      providerState: record.providerState,
      expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
    };
    return authModule.getActiveProvider().resolveProtocolCredential?.(protocol, session) ?? null;
  };
}

export function setProtocolCredentialLookup(fn: ProtocolCredentialLookup | undefined): void {
  lookup = fn;
}

export function resolveProtocolCredential(protocol: string, userId: string): ProtocolCredentialResult | null {
  if (!lookup) return null;
  return lookup(protocol, userId);
}
