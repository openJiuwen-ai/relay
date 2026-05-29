/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { readBuildEnv } from '@/utils/client-env';
import { getCanCreateModel, getIsSkipAuth } from '@/utils/userId';
import {
  buildModelSearchText,
  groupCards,
  isEnvFlagEnabled,
  normalizeModel,
  normalizeUpdatedAt,
  resolveModelConfigSourceId,
} from '../utils';
import type { MassModelResponseItem, ModelCardData, ModelCardGroup, ModelConfigProviderItem } from '../types/models-panel';

export interface UseModelsPanelDataResult {
  loading: boolean;
  isSkipAuth: boolean;
  canCreateModel: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  cards: ModelCardData[];
  groupedCards: ModelCardGroup[];
  resolvedProjectPath: string | null;
  fetchModels: () => Promise<void>;
  hasSearchQuery: boolean;
  showEmptyData: boolean;
  showNoResults: boolean;
  showGroups: boolean;
}

export function useModelsPanelData(): UseModelsPanelDataResult {
  const [loading, setLoading] = useState(false);
  const [isSkipAuth, setIsSkipAuth] = useState(false);
  const [canCreateModel, setCanCreateModel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [cards, setCards] = useState<ModelCardData[]>([]);
  const [resolvedProjectPath, setResolvedProjectPath] = useState<string | null>(null);

  const currentProjectPath = useChatStore((s) => s.currentProjectPath);

  const buildModelsUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (currentProjectPath && currentProjectPath !== 'default') {
      query.set('projectPath', currentProjectPath);
    }
    const queryText = query.toString();
    return queryText ? `/api/maas-models?${queryText}` : '/api/maas-models';
  }, [currentProjectPath]);

  const buildModelConfigProfilesUrl = useCallback(() => {
    const query = new URLSearchParams();
    if (currentProjectPath && currentProjectPath !== 'default') {
      query.set('projectPath', currentProjectPath);
    }
    const queryText = query.toString();
    return queryText ? `/api/model-config-profiles?${queryText}` : '/api/model-config-profiles';
  }, [currentProjectPath]);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const [modelsRes, providersRes] = await Promise.all([
        apiFetch(buildModelsUrl()),
        apiFetch(buildModelConfigProfilesUrl()),
      ]);
      if (!modelsRes.ok) {
        setCards([]);
        return;
      }
      const json = (await modelsRes.json()) as {
        projectPath?: string;
        list?: MassModelResponseItem[];
        models?: MassModelResponseItem[];
      };
      const providersJson = providersRes.ok
        ? ((await providersRes.json()) as { providers?: ModelConfigProviderItem[] })
        : { providers: [] };
      const providerUpdatedAtById = new Map(
        (providersJson.providers ?? [])
          .filter((provider) => normalizeUpdatedAt(provider.updatedAt ?? provider.createdAt) !== undefined)
          .map((provider) => [provider.id, (provider.updatedAt ?? provider.createdAt) as string]),
      );
      const source = Array.isArray(json.list) ? json.list : Array.isArray(json.models) ? json.models : [];
      setCards(
        source.map(normalizeModel).map((card) => {
          const sourceId = resolveModelConfigSourceId(card.id);
          if (!sourceId || card.updatedAt !== undefined) return card;
          const updatedAt = providerUpdatedAtById.get(sourceId);
          return updatedAt ? { ...card, updatedAt } : card;
        }),
      );
      setResolvedProjectPath(typeof json.projectPath === 'string' ? json.projectPath : null);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [buildModelConfigProfilesUrl, buildModelsUrl]);

  useEffect(() => {
    setIsSkipAuth(getIsSkipAuth());
    setCanCreateModel(
      getCanCreateModel() || isEnvFlagEnabled(readBuildEnv('CAN_CREATE_MODEL')),
    );
  }, []);

  useEffect(() => {
    void fetchModels();
  }, [fetchModels]);

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredCards = useMemo(() => {
    if (!normalizedQuery) return cards;
    return cards.filter((card) => buildModelSearchText(card).includes(normalizedQuery));
  }, [cards, normalizedQuery]);

  const groupedCards = useMemo(() => groupCards(filteredCards), [filteredCards]);

  const hasSearchQuery = normalizedQuery.length > 0;
  const showEmptyData = !loading && cards.length === 0;
  const showNoResults = !loading && cards.length > 0 && hasSearchQuery && groupedCards.length === 0;
  const showGroups = !loading && groupedCards.length > 0;

  return {
    loading,
    isSkipAuth,
    canCreateModel,
    searchQuery,
    setSearchQuery,
    cards,
    groupedCards,
    resolvedProjectPath,
    fetchModels,
    hasSearchQuery,
    showEmptyData,
    showNoResults,
    showGroups,
  };
}