/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuthorizationPendingStore } from '@/stores/authorizationPendingStore';
import { apiFetch } from '@/utils/api-client';

export interface AuthPendingRequest {
  requestId: string;
  agentId: string;
  invocationId?: string;
  threadId: string;
  action: string;
  reason: string;
  context?: string;
  createdAt: number;
}

export type RespondScope = 'once' | 'thread' | 'global';

export function useAuthorization(threadId: string) {
  const [pending, setPending] = useState<AuthPendingRequest[]>([]);
  const [fetchedThreadId, setFetchedThreadId] = useState<string | null>(null);
  const fetchSequenceRef = useRef(0);
  const syncThreadPending = useAuthorizationPendingStore((state) => state.syncThreadPending);
  const currentThreadPending = useMemo(
    () => pending.filter((request) => request.threadId === threadId),
    [pending, threadId],
  );

  const fetchPending = useCallback(async () => {
    const requestedThreadId = threadId;
    const fetchSequence = ++fetchSequenceRef.current;

    try {
      const res = await apiFetch(`/api/authorization/pending?threadId=${requestedThreadId}`);
      if (res.ok) {
        const data = await res.json();
        if (fetchSequence !== fetchSequenceRef.current) return;
        setPending(data.pending ?? []);
        setFetchedThreadId(requestedThreadId);
      }
    } catch {
      // Best-effort — don't crash on network error
    }
  }, [threadId]);

  // Fetch on mount and thread change
  useEffect(() => {
    setPending([]);
    setFetchedThreadId(null);
    void fetchPending();
  }, [fetchPending]);

  useEffect(() => {
    if (fetchedThreadId !== threadId && currentThreadPending.length === 0) return;
    syncThreadPending(
      threadId,
      currentThreadPending.map((request) => request.requestId),
    );
  }, [currentThreadPending, fetchedThreadId, syncThreadPending, threadId]);

  const respond = useCallback(async (requestId: string, granted: boolean, scope: RespondScope, reason?: string) => {
    try {
      const res = await apiFetch('/api/authorization/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, granted, scope, ...(reason ? { reason } : {}) }),
      });
      if (res.ok) {
        // Optimistically remove from local list
        setPending((prev) => prev.filter((r) => r.requestId !== requestId));
      }
    } catch {
      // Best-effort
    }
  }, []);

  // Socket event: new authorization request
  const handleAuthRequest = useCallback((data: AuthPendingRequest) => {
    setPending((prev) => {
      if (prev.some((r) => r.requestId === data.requestId)) return prev;
      return [...prev, data];
    });
  }, []);

  // Socket event: authorization resolved (by another client or tab)
  const handleAuthResponse = useCallback((data: { requestId: string }) => {
    setPending((prev) => prev.filter((r) => r.requestId !== data.requestId));
  }, []);

  const clearPending = useCallback(() => {
    setPending([]);
  }, []);

  return { pending: currentThreadPending, respond, clearPending, handleAuthRequest, handleAuthResponse, fetchPending };
}
