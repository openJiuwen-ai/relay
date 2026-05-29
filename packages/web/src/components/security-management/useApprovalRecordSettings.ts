/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import type { ApprovalRecordSettingsResponse } from './types';

async function fetchApprovalRecordSettings(): Promise<ApprovalRecordSettingsResponse> {
  const response = await apiFetch('/api/authorization/records/settings');
  const payload = (await response.json()) as ApprovalRecordSettingsResponse;
  if (!response.ok) {
    throw new Error(payload.error || '加载审批记录设置失败');
  }
  return payload;
}

async function updateApprovalRecordSettings(
  autoCleanupEnabled: boolean,
): Promise<ApprovalRecordSettingsResponse> {
  const response = await apiFetch('/api/authorization/records/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ autoCleanupEnabled }),
  });
  const payload = (await response.json()) as ApprovalRecordSettingsResponse;
  if (!response.ok) {
    throw new Error(payload.error || '保存审批记录设置失败');
  }
  return payload;
}

export function useApprovalRecordSettings(open: boolean, active: boolean) {
  const addToast = useToastStore((state) => state.addToast);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) {
      setAutoCleanupEnabled(false);
      setLoading(false);
      setLoadFailed(false);
      setSaving(false);
      setLoaded(false);
      return;
    }
    if (!active || loaded) return;

    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setLoadFailed(false);

      try {
        const payload = await fetchApprovalRecordSettings();
        if (typeof payload.autoCleanupEnabled !== 'boolean') {
          throw new Error(payload.error || '加载审批记录设置失败');
        }
        if (cancelled) return;

        setAutoCleanupEnabled(payload.autoCleanupEnabled);
        setLoaded(true);
      } catch (error) {
        if (cancelled) return;

        setAutoCleanupEnabled(false);
        setLoadFailed(true);
        addToast({
          type: 'error',
          title: '审批记录设置加载失败',
          message: error instanceof Error ? error.message : '加载审批记录设置失败',
          duration: 3000,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [active, addToast, loaded, open]);

  const handleToggleAutoCleanup = async () => {
    if (loading || loadFailed || saving) return;

    const previousEnabled = autoCleanupEnabled;
    const nextEnabled = !previousEnabled;
    setAutoCleanupEnabled(nextEnabled);
    setSaving(true);

    try {
      await updateApprovalRecordSettings(nextEnabled);
      addToast({ type: 'success', title: '审批记录设置成功', message: '', duration: 2000 });
    } catch (error) {
      setAutoCleanupEnabled(previousEnabled);
      addToast({
        type: 'error',
        title: '审批记录设置失败',
        message: error instanceof Error ? error.message : '保存审批记录设置失败',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    autoCleanupEnabled,
    loading,
    loadFailed,
    saving,
    handleToggleAutoCleanup,
  };
}
