/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { GovernanceHealthSummary } from '@openjiuwen/relay-shared';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

interface GovernanceHealthResponse {
  projects: GovernanceHealthSummary[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: 'bg-green-50', text: 'text-green-700', label: '正常' },
  stale: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: '过期' },
  missing: { bg: 'bg-red-50', text: 'text-red-700', label: '缺失' },
};

export function HubGovernanceTab() {
  const [projects, setProjects] = useState<GovernanceHealthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/governance/health');
      if (!res.ok) {
        setError('加载治理状态失败');
        return;
      }
      const data = (await res.json()) as GovernanceHealthResponse;
      setProjects(data.projects);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  if (loading) {
    return <p className="text-sm text-gray-400">加载治理状态中...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>;
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p className="text-sm">暂无外部项目治理记录</p>
        <p className="text-xs mt-1">当智能体首次被派遣到外部项目时，治理规则会自动同步</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">外部项目治理状态</h3>
        <button type="button" onClick={fetchHealth} className="text-xs text-blue-500 hover:text-blue-700">
          刷新
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-gray-600">项目路径</th>
              <th className="px-3 py-2 font-medium text-gray-600">状态</th>
              <th className="px-3 py-2 font-medium text-gray-600">版本</th>
              <th className="px-3 py-2 font-medium text-gray-600">上次同步</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {projects.map((p) => {
              const fallback = { bg: 'bg-gray-50', text: 'text-gray-500', label: p.status };
              const style = STATUS_STYLES[p.status] ?? fallback;
              const shortPath = p.projectPath.split(/[/\\]/).slice(-2).join('/');
              const syncDate = p.lastSyncedAt ? new Date(p.lastSyncedAt).toLocaleDateString('zh-CN') : '—';

              return (
                <tr key={p.projectPath} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs" title={p.projectPath}>
                    {shortPath}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{p.packVersion ?? '—'}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{syncDate}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
