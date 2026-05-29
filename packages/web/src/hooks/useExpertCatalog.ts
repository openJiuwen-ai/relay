/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export interface ExpertCatalogItem {
  expertId: string;
  displayName: string;
  nickname?: string;
  avatar: string;
  color: { primary: string; secondary: string };
  category: string;
  mentionPatterns: string[];
  roleDescription: string;
  personality?: string;
  skills?: string[];
  defaultModel?: string;
  providerProfileId?: string;
}

const EXPERT_CATEGORY_COLORS: Record<string, { primary: string; secondary: string }> = {
  design: { primary: '#FF6B6B', secondary: '#FFE0E0' },
  marketing: { primary: '#4ECDC4', secondary: '#D8F7F4' },
  growth: { primary: '#45B7D1', secondary: '#D8EFF8' },
  content: { primary: '#96CEB4', secondary: '#DDEFE4' },
};

interface FetchResult {
  experts: ExpertCatalogItem[];
  fromApi: boolean;
}

let _cached: ExpertCatalogItem[] | null = null;
let _fetchPromise: Promise<FetchResult> | null = null;
const _listeners = new Set<(experts: ExpertCatalogItem[]) => void>();

function notifyListeners(experts: ExpertCatalogItem[]): void {
  for (const listener of _listeners) {
    listener(experts);
  }
}

function normalizeExperts(rawExperts: unknown[]): ExpertCatalogItem[] {
  return rawExperts.map((raw) => {
    const expert = raw as Partial<ExpertCatalogItem> & { expertId?: string; category?: string };
    return {
      expertId: expert.expertId ?? '',
      displayName: expert.displayName ?? expert.expertId ?? '',
      nickname: expert.nickname,
      avatar: expert.avatar ?? '',
      color: EXPERT_CATEGORY_COLORS[expert.category ?? 'content'] ?? EXPERT_CATEGORY_COLORS.content,
      category: expert.category ?? 'content',
      mentionPatterns: Array.isArray(expert.mentionPatterns) ? expert.mentionPatterns : [],
      roleDescription: expert.roleDescription ?? '',
      personality: expert.personality,
      skills: Array.isArray(expert.skills) ? expert.skills : undefined,
      defaultModel: expert.defaultModel,
      providerProfileId: expert.providerProfileId,
    };
  });
}

async function fetchExperts(): Promise<FetchResult> {
  try {
    const res = await apiFetch('/api/experts');
    if (!res || typeof (res as Response).ok !== 'boolean') return { experts: [], fromApi: false };
    if (!res.ok) return { experts: [], fromApi: false };
    const data = await res.json();
    const experts = Array.isArray(data?.experts) ? normalizeExperts(data.experts) : [];
    return { experts, fromApi: true };
  } catch {
    return { experts: [], fromApi: false };
  }
}

async function refreshExpertsNow(): Promise<FetchResult> {
  _cached = null;
  _fetchPromise = fetchExperts();
  const result = await _fetchPromise;
  if (result.fromApi) {
    _cached = result.experts;
  } else {
    _fetchPromise = null;
  }
  notifyListeners(result.experts);
  return result;
}

export function useExpertCatalog() {
  const [experts, setExperts] = useState<ExpertCatalogItem[]>(() => _cached ?? []);
  const [isLoading, setIsLoading] = useState(!_cached);

  useEffect(() => {
    const listener = (nextExperts: ExpertCatalogItem[]) => {
      setExperts(nextExperts);
      setIsLoading(false);
    };
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (_cached) {
      setExperts(_cached);
      setIsLoading(false);
      return;
    }
    if (!_fetchPromise) {
      _fetchPromise = fetchExperts();
    }
    let cancelled = false;
    _fetchPromise.then(({ experts: result, fromApi }) => {
      if (fromApi) {
        _cached = result;
      } else {
        _fetchPromise = null;
      }
      notifyListeners(result);
      if (!cancelled) {
        setExperts(result);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useMemo(
    () => async () => {
      setIsLoading(true);
      const result = await refreshExpertsNow();
      setExperts(result.experts);
      setIsLoading(false);
      return result.experts;
    },
    [],
  );

  const getExpertById = useMemo(() => {
    const map = new Map(experts.map((expert) => [expert.expertId, expert]));
    return (expertId: string) => map.get(expertId);
  }, [experts]);

  return {
    experts,
    isLoading,
    refresh,
    getExpertById,
  };
}

export function getCachedExperts(): ExpertCatalogItem[] {
  return _cached ?? [];
}

export function expertToAgentData(expert: ExpertCatalogItem): AgentData {
  return {
    id: expert.expertId,
    name: expert.displayName,
    displayName: expert.displayName,
    nickname: expert.nickname?.trim() || undefined,
    color: expert.color,
    mentionPatterns: [...expert.mentionPatterns],
    breedId: expert.category,
    accountRef: expert.providerProfileId,
    providerProfileId: expert.providerProfileId,
    provider: 'relayclaw',
    defaultModel: expert.defaultModel ?? 'glm-5',
    avatar: expert.avatar,
    roleDescription: expert.roleDescription,
    personality: expert.personality ?? '',
    skills: expert.skills,
    source: 'runtime',
    expert: true,
    roster: {
      family: expert.category,
      roles: [],
      lead: false,
      available: true,
      evaluation: 'preset expert',
    },
  };
}

export function _resetExpertCatalogCache(): void {
  _cached = null;
  _fetchPromise = null;
  _listeners.clear();
}
