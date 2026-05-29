/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/utils/api-client';
import type { Thread } from '@/stores/chat-types';
import { normalizeStoredThreadTitleOrNull } from '@/components/thread-sidebar/thread-title';
import type { SessionSelectOption } from '../components/SessionSelectField';

export function useSessionOptions(open: boolean) {
  const [sessionOptions, setSessionOptions] = useState<SessionSelectOption[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);

  const loadThreads = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(false);
    try {
      const res = await apiFetch('/api/threads');
      if (!res.ok) throw new Error('failed_to_load_threads');
      const data = (await res.json()) as { threads?: Thread[] };
      setSessionOptions(
        (data.threads ?? [])
          .filter((thread) => thread.id !== 'default')
          .map((thread) => ({
            value: thread.id,
            label: normalizeStoredThreadTitleOrNull(thread.title) ?? '未命名对话',
            participants: Array.isArray(thread.participants) ? thread.participants : [],
            lastActiveAt: thread.lastActiveAt ?? 0,
          })),
      );
    } catch {
      setSessionOptions([]);
      setSessionsError(true);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const load = async () => {
      await loadThreads();
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [open, loadThreads]);

  return {
    sessionOptions,
    sessionsLoading,
    sessionsError,
    reloadSessions: loadThreads,
  };
}
