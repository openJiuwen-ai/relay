/*
 * *
 * *  Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

interface UserWhitelistEntry {
  openId: string;
  name?: string;
  addedAt: number;
  addedBy?: string;
}

interface PermissionConfig {
  userWhitelistEnabled: boolean;
  allowedUsers: UserWhitelistEntry[];
  ownerOpenId?: string;
}

const EMPTY_CONFIG: PermissionConfig = {
  userWhitelistEnabled: true, // 默认开启（建议）
  allowedUsers: [],
  ownerOpenId: undefined,
};

async function apiFetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await apiFetch(url, {
      ...init,
      headers: { ...init?.headers, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.error('[FeishuPermissionPanel] API error:', res.status, res.statusText);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    console.error('[FeishuPermissionPanel] Network error:', err);
    return null;
  }
}

export function FeishuPermissionPanel() {
  const [config, setConfig] = useState<PermissionConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUserOpenId, setNewUserOpenId] = useState('');
  const [newUserName, setNewUserName] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const data = await apiFetchJson<PermissionConfig>('/api/connector/permissions/feishu');
    if (data) setConfig(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (patch: Partial<PermissionConfig>) => {
    setSaving(true);
    const data = await apiFetchJson<PermissionConfig>('/api/connector/permissions/feishu', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    if (data) setConfig(data);
    setSaving(false);
  };

  const addUser = () => {
    if (!newUserOpenId.trim()) return;
    const updated = [
      ...config.allowedUsers,
      { openId: newUserOpenId.trim(), name: newUserName.trim() || undefined, addedAt: Date.now() },
    ];
    saveConfig({ allowedUsers: updated });
    setNewUserOpenId('');
    setNewUserName('');
  };

  const removeUser = (openId: string) => {
    const updated = config.allowedUsers.filter((u) => u.openId !== openId);
    saveConfig({ allowedUsers: updated });
  };

  if (loading) {
    return <p className="text-xs text-gray-400 py-2">加载权限配置...</p>;
  }

  return (
    <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
      {/* Personal User Whitelist */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">
            个人白名单
            {config.userWhitelistEnabled && <span className="text-gray-400 ml-1">（建议开启）</span>}
          </span>
          <button
            onClick={() => saveConfig({ userWhitelistEnabled: !config.userWhitelistEnabled })}
            disabled={saving}
            className={`relative w-10 h-5 rounded-full transition-colors ${config.userWhitelistEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.userWhitelistEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        {/* Disabled warning */}
        {!config.userWhitelistEnabled && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-xs">
            <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5Zm0 9a1 1 0 100-2 1 1 0 000 2Z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-yellow-700">📢 未开启白名单，所有飞书用户均可 @bot</span>
          </div>
        )}

        {/* Enabled section */}
        {config.userWhitelistEnabled && (
          <div className="space-y-1.5">
            {/* Empty whitelist warning */}
            {config.allowedUsers.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs">
                <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0Zm-7-4a1 1 0 11-2 0 1 1 0 012 0ZM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-blue-700">ℹ️ 白名单为空，当前仅扫码者可 @bot</span>
              </div>
            )}

            {/* Owner OpenId display */}
            {config.ownerOpenId && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-xs">
                <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 1a.75.75 0 0 1 .65.378l2.005 3.518 3.907.896a.75.75 0 0 1 .35 1.238l-2.634 2.87.363 3.964a.75.75 0 0 1-1.054.747L10 12.868l-3.587 1.743a.75.75 0 0 1-1.054-.747l.363-3.964L3.088 7.03a.75.75 0 0 1 .35-1.238l3.907-.896L9.35 1.378A.75.75 0 0 1 10 1Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="flex-1 truncate text-green-700">扫码者（豁免）: {config.ownerOpenId}</span>
              </div>
            )}

            {/* Whitelist users */}
            {config.allowedUsers.map((u) => (
              <div key={u.openId} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-xs">
                <svg
                  className="w-3.5 h-3.5 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  />
                </svg>
                <span className="flex-1 truncate">
                  {u.name || u.openId}
                  {u.name ? <span className="text-gray-400 ml-1">{u.openId.slice(-8)}</span> : null}
                </span>
                <button onClick={() => removeUser(u.openId)} className="text-red-400 hover:text-red-600">
                  ✕
                </button>
              </div>
            ))}

            {/* Add user */}
            <div className="flex gap-2">
              <input
                value={newUserOpenId}
                onChange={(e) => setNewUserOpenId(e.target.value)}
                placeholder="open_id (ou_xxxx...)"
                className="ui-input flex-1 px-2 py-1.5 text-xs rounded-lg"
              />
              <input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="备注名（如：张三）"
                className="ui-input flex-1 px-2 py-1.5 text-xs rounded-lg"
              />
              <button
                onClick={addUser}
                disabled={!newUserOpenId.trim() || saving}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg disabled:opacity-40"
              >
                添加
              </button>
            </div>
            <p className="text-xs text-gray-400">💡 让用户在飞书中 @bot 发送 /myid 获取 open_id</p>
          </div>
        )}
      </div>
    </div>
  );
}
