/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { create } from 'zustand';

interface AuthorizationPendingState {
  pendingByThread: Record<string, string[]>;
  threadByRequest: Record<string, string>;
  registerPending: (threadId: string, requestId: string) => void;
  registerPendingBatch: (entries: Array<{ threadId?: string; requestId?: string }>) => void;
  syncAllPending: (entries: Array<{ threadId?: string; requestId?: string }>) => void;
  resolvePending: (requestId: string) => void;
  syncThreadPending: (threadId: string, requestIds: string[]) => void;
  hasPending: (threadId: string) => boolean;
}

type AuthorizationPendingSnapshot = Pick<AuthorizationPendingState, 'pendingByThread' | 'threadByRequest'>;

function toUniqueRequestIds(requestIds: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const requestId of requestIds) {
    if (!requestId || seen.has(requestId)) continue;
    seen.add(requestId);
    ids.push(requestId);
  }
  return ids;
}

function cloneSnapshot(state: AuthorizationPendingSnapshot): AuthorizationPendingSnapshot {
  return {
    pendingByThread: { ...state.pendingByThread },
    threadByRequest: { ...state.threadByRequest },
  };
}

function removePendingFromThread(snapshot: AuthorizationPendingSnapshot, threadId: string, requestId: string): boolean {
  const previousThreadIds = snapshot.pendingByThread[threadId] ?? [];
  if (!previousThreadIds.includes(requestId)) return false;

  const cleanedPreviousThreadIds = previousThreadIds.filter((id) => id !== requestId);
  if (cleanedPreviousThreadIds.length === 0) {
    delete snapshot.pendingByThread[threadId];
  } else {
    snapshot.pendingByThread[threadId] = cleanedPreviousThreadIds;
  }
  return true;
}

function attachPendingToThread(snapshot: AuthorizationPendingSnapshot, threadId: string, requestId: string): boolean {
  const previousThreadId = snapshot.threadByRequest[requestId];
  let didChange = false;

  if (previousThreadId && previousThreadId !== threadId) {
    didChange = removePendingFromThread(snapshot, previousThreadId, requestId) || didChange;
  }

  const existingIds = snapshot.pendingByThread[threadId] ?? [];
  if (!existingIds.includes(requestId)) {
    snapshot.pendingByThread[threadId] = [...existingIds, requestId];
    didChange = true;
  }

  if (snapshot.threadByRequest[requestId] !== threadId) {
    snapshot.threadByRequest[requestId] = threadId;
    didChange = true;
  }

  return didChange;
}

function registerPendingEntries(
  state: AuthorizationPendingSnapshot,
  entries: Array<{ threadId?: string; requestId?: string }>,
): AuthorizationPendingSnapshot | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const next = cloneSnapshot(state);
  let didChange = false;
  for (const entry of entries) {
    const threadId = entry?.threadId?.trim();
    const requestId = entry?.requestId?.trim();
    if (!threadId || !requestId) continue;
    didChange = attachPendingToThread(next, threadId, requestId) || didChange;
  }
  return didChange ? next : null;
}

function replaceAllPendingRequests(
  state: AuthorizationPendingSnapshot,
  entries: Array<{ threadId?: string; requestId?: string }>,
): AuthorizationPendingSnapshot | null {
  const next: AuthorizationPendingSnapshot = {
    pendingByThread: {},
    threadByRequest: {},
  };

  for (const entry of entries) {
    const threadId = entry?.threadId?.trim();
    const requestId = entry?.requestId?.trim();
    if (!threadId || !requestId) continue;
    attachPendingToThread(next, threadId, requestId);
  }

  if (
    JSON.stringify(next.pendingByThread) === JSON.stringify(state.pendingByThread) &&
    JSON.stringify(next.threadByRequest) === JSON.stringify(state.threadByRequest)
  ) {
    return null;
  }

  return next;
}

function replaceThreadPendingRequests(
  state: AuthorizationPendingSnapshot,
  threadId: string,
  requestIds: string[],
): AuthorizationPendingSnapshot | null {
  if (!threadId) return null;

  const normalized = toUniqueRequestIds(requestIds);
  const previousIds = state.pendingByThread[threadId] ?? [];
  const next = cloneSnapshot(state);
  let didChange = false;

  for (const previousId of previousIds) {
    if (normalized.includes(previousId)) continue;
    if (next.threadByRequest[previousId] === threadId) {
      delete next.threadByRequest[previousId];
      didChange = true;
    }
  }

  if (normalized.length === 0) {
    if (threadId in next.pendingByThread) {
      delete next.pendingByThread[threadId];
      didChange = true;
    }
  } else {
    next.pendingByThread[threadId] = normalized;
    didChange = didChange || normalized.join('\0') !== previousIds.join('\0');
  }

  for (const requestId of normalized) {
    didChange = attachPendingToThread(next, threadId, requestId) || didChange;
  }

  return didChange ? next : null;
}

export const useAuthorizationPendingStore = create<AuthorizationPendingState>((set, get) => ({
  pendingByThread: {},
  threadByRequest: {},
  registerPending: (threadId, requestId) =>
    set((state) => {
      const next = registerPendingEntries(state, [{ threadId, requestId }]);
      return next ?? state;
    }),
  registerPendingBatch: (entries) =>
    set((state) => {
      const next = registerPendingEntries(state, entries);
      return next ?? state;
    }),
  syncAllPending: (entries) =>
    set((state) => {
      const next = replaceAllPendingRequests(state, entries);
      return next ?? state;
    }),
  resolvePending: (requestId) =>
    set((state) => {
      if (!requestId) return state;
      const threadId = state.threadByRequest[requestId];
      if (!threadId) return state;
      const currentIds = state.pendingByThread[threadId] ?? [];
      const nextIds = currentIds.filter((id) => id !== requestId);
      const nextPendingByThread = { ...state.pendingByThread };
      if (nextIds.length === 0) {
        delete nextPendingByThread[threadId];
      } else {
        nextPendingByThread[threadId] = nextIds;
      }
      const nextThreadByRequest = { ...state.threadByRequest };
      delete nextThreadByRequest[requestId];
      return {
        pendingByThread: nextPendingByThread,
        threadByRequest: nextThreadByRequest,
      };
    }),
  syncThreadPending: (threadId, requestIds) =>
    set((state) => {
      const next = replaceThreadPendingRequests(state, threadId, requestIds);
      return next ?? state;
    }),
  hasPending: (threadId) => {
    if (!threadId) return false;
    const ids = get().pendingByThread[threadId];
    return Array.isArray(ids) && ids.length > 0;
  },
}));
