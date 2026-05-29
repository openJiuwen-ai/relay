/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useState } from 'react';
import {
  type SearchEngineConfig,
  type SearchEngineConfiguredState,
  type SearchEngineEditPayload,
  type SearchEngineId,
  PAID_SEARCH_ENGINES,
} from '../search-engine-config.types';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';

const DEFAULT_CONFIG: SearchEngineConfig = {
  perplexityApiKey: '',
  serperApiKey: '',
  jinaApiKey: '',
  bochaApiKey: '',
};

const DEFAULT_CONFIGURED: SearchEngineConfiguredState = {
  perplexity: false,
  serper: false,
  jina: false,
  bocha: false,
};

/**
 * 环境变量名 → SearchEngineConfig 内部字段的双向映射
 * 前端用短字段名（perplexityApiKey）存储，后端用标准 env var 名称
 */
const ENV_VAR_TO_KEY: Record<string, keyof SearchEngineConfig> = {
  PERPLEXITY_API_KEY: 'perplexityApiKey',
  SERPER_API_KEY: 'serperApiKey',
  JINA_API_KEY: 'jinaApiKey',
  BOCHA_API_KEY: 'bochaApiKey',
};

/**
 * 环境变量名 → SearchEngineId 的映射
 * 用于从 env var 名称直接确定当前在配置哪个搜索引擎
 */
const ENV_VAR_TO_ENGINE_ID: Record<string, SearchEngineId> = {
  PERPLEXITY_API_KEY: 'perplexity',
  SERPER_API_KEY: 'serper',
  JINA_API_KEY: 'jina',
  BOCHA_API_KEY: 'bocha',
};

/**
 * 判断返回值是否为掩码占位符
 * 后端对已配置的 secret 值返回 '***' 而非真实内容；
 * 掩码说明密钥已配置（应显示"已配置"），但前端无法获取明文
 */
function isMaskedSecretValue(value: string | null | undefined): boolean {
  return value === '***';
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.clone().json()) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

export function useSearchEngineConfig() {
  const [config, setConfig] = useState<SearchEngineConfig>(DEFAULT_CONFIG);
  const [configured, setConfigured] = useState<SearchEngineConfiguredState>(DEFAULT_CONFIGURED);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingEngineId, setEditingEngineId] = useState<SearchEngineId | null>(null);

  const addToast = useToastStore((s) => s.addToast);

  /**
   * 从 /api/config/env-summary 加载所有搜索引擎的配置状态
   *
   * 判断逻辑：
   * - env var 有值（非 null、非空）→ configured = true
   * - env var 值为 '***'（掩码）→ configured = true，但 config 中不存明文（安全性）
   * - env var 不存在或为空 → configured = false
   */
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/config/env-summary');
      if (!res.ok) throw new Error(await readErrorMessage(res, '加载搜索引擎配置失败'));
      const data = (await res.json()) as { variables?: Array<{ name: string; currentValue: string | null }> };
      const variables = data.variables ?? [];
      const nextConfig: SearchEngineConfig = { ...DEFAULT_CONFIG };
      const nextConfigured: SearchEngineConfiguredState = { ...DEFAULT_CONFIGURED };

      for (const v of variables) {
        const configKey = ENV_VAR_TO_KEY[v.name];
        const engineId = ENV_VAR_TO_ENGINE_ID[v.name];
        if (!configKey || !engineId || v.currentValue == null || v.currentValue === '') continue;

        nextConfigured[engineId] = true;
        if (!isMaskedSecretValue(v.currentValue)) {
          nextConfig[configKey] = v.currentValue;
        }
      }

      setConfig(nextConfig);
      setConfigured(nextConfigured);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载搜索引擎配置失败';
      addToast({ type: 'error', title: '加载失败', message: msg, duration: 3000 });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  /**
   * 保存单个搜索引擎的 API key
   * 成功：更新本地 config + configured 状态，关闭编辑视图
   * 失败：只 toast 错误，状态不变（不残留脏数据）
   * 注意：editingEngineId 不在 deps 中，因为它仅通过 setEditingEngineId(null) 使用，引用始终稳定
   */
  const saveConfig = useCallback(
    async (payload: SearchEngineEditPayload) => {
      setSaving(true);
      try {
        const envVar = PAID_SEARCH_ENGINES.find((e) => e.id === payload.engineId)?.envVar;
        if (!envVar) throw new Error('未知的搜索引擎');
        const key = ENV_VAR_TO_KEY[envVar];
        if (!key) throw new Error('未知的搜索引擎');

        const res = await apiFetch('/api/config/env', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [{ name: envVar, value: payload.value }],
          }),
        });
        if (!res.ok) throw new Error(await readErrorMessage(res, '保存失败'));

        setConfig((prev) => ({ ...prev, [key]: payload.value }));
        setConfigured((prev) => ({ ...prev, [payload.engineId]: true }));
        addToast({ type: 'success', title: '保存成功', message: '', duration: 2000 });
        setEditingEngineId(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '保存失败';
        addToast({ type: 'error', title: '保存失败', message: msg, duration: 3000 });
        setEditingEngineId(null);
      } finally {
        setSaving(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- editingEngineId not used in scope
    },
    [addToast],
  );

  const startEdit = useCallback((engineId: SearchEngineId) => {
    setEditingEngineId(engineId);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingEngineId(null);
  }, []);

  const getEngineValue = useCallback(
    (engineId: SearchEngineId): string => {
      switch (engineId) {
        case 'perplexity':
          return config.perplexityApiKey ?? '';
        case 'serper':
          return config.serperApiKey ?? '';
        case 'jina':
          return config.jinaApiKey ?? '';
        case 'bocha':
          return config.bochaApiKey ?? '';
        default:
          return '';
      }
    },
    [config],
  );

  const isEngineConfigured = useCallback(
    (engineId: SearchEngineId): boolean => configured[engineId],
    [configured],
  );

  /**
   * 派生状态：当前视图的标题
   * - 非编辑状态：显示"搜索引擎"（标题区标题）
   * - 编辑状态：显示"配置"（单引擎配置页标题）
   * 不使用 useState，避免与 editingEngineId 不同步
   */
  const title = editingEngineId
    ? '配置'
    : '搜索引擎';

  return {
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
  };
}
