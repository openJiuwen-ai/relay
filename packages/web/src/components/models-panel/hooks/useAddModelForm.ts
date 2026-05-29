/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

import { useCallback, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { generateModelConfigSourceId, parseHeadersJson, SAVE_MODEL_LABEL } from '../utils';

export interface UseAddModelFormResult {
  // Form fields
  sourceId: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  headersText: string;
  models: string[];

  // Actions
  setDisplayName: (value: string) => void;
  setBaseUrl: (value: string) => void;
  setApiKey: (value: string) => void;
  setHeadersText: (value: string) => void;
  setModels: (value: string[]) => void;

  // Status
  canCreate: boolean;
  saveBusy: boolean;
  error: string | null;
  successMessage: string | null;

  // Operations
  handleSave: () => Promise<void>;
  reset: () => void;
}

export function useAddModelForm(
  projectPath: string | null,
  onCreated: () => Promise<void>,
  onError: (error: string | null) => void,
): UseAddModelFormResult {
  const [sourceId, setSourceId] = useState(() => generateModelConfigSourceId());
  const [displayName, setDisplayName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canCreate =
    displayName.trim().length > 0 && baseUrl.trim().length > 0 && apiKey.trim().length > 0 && models.length > 0;

  const reset = useCallback(() => {
    setSourceId(generateModelConfigSourceId());
    setDisplayName('');
    setBaseUrl('');
    setApiKey('');
    setHeadersText('');
    setModels([]);
    setError(null);
    setSuccessMessage(null);
  }, []);

  const handleSave = useCallback(async () => {
    onError(null);
    setSuccessMessage(null);
    setSaveBusy(true);
    try {
      const headers = parseHeadersJson(headersText);
      const res = await apiFetch('/api/model-config-profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(projectPath ? { projectPath } : {}),
          sourceId: sourceId.trim(),
          displayName: displayName.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          ...(headers ? { headers } : {}),
          models,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? `请求失败 (${res.status})`);
      }
      reset();
      await onCreated();
    } catch (saveError) {
      const errorMessage = saveError instanceof Error ? saveError.message : String(saveError);
      setError(errorMessage);
      onError(errorMessage);
    } finally {
      setSaveBusy(false);
    }
  }, [projectPath, sourceId, displayName, baseUrl, apiKey, headersText, models, reset, onCreated, onError]);

  return {
    sourceId,
    displayName,
    baseUrl,
    apiKey,
    headersText,
    models,
    setDisplayName,
    setBaseUrl,
    setApiKey,
    setHeadersText,
    setModels,
    canCreate,
    saveBusy,
    error,
    successMessage,
    handleSave,
    reset,
  };
}