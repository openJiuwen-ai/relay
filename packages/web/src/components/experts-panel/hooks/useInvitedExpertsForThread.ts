/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import type { InvitedExpert } from '../types/expert';

interface UseInvitedExpertsForThreadOptions {
  threadId: string | null;
}

export function useInvitedExpertsForThread(options: UseInvitedExpertsForThreadOptions) {
  const { threadId } = options;
  const [invitedExperts, setInvitedExperts] = useState<InvitedExpert[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!threadId) {
      setInvitedExperts([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    async function fetchInvitedExperts() {
      try {
        const response = await apiFetch(`/api/threads/${threadId}/experts`);
        if (!response.ok) throw new Error('Failed to fetch invited experts');
        const data = await response.json();
        if (!cancelled) {
          setInvitedExperts(data.invitedExperts ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch invited experts:', err);
        if (!cancelled) {
          setInvitedExperts([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchInvitedExperts();

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  return { invitedExperts, isLoading };
}