/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type PersistedDebugConfig = {
  enabled: true;
  size: number;
  ttlMs: number;
  expiresAt: number;
};

export type DebugStorageKind = 'local' | 'session';

export type DebugStorageEntry = {
  kind: DebugStorageKind;
  storage: Partial<Storage>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBooleanString(input: string): boolean | null {
  if (input === '1' || input === 'true') return true;
  if (input === '0' || input === 'false') return false;
  return null;
}

function getReadableStorages(): Array<DebugStorageEntry> | null {
  if (typeof window === 'undefined') return null;
  const stores: Array<DebugStorageEntry> = [];
  try {
    const local = window.localStorage as Partial<Storage> | undefined;
    if (local && typeof local.getItem === 'function') stores.push({ kind: 'local', storage: local });
  } catch {
    // localStorage can throw SecurityError in restricted contexts.
  }
  try {
    const session = window.sessionStorage as Partial<Storage> | undefined;
    if (session && typeof session.getItem === 'function') stores.push({ kind: 'session', storage: session });
  } catch {
    // sessionStorage can throw SecurityError in restricted contexts.
  }
  return stores.length > 0 ? stores : null;
}

function getWritableStorages(): Record<DebugStorageKind, Partial<Storage> | null> | null {
  if (typeof window === 'undefined') return null;
  let localStore: Partial<Storage> | null = null;
  let sessionStore: Partial<Storage> | null = null;
  try {
    const local = window.localStorage as Partial<Storage> | undefined;
    if (local && typeof local.setItem === 'function') localStore = local;
  } catch {
    // Ignore inaccessible localStorage.
  }
  try {
    const session = window.sessionStorage as Partial<Storage> | undefined;
    if (session && typeof session.setItem === 'function') sessionStore = session;
  } catch {
    // Ignore inaccessible sessionStorage.
  }
  if (!localStore && !sessionStore) return null;
  return { local: localStore, session: sessionStore };
}

export function getDebugStorages() {
  return getReadableStorages();
}

export function safeReadStorage(storage: Partial<Storage>, key: string): string | null {
  try {
    return storage.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

export function clearStorageKey(storage: Partial<Storage>, key: string) {
  try {
    storage.removeItem?.(key);
  } catch {
    // Ignore storage removal failures.
  }
}

export function clearPersistedDebugFlag(storageKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem?.(storageKey);
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
  try {
    window.sessionStorage?.removeItem?.(storageKey);
  } catch {
    // Ignore storage access errors in restricted contexts.
  }
}

export function persistDebugConfig(
  storageKey: string,
  config: PersistedDebugConfig,
  scope: DebugStorageKind | 'auto' = 'auto',
) {
  const storages = getWritableStorages();
  if (!storages) return;

  const payload = JSON.stringify(config);
  const tryWrite = (storage: Partial<Storage> | null): boolean => {
    if (!storage) return false;
    try {
      storage.setItem?.(storageKey, payload);
      return true;
    } catch {
      return false;
    }
  };

  if (scope === 'session') {
    tryWrite(storages.session);
    return;
  }

  if (scope === 'local') {
    if (tryWrite(storages.local)) return;
    tryWrite(storages.session);
    return;
  }

  if (tryWrite(storages.local)) return;
  tryWrite(storages.session);
}
