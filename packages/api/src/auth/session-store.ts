/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { randomUUID } from 'node:crypto';
import type { ExternalPrincipal } from '@openjiuwen/relay-api-server-contracts/auth';
import type { AuthSessionRecord } from './types.js';

export class InMemoryAuthSessionStore {
  private readonly bySessionId = new Map<string, AuthSessionRecord>();
  private readonly byUserId = new Map<string, AuthSessionRecord>();

  create(providerId: string, principal: ExternalPrincipal): AuthSessionRecord {
    // Clean up any existing session for this user (prevents session leak)
    const existing = this.byUserId.get(principal.userId);
    if (existing) {
      this.bySessionId.delete(existing.sessionId);
      this.byUserId.delete(existing.userId);
    }

    const record: AuthSessionRecord = {
      sessionId: randomUUID(),
      providerId,
      userId: principal.userId,
      displayName: principal.displayName,
      createdAt: new Date().toISOString(),
      expiresAt: principal.expiresAt?.toISOString() ?? null,
      providerState: principal.providerState,
    };
    this.bySessionId.set(record.sessionId, record);
    this.byUserId.set(record.userId, record);
    return record;
  }

  getBySessionId(sessionId: string): AuthSessionRecord | null {
    const record = this.bySessionId.get(sessionId) ?? null;
    if (record && this.isExpired(record)) {
      this.deleteRecord(record);
      return null;
    }
    return record;
  }

  getByUserId(userId: string): AuthSessionRecord | null {
    const record = this.byUserId.get(userId) ?? null;
    if (record && this.isExpired(record)) {
      this.deleteRecord(record);
      return null;
    }
    return record;
  }

  deleteByUserId(userId: string): AuthSessionRecord | null {
    const record = this.byUserId.get(userId) ?? null;
    if (record) this.deleteRecord(record);
    return record;
  }

  deleteBySessionId(sessionId: string): AuthSessionRecord | null {
    const record = this.bySessionId.get(sessionId) ?? null;
    if (record) this.deleteRecord(record);
    return record;
  }

  clear(): void {
    this.bySessionId.clear();
    this.byUserId.clear();
  }

  /** Expose the userId map for backward-compat reads (e.g. huawei-maas). */
  get sessionsByUserId(): ReadonlyMap<string, AuthSessionRecord> {
    return this.byUserId;
  }

  private deleteRecord(record: AuthSessionRecord): void {
    this.bySessionId.delete(record.sessionId);
    this.byUserId.delete(record.userId);
  }

  private isExpired(record: AuthSessionRecord): boolean {
    if (!record.expiresAt) return false;
    return new Date(record.expiresAt).getTime() <= Date.now();
  }
}

export const authSessionStore = new InMemoryAuthSessionStore();
