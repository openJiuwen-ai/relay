/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Unified userId source for the frontend.
 * Priority: URL ?userId= > localStorage > 'default-user'
 *
 * Storage keys use `office-claw-*` with read-time fallback from legacy `cat-cafe-*` keys (F140 merge D1).
 */

const STORAGE_KEY = 'office-claw-userId';
const LEGACY_STORAGE_KEY = 'cat-cafe-userId';
const SKIP_AUTH_KEY = 'office-claw-isskip';
const LEGACY_SKIP_AUTH_KEY = 'cat-cafe-isskip';
const CAN_CREATE_MODEL_KEY = 'can-create-model';
const USER_NAME_KEY = 'office-claw-userName';
const LEGACY_USER_NAME_KEY = 'cat-cafe-userName';
const DEFAULT_USER = 'default-user';

function readStorage(primary: string, legacy: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(primary) ?? window.localStorage.getItem(legacy);
}

function writeStorage(primary: string, legacy: string, value: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(primary, value);
  try {
    window.localStorage.removeItem(legacy);
  } catch {
    /* ignore */
  }
}

function removeStoragePair(primary: string, legacy: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(primary);
    window.localStorage.removeItem(legacy);
  } catch {
    /* ignore */
  }
}

export function getUserId(): string {
  if (typeof window === 'undefined') return DEFAULT_USER;

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('userId');
  if (fromUrl) {
    writeStorage(STORAGE_KEY, LEGACY_STORAGE_KEY, fromUrl);
    return fromUrl;
  }

  const stored = readStorage(STORAGE_KEY, LEGACY_STORAGE_KEY);
  if (stored !== null && stored !== '') {
    if (window.localStorage.getItem(STORAGE_KEY) === null && window.localStorage.getItem(LEGACY_STORAGE_KEY) !== null) {
      writeStorage(STORAGE_KEY, LEGACY_STORAGE_KEY, stored);
    }
    return stored;
  }

  return DEFAULT_USER;
}

export function setUserId(id: string): void {
  writeStorage(STORAGE_KEY, LEGACY_STORAGE_KEY, id);
}

export function getUserName(): string {
  if (typeof window === 'undefined') return '';
  const stored = readStorage(USER_NAME_KEY, LEGACY_USER_NAME_KEY);
  if (stored) {
    if (window.localStorage.getItem(USER_NAME_KEY) === null && window.localStorage.getItem(LEGACY_USER_NAME_KEY) !== null) {
      writeStorage(USER_NAME_KEY, LEGACY_USER_NAME_KEY, stored);
    }
    return stored;
  }

  const userId = readStorage(STORAGE_KEY, LEGACY_STORAGE_KEY) ?? '';
  const parts = userId.split(':');
  return parts.length > 1 ? parts[1] || parts[0] : userId;
}

export function getDomainId(): string {
  const userId = getUserId();
  const separatorIndex = userId.indexOf(':');
  return separatorIndex > 0 ? userId.slice(0, separatorIndex) : '';
}

export function setUserName(name: string): void {
  if (typeof window === 'undefined') return;
  if (name.trim()) {
    writeStorage(USER_NAME_KEY, LEGACY_USER_NAME_KEY, name.trim());
  } else {
    removeStoragePair(USER_NAME_KEY, LEGACY_USER_NAME_KEY);
  }
}

export function setAuthIdentity({ userId, userName }: { userId: string; userName?: string }): void {
  setUserId(userId);
  if (typeof userName === 'string') {
    setUserName(userName);
  }
}

export function clearAuthIdentity(): void {
  removeStoragePair(STORAGE_KEY, LEGACY_STORAGE_KEY);
  removeStoragePair(USER_NAME_KEY, LEGACY_USER_NAME_KEY);
}

export function getIsSkipAuth(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = readStorage(SKIP_AUTH_KEY, LEGACY_SKIP_AUTH_KEY);
  if (raw === null) return false;
  if (window.localStorage.getItem(SKIP_AUTH_KEY) === null && window.localStorage.getItem(LEGACY_SKIP_AUTH_KEY) !== null) {
    writeStorage(SKIP_AUTH_KEY, LEGACY_SKIP_AUTH_KEY, raw);
  }
  return raw === '1' || raw === 'true';
}

export function setIsSkipAuth(value: boolean): void {
  writeStorage(SKIP_AUTH_KEY, LEGACY_SKIP_AUTH_KEY, value ? '1' : '0');
}

export function getCanCreateModel(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(CAN_CREATE_MODEL_KEY);
  return raw === '1' || raw === 'true';
}

export function setCanCreateModel(value: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CAN_CREATE_MODEL_KEY, value ? '1' : '0');
  }
}
