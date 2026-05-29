/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useCallback } from 'react';
import { CenteredLoadingState } from '@/components/shared/CenteredLoadingState';
import { SearchEngineCard } from './components/SearchEngineCard';
import { SearchEngineEditView } from './components/SearchEngineEditView';
import { useSearchEngineConfig } from './hooks/useSearchEngineConfig';
import { PAID_SEARCH_ENGINES, type SearchEngine } from './search-engine-config.types';

export function SearchEngineConfig() {
  const {
    loading,
    saving,
    editingEngineId,
    title,
    loadConfig,
    saveConfig,
    startEdit,
    cancelEdit,
    getEngineValue,
    isEngineConfigured,
  } = useSearchEngineConfig();

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  /**
   * 稳定的 onSave 回调，供 SearchEngineEditView 使用
   * 使用 useCallback 包装避免每次渲染创建新函数引用，
   * 防止 EditView 误判 props 变化而触发额外渲染
   */
  const handleSave = useCallback(
    (engineId: SearchEngine['id'], value: string) => saveConfig({ engineId, value }),
    [saveConfig],
  );

  const editingEngine =
    editingEngineId ? PAID_SEARCH_ENGINES.find((e) => e.id === editingEngineId) ?? null : null;

  if (loading) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <CenteredLoadingState />
      </div>
    );
  }

  if (editingEngine) {
    return (
        <SearchEngineEditView
          engine={editingEngine}
          value={getEngineValue(editingEngine.id)}
          configured={isEngineConfigured(editingEngine.id)}
          onSave={handleSave}
          onCancel={cancelEdit}
          saving={saving}
        />
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-[16px] font-medium" style={{ color: 'rgba(25, 25, 25, 1)' }}>
        {title}
      </h2>
      <section>
        <h3 className="mb-3 text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">付费搜索引擎</h3>
        <div className="space-y-2">
          {PAID_SEARCH_ENGINES.map((engine) => {
            const hasValue = isEngineConfigured(engine.id);
            return (
              <SearchEngineCard
                key={engine.id}
                engine={engine}
                hasValue={hasValue}
                onClick={() => startEdit(engine.id)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
