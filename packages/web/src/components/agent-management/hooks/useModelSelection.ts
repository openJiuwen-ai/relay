/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import {
  HUAWEI_PROVIDER_LABEL,
  RELAYCLAW_CLIENT,
} from '../constants';
import type { CreateModelOption, MaaSModelResponseItem, ModelGroupId } from '../types';

function normalizeInitialModelName(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  if (!trimmed.startsWith('model_config:')) return trimmed;
  const parts = trimmed.split(':');
  return parts.length >= 3 ? parts.slice(2).join(':').trim() : trimmed;
}

function pickStringField(item: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function parseAccountRefFromModelItem(item: MaaSModelResponseItem): string | null {
  if (typeof item.accountRef === 'string' && item.accountRef.trim().length > 0) {
    return item.accountRef.trim();
  }
  if (item.provider === HUAWEI_PROVIDER_LABEL) return 'huawei-maas';
  const rawId = typeof item.id === 'string' ? item.id.trim() : '';
  if (!rawId) return null;
  if (!rawId.startsWith('model_config:')) return null;
  const rest = rawId.slice('model_config:'.length);
  const splitIndex = rest.indexOf(':');
  return splitIndex >= 0 ? rest.slice(0, splitIndex) : null;
}

function parseModelNameFromModelItemId(rawId: string, accountRef: string, fallbackName: string): string {
  if (!rawId.startsWith('model_config:')) return fallbackName;
  const prefix = `model_config:${accountRef}:`;
  if (!rawId.startsWith(prefix)) return fallbackName;
  return rawId.slice(prefix.length) || fallbackName;
}

function toModelOption(item: MaaSModelResponseItem): CreateModelOption | null {
  if (item.enabled === false) return null;
  const normalized = item as Record<string, unknown>;
  const modelLabel = pickStringField(normalized, ['name']);
  const accountRef = parseAccountRefFromModelItem(item);
  if (!modelLabel || !accountRef) return null;

  const providerLabel = pickStringField(normalized, ['provider']) ?? '';
  const protocol = pickStringField(normalized, ['protocol']);
  const isHuawei = accountRef === 'huawei-maas' || protocol === 'huawei_maas' || providerLabel === HUAWEI_PROVIDER_LABEL;
  const groupId: ModelGroupId = isHuawei ? 'huawei-maas' : 'third-party';
  const rawId =
    typeof item.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : `${accountRef}::${modelLabel}`;
  const model = parseModelNameFromModelItemId(rawId, accountRef, modelLabel);

  return {
    id: rawId,
    name: modelLabel,
    icon: pickStringField(normalized, ['icon', 'logo', 'image', 'avatar']),
    providerGroup: providerLabel,
    accountRef,
    client: RELAYCLAW_CLIENT,
    model,
    modelLabel,
    groupId,
  };
}

function buildFallbackSelectedOption(accountRef: string | null, model: string | null): CreateModelOption | null {
  if (!accountRef || !model) return null;
  const isHuawei = accountRef === 'huawei-maas';
  return {
    id: `${accountRef}::${model}`,
    name: model,
    accountRef,
    client: RELAYCLAW_CLIENT,
    model,
    modelLabel: model,
    groupId: isHuawei ? 'huawei-maas' : 'third-party',
  };
}

interface UseModelSelectionOptions {
  editingDefaultModel?: string | null;
  editingAccountRef?: string | null;
  defaultToFirstModel?: boolean;
}

interface UseModelSelectionResult {
  models: CreateModelOption[];
  loading: boolean;
  selectedModel: CreateModelOption | null;
  selectedModelId: string | null;
  missingModel: boolean;
  onSelectModel: (modelId: string) => void;
  resolveForSave: () => { accountRef: string; model: string } | null;
}

export function useModelSelection({
  editingDefaultModel,
  editingAccountRef,
  defaultToFirstModel = false,
}: UseModelSelectionOptions = {}): UseModelSelectionResult {
  const [marketplaceModels, setMarketplaceModels] = useState<MaaSModelResponseItem[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Fetch models on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    void (async () => {
      try {
        const response = await apiFetch('/api/maas-models');
        if (!response.ok) throw new Error(`模型广场加载失败 (${response.status})`);
        const body = (await response.json()) as { list?: MaaSModelResponseItem[]; models?: MaaSModelResponseItem[] };
        const source = Array.isArray(body.list) ? body.list : Array.isArray(body.models) ? body.models : [];
        if (!cancelled) setMarketplaceModels(source);
      } catch {
        if (!cancelled) setMarketplaceModels([]);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedEditingModel = normalizeInitialModelName(editingDefaultModel ?? null);
  const availableModels = useMemo(() => {
    const items = marketplaceModels.map((item) => toModelOption(item)).filter((item): item is CreateModelOption => item !== null);
    const deduped = new Map<string, CreateModelOption>();
    for (const item of items) deduped.set(item.id, item);
    return Array.from(deduped.values());
  }, [marketplaceModels]);

  const selectionHint = useMemo(
    () => ({
      model: normalizedEditingModel || null,
      accountRef: editingAccountRef ?? null,
    }),
    [normalizedEditingModel, editingAccountRef],
  );

  const selectedModel = useMemo(() => {
    if (selectedModelId) {
      const matchedById = availableModels.find((m) => m.id === selectedModelId);
      if (matchedById) return matchedById;
    }
    if (selectionHint.accountRef && selectionHint.model) {
      const matchedByPair = availableModels.find(
        (m) => m.accountRef === selectionHint.accountRef && m.model === selectionHint.model,
      );
      if (matchedByPair) return matchedByPair;
    }
    if (selectionHint.model) {
      const matchedByModel = availableModels.find((m) => m.model === selectionHint.model);
      if (matchedByModel) return matchedByModel;
    }
    if (defaultToFirstModel && availableModels.length > 0) {
      return availableModels[0];
    }
    return buildFallbackSelectedOption(selectionHint.accountRef, selectionHint.model);
  }, [availableModels, selectedModelId, selectionHint, defaultToFirstModel]);

  const missingModel = useMemo(() => {
    if (!selectionHint.model) return false;
    return !availableModels.some(
      (item) => item.model === selectionHint.model && item.accountRef === selectionHint.accountRef,
    );
  }, [availableModels, selectionHint]);

  useEffect(() => {
    if (!selectedModel) return;
    if (selectedModelId === selectedModel.id) return;
    setSelectedModelId(selectedModel.id);
  }, [selectedModel, selectedModelId]);

  const onSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModelId(modelId);
    },
    [],
  );

  const resolveForSave = useCallback(() => {
    if (!selectedModel) return null;
    return {
      accountRef: selectedModel.accountRef,
      model: selectedModel.model,
    };
  }, [selectedModel]);

  return {
    models: availableModels,
    loading: loadingModels,
    selectedModel,
    selectedModelId,
    missingModel,
    onSelectModel,
    resolveForSave,
  };
}

export { normalizeInitialModelName };
