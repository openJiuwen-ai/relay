/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useState } from 'react';
import type { AcpModelProfileItem, AcpModelProviderType } from './hub-provider-profiles.types';
import { useConfirm } from './useConfirm';

type EditableAcpModelProvider = AcpModelProviderType | '';

const PROVIDER_OPTIONS: Array<{ value: EditableAcpModelProvider; label: string }> = [
  { value: '', label: '(未设置)' },
  { value: 'openai_compatible', label: 'openai_compatible' },
  { value: 'bigmodel', label: 'bigmodel' },
  { value: 'minimax', label: 'minimax' },
  { value: 'echo', label: 'echo' },
];

export interface AcpModelProfileEditPayload {
  displayName: string;
  provider?: AcpModelProviderType | null;
  model: string;
  baseUrl: string;
  apiKey?: string;
}

export function HubAcpModelProfileItem({
  profile,
  busy,
  onSave,
  onDelete,
}: {
  profile: AcpModelProfileItem;
  busy: boolean;
  onSave: (profileId: string, payload: AcpModelProfileEditPayload) => Promise<void>;
  onDelete: (profileId: string) => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [provider, setProvider] = useState<EditableAcpModelProvider>(profile.provider ?? '');
  const [model, setModel] = useState(profile.model);
  const [baseUrl, setBaseUrl] = useState(profile.baseUrl);
  const [apiKey, setApiKey] = useState('');

  const startEdit = useCallback(() => {
    setDisplayName(profile.displayName);
    setProvider(profile.provider ?? '');
    setModel(profile.model);
    setBaseUrl(profile.baseUrl);
    setApiKey('');
    setEditing(true);
  }, [profile.baseUrl, profile.displayName, profile.model, profile.provider]);

  if (editing) {
    return (
      <div className="space-y-3 rounded-[20px] border border-[#D9D6F5] bg-[#F6F5FF] p-[18px]">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="显示名"
          className="ui-input w-full rounded px-3 py-2 text-sm"
        />
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as EditableAcpModelProvider)}
          className="w-full rounded border border-[#D9D6F5] bg-white px-3 py-2 text-sm"
        >
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="模型名"
          className="ui-input w-full rounded px-3 py-2 text-sm"
        />
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Base URL"
          className="ui-input w-full rounded px-3 py-2 text-sm"
        />
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={profile.hasApiKey ? '已配置（留空保持不变）' : 'API Key'}
          className="ui-input w-full rounded px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              await onSave(profile.id, {
                displayName: displayName.trim(),
                provider: provider || null,
                model: model.trim(),
                baseUrl: baseUrl.trim(),
                ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              });
              setEditing(false);
            }}
            disabled={busy}
            className="rounded bg-[#5C5AB1] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-[#D9D6F5] bg-[#F6F5FF] p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[#2D2118]">{profile.displayName}</span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#5C5AB1]">
              {profile.provider ?? '(未设置)'}
            </span>
          </div>
          <p className="text-sm text-[#6B679C]">
            {profile.model} · {profile.baseUrl}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5C5AB1]"
            onClick={startEdit}
            disabled={busy}
          >
            编辑
          </button>
          <button
            type="button"
            className="rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600"
            onClick={async () => {
              if (
                await confirm({
                  title: '删除确认',
                  message: `确认删除 ACP Model Profile「${profile.displayName}」吗？`,
                  variant: 'danger',
                  confirmLabel: '删除',
                })
              ) {
                onDelete(profile.id);
              }
            }}
            disabled={busy}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}
