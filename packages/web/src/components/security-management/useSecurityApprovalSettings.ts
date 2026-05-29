/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import type { PermissionDecision, PermissionsConfig, SecurityPolicyItem } from './types';
import {
  formatPaginationPages,
  isPermissionsEnabled,
  normalizePolicies,
  updateToolValue,
} from './utils';

const PAGE_SIZE = 5;

export function useSecurityApprovalSettings(open: boolean) {
  const addToast = useToastStore((state) => state.addToast);
  const [permissionsConfig, setPermissionsConfig] = useState<PermissionsConfig | null>(null);
  const [approvalBarEnabled, setApprovalBarEnabled] = useState(false);
  const [workspaceRwEnabled, setWorkspaceRwEnabled] = useState(false);
  const [policies, setPolicies] = useState<SecurityPolicyItem[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savingApprovalBar, setSavingApprovalBar] = useState(false);
  const [savingWorkspaceRw, setSavingWorkspaceRw] = useState(false);
  const [savingPolicyIds, setSavingPolicyIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) {
      setPermissionsConfig(null);
      setApprovalBarEnabled(false);
      setWorkspaceRwEnabled(false);
      setPolicies([]);
      setPage(1);
      setSearchQuery('');
      setLoading(false);
      setLoadFailed(false);
      setSavingApprovalBar(false);
      setSavingWorkspaceRw(false);
      setSavingPolicyIds({});
      return;
    }

    let cancelled = false;

    async function loadPermissions() {
      setLoading(true);
      setLoadFailed(false);

      try {
        const response = await apiFetch('/api/config/relayclaw/security');
        const payload = (await response.json()) as {
          permissions?: PermissionsConfig;
          error?: string;
        };
        const permissions = payload.permissions;
        if (!response.ok || !permissions) {
          throw new Error(payload.error || '加载安全权限配置失败');
        }
        if (cancelled) return;

        setPermissionsConfig(permissions);
        setApprovalBarEnabled(isPermissionsEnabled(permissions));
        setWorkspaceRwEnabled(permissions.rw_enabled === true);
        setPolicies(normalizePolicies(permissions));
        setPage(1);
        setSearchQuery('');
      } catch (error) {
        if (cancelled) return;

        setPermissionsConfig(null);
        setApprovalBarEnabled(false);
        setWorkspaceRwEnabled(false);
        setPolicies([]);
        setLoadFailed(true);
        addToast({
          type: 'error',
          title: '安全管理加载失败',
          message: error instanceof Error ? error.message : '加载安全权限配置失败',
          duration: 3000,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPermissions();

    return () => {
      cancelled = true;
    };
  }, [open, addToast]);

  const filteredPolicies = useMemo(
    () =>
      policies.filter((policy) =>
        policy.action.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [policies, searchQuery],
  );
  const totalPages = Math.max(1, Math.ceil(filteredPolicies.length / PAGE_SIZE));
  const paginatedPolicies = useMemo(
    () => filteredPolicies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredPolicies, page],
  );
  const showPagination = filteredPolicies.length > PAGE_SIZE;
  const paginationItems = showPagination ? formatPaginationPages(page, totalPages) : [];
  const showLoading = loading || (open && permissionsConfig === null && !loadFailed);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleToggleApprovalBar = async () => {
    if (savingApprovalBar) return;

    const previousEnabled = approvalBarEnabled;
    const nextEnabled = !previousEnabled;
    setApprovalBarEnabled(nextEnabled);
    setSavingApprovalBar(true);

    try {
      const response = await apiFetch('/api/config/relayclaw/security', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            enabled: nextEnabled,
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || '保存审批护栏设置失败');

      setPermissionsConfig((current) => ({
        ...(current ?? {}),
        enabled: nextEnabled,
      }));
      addToast({ type: 'success', title: '审批护栏设置成功', message: '', duration: 2000 });
    } catch (error) {
      setApprovalBarEnabled(previousEnabled);
      addToast({
        type: 'error',
        title: '审批护栏设置失败',
        message: error instanceof Error ? error.message : '保存审批护栏设置失败',
        duration: 3000,
      });
    } finally {
      setSavingApprovalBar(false);
    }
  };

  const handleToggleWorkspaceRw = async () => {
    if (savingWorkspaceRw) return;

    const previousEnabled = workspaceRwEnabled;
    const nextEnabled = !previousEnabled;
    setWorkspaceRwEnabled(nextEnabled);
    setSavingWorkspaceRw(true);

    try {
      const response = await apiFetch('/api/config/relayclaw/security', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            rw_enabled: nextEnabled,
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || '保存工作空间读写设置失败');

      setPermissionsConfig((current) => ({
        ...(current ?? {}),
        rw_enabled: nextEnabled,
      }));
      addToast({ type: 'success', title: '工作空间读写设置成功', message: '', duration: 2000 });
    } catch (error) {
      setWorkspaceRwEnabled(previousEnabled);
      addToast({
        type: 'error',
        title: '工作空间读写设置失败',
        message: error instanceof Error ? error.message : '保存工作空间读写设置失败',
        duration: 3000,
      });
    } finally {
      setSavingWorkspaceRw(false);
    }
  };

  const handleTogglePolicy = async (id: string) => {
    if (savingPolicyIds[id]) return;

    const currentPolicy = policies.find((policy) => policy.id === id);
    const previousApprovalRequired = currentPolicy?.approvalRequired ?? false;
    const currentValue = permissionsConfig?.tools?.[id];
    const nextApprovalRequired = !previousApprovalRequired;
    const nextDecision: PermissionDecision = nextApprovalRequired ? 'ask' : 'allow';
    const nextToolValue = updateToolValue(currentValue, nextDecision);

    setPolicies((current) =>
      current.map((policy) =>
        policy.id === id ? { ...policy, approvalRequired: nextApprovalRequired } : policy,
      ),
    );
    setPermissionsConfig((current) => ({
      ...(current ?? {}),
      tools: {
        ...(current?.tools ?? {}),
        [id]: nextToolValue,
      },
    }));
    setSavingPolicyIds((current) => ({ ...current, [id]: true }));

    try {
      const response = await apiFetch('/api/config/relayclaw/security', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          permissions: {
            tools: {
              [id]: nextToolValue,
            },
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || '保存安全策略失败');
      addToast({ type: 'success', title: '安全策略设置成功', message: '', duration: 2000 });
    } catch (error) {
      setPolicies((current) =>
        current.map((policy) =>
          policy.id === id ? { ...policy, approvalRequired: previousApprovalRequired } : policy,
        ),
      );
      setPermissionsConfig((current) => {
        const nextTools = { ...(current?.tools ?? {}) };
        if (currentValue === undefined) {
          delete nextTools[id];
        } else {
          nextTools[id] = currentValue;
        }

        return {
          ...(current ?? {}),
          tools: nextTools,
        };
      });
      addToast({
        type: 'error',
        title: '安全策略设置失败',
        message: error instanceof Error ? error.message : '保存安全策略失败',
        duration: 3000,
      });
    } finally {
      setSavingPolicyIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  return {
    loading: showLoading,
    loadFailed,
    approvalBarEnabled,
    workspaceRwEnabled,
    savingApprovalBar,
    savingWorkspaceRw,
    savingPolicyIds,
    hasPolicies: policies.length > 0,
    paginatedPolicies,
    page,
    totalPages,
    paginationItems,
    showPagination,
    searchQuery,
    setPage,
    handleSearchChange,
    handleToggleApprovalBar,
    handleToggleWorkspaceRw,
    handleTogglePolicy,
  };
}
