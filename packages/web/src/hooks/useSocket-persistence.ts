/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

function joinedRoomsPrimaryKey(userId: string): string {
  const normalizedUserId = userId.trim() || 'anonymous';
  return `office-claw:ws:joined-rooms:v1:${normalizedUserId}`;
}

function joinedRoomsLegacyKey(userId: string): string {
  const normalizedUserId = userId.trim() || 'anonymous';
  return `cat-cafe:ws:joined-rooms:v1:${normalizedUserId}`;
}

function isThreadRoom(room: unknown): room is string {
  return typeof room === 'string' && room.startsWith('thread:');
}

export function loadJoinedRoomsFromSession(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  const primary = joinedRoomsPrimaryKey(userId);
  const legacy = joinedRoomsLegacyKey(userId);
  let raw = window.sessionStorage.getItem(primary);
  if (!raw) raw = window.sessionStorage.getItem(legacy);
  if (!raw) return new Set();

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const rooms = new Set(parsed.filter(isThreadRoom));
    if (window.sessionStorage.getItem(primary) === null && window.sessionStorage.getItem(legacy) !== null) {
      try {
        window.sessionStorage.setItem(primary, JSON.stringify([...rooms]));
        window.sessionStorage.removeItem(legacy);
      } catch {
        /* ignore */
      }
    }
    return rooms;
  } catch (error) {
    console.warn('[ws] Failed to parse persisted rooms, resetting cache', { error });
    try {
      window.sessionStorage.removeItem(primary);
      window.sessionStorage.removeItem(legacy);
    } catch {
      /* ignore */
    }
    return new Set();
  }
}

export function saveJoinedRoomsToSession(userId: string, rooms: Set<string>): void {
  if (typeof window === 'undefined') return;
  const primary = joinedRoomsPrimaryKey(userId);
  const legacy = joinedRoomsLegacyKey(userId);
  try {
    window.sessionStorage.setItem(primary, JSON.stringify([...rooms]));
    try {
      window.sessionStorage.removeItem(legacy);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}
