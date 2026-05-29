/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useState, useMemo, useCallback } from 'react';
import { apiFetch } from '@/utils/api-client';
import type { Expert, ExpertCategory, InvitedExpertsResponse } from '../types/expert';

interface UseExpertsOptions {
  threadId?: string;
}

export function useExperts(options: UseExpertsOptions = {}) {
  const { threadId } = options;
  const [category, setCategory] = useState<ExpertCategory>('all');
  const [experts, setExperts] = useState<Expert[]>([]);
  const [invitedExpertIds, setInvitedExpertIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch experts list from API
  const fetchExperts = useCallback(async (cat?: ExpertCategory) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = cat && cat !== 'all' ? `?category=${cat}` : '';
      const response = await apiFetch(`/api/experts${params}`);
      if (!response.ok) throw new Error('Failed to fetch experts');
      const data = await response.json();
      setExperts(data.experts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch invited experts for current thread
  const fetchInvitedExperts = useCallback(async () => {
    if (!threadId) return;
    try {
      const response = await apiFetch(`/api/threads/${threadId}/experts`);
      if (!response.ok) throw new Error('Failed to fetch invited experts');
      const data: InvitedExpertsResponse = await response.json();
      setInvitedExpertIds(data.invitedExperts.map((e) => e.expertId));
    } catch (err) {
      // Silently fail for invited experts
      console.error('Failed to fetch invited experts:', err);
    }
  }, [threadId]);

  // Invite an expert to the thread
  const inviteExpert = useCallback(
    async (expertId: string, targetThreadId?: string) => {
      const tid = targetThreadId ?? threadId;
      if (!tid) return false;
      try {
        const response = await apiFetch(`/api/threads/${tid}/experts/${expertId}/invite`, {
          method: 'POST',
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message || 'Failed to invite expert');
        }
        await fetchInvitedExperts();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      }
    },
    [threadId, fetchInvitedExperts],
  );

  // Remove an expert from the thread
  const removeExpert = useCallback(
    async (expertId: string) => {
      if (!threadId) return false;
      try {
        const response = await apiFetch(`/api/threads/${threadId}/experts/${expertId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.message || 'Failed to remove expert');
        }
        await fetchInvitedExperts();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return false;
      }
    },
    [threadId, fetchInvitedExperts],
  );

  const filteredExperts = useMemo(() => {
    let result = experts;
    if (category !== 'all') {
      result = result.filter((e) => e.category === category);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (e) =>
          e.displayName.toLowerCase().includes(q) ||
          e.roleDescription.toLowerCase().includes(q) ||
          (e.skills && e.skills.some((s) => s.toLowerCase().includes(q))),
      );
    }
    return result;
  }, [experts, category, searchQuery]);

  return {
    experts: filteredExperts,
    allExperts: experts,
    category,
    setCategory,
    invitedExpertIds,
    isLoading,
    error,
    fetchExperts,
    fetchInvitedExperts,
    inviteExpert,
    removeExpert,
    searchQuery,
    setSearchQuery,
  };
}
