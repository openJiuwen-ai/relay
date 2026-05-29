/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo, useState } from 'react';
import { TagEditor } from './hub-tag-editor';
import type { AcpModelProfileItem, AcpModelProviderType, AcpModelAccessMode } from './hub-provider-profiles.types';

type EditableAcpModelProvider = AcpModelProviderType | '';

export function ProviderProfilesSummaryCard() {
  return (
    <div className="rounded-2xl border border-[#E6EAF2] bg-[#F8FAFD] p-4">
      <p className="text-[13px] font-semibold text-[#637188]">系统配置 &gt; 账号配置</p>
      <p className="mt-2 text-[13px] leading-6 text-[#7E8899]">每个账号可添加或删除模型。</p>
    </div>
  );
}

export type ApiProtocol = 'anthropic' | 'openai' | 'google';
export type AcpProviderKind = 'api_key' | 'acp';

const PROTOCOL_OPTIONS: Array<{ value: ApiProtocol; label: string }> = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
];

const ACP_MODEL_PROVIDER_OPTIONS: Array<{ value: AcpModelProviderType; label: string }> = [
  { value: 'openai_compatible', label: 'openai_compatible' },
  { value: 'bigmodel', label: 'bigmodel' },
  { value: 'minimax', label: 'minimax' },
  { value: 'echo', label: 'echo' },
];

const ACP_MODEL_ACCESS_OPTIONS: Array<{ value: AcpModelAccessMode; label: string }> = [
  { value: 'self_managed', label: 'Agent Teams 自管' },
  { value: 'clowder_default_profile', label: 'OfficeClaw 下发 default profile' },
];

export function CreateApiKeyProfileSection({
  kind,
  displayName,
  baseUrl,
  apiKey,
  protocol,
  models,
  command,
  args,
  cwd,
  envText,
  modelAccessMode,
  defaultModelProfileRef,
  acpModelProfiles,
  protocolOptions = PROTOCOL_OPTIONS,
  busy,
  onKindChange,
  onDisplayNameChange,
  onBaseUrlChange,
  onApiKeyChange,
  onProtocolChange,
  onModelsChange,
  onCommandChange,
  onArgsChange,
  onCwdChange,
  onEnvTextChange,
  onModelAccessModeChange,
  onDefaultModelProfileRefChange,
  onCreate,
  defaultExpanded = false,
}: {
  kind: AcpProviderKind;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  protocol: ApiProtocol;
  models: string[];
  command: string;
  args: string;
  cwd: string;
  envText: string;
  modelAccessMode: AcpModelAccessMode;
  defaultModelProfileRef: string;
  acpModelProfiles: AcpModelProfileItem[];
  protocolOptions?: Array<{ value: ApiProtocol; label: string }>;
  busy: boolean;
  onKindChange: (kind: AcpProviderKind) => void;
  onDisplayNameChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onProtocolChange: (protocol: ApiProtocol) => void;
  onModelsChange: (models: string[]) => void;
  onCommandChange: (value: string) => void;
  onArgsChange: (value: string) => void;
  onCwdChange: (value: string) => void;
  onEnvTextChange: (value: string) => void;
  onModelAccessModeChange: (value: AcpModelAccessMode) => void;
  onDefaultModelProfileRefChange: (value: string) => void;
  onCreate: () => void;
  defaultExpanded?: boolean;
}) {
  const canCreate =
    kind === 'acp'
      ? displayName.trim().length > 0 &&
        command.trim().length > 0 &&
        (modelAccessMode !== 'clowder_default_profile' || defaultModelProfileRef.trim().length > 0)
      : displayName.trim().length > 0 &&
        baseUrl.trim().length > 0 &&
        apiKey.trim().length > 0 &&
        models.length > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="p-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h4 className="text-base font-semibold text-[#2E3440]">
          {kind === 'acp' ? '+ 新建 ACP Provider' : '+ 新建 API Key 账号'}
        </h4>
        <span className="text-sm text-[#8A93A2]">{expanded ? '▾ 收起' : '▸ 展开'}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          <select
            value={kind}
            onChange={(e) => onKindChange(e.target.value as AcpProviderKind)}
            className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
          >
            <option value="api_key">API Key</option>
            <option value="acp">ACP</option>
          </select>
          <input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder={kind === 'acp' ? 'Provider 显示名，如 relay-teams-local' : '账号显示名，如 my-glm'}
            autoComplete="off"
            className="ui-input w-full rounded px-3 py-2 text-sm"
          />
          {kind === 'acp' ? (
            <>
              <input
                value={command}
                onChange={(e) => onCommandChange(e.target.value)}
                placeholder="命令，如 uv"
                className="ui-input w-full rounded px-3 py-2 text-sm"
              />
              <textarea
                value={args}
                onChange={(e) => onArgsChange(e.target.value)}
                rows={3}
                placeholder="参数按空格分隔，例如 -m relay_teams gateway acp stdio"
                className="ui-textarea w-full rounded px-3 py-2 text-sm"
              />
              <input
                value={cwd}
                onChange={(e) => onCwdChange(e.target.value)}
                placeholder="可选 cwd"
                className="ui-input w-full rounded px-3 py-2 text-sm"
              />
              <textarea
                value={envText}
                onChange={(e) => onEnvTextChange(e.target.value)}
                rows={3}
                placeholder="可选环境变量，每行 KEY=value"
                className="ui-textarea w-full rounded px-3 py-2 text-sm"
              />
              <select
                value={modelAccessMode}
                onChange={(e) => onModelAccessModeChange(e.target.value as AcpModelAccessMode)}
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
              >
                {ACP_MODEL_ACCESS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {modelAccessMode === 'clowder_default_profile' ? (
                <select
                  value={defaultModelProfileRef}
                  onChange={(e) => onDefaultModelProfileRefChange(e.target.value)}
                  className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
                >
                  <option value="">选择 ACP Model Profile</option>
                  {acpModelProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.displayName}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : (
            <>
              <select
                value={protocol}
                onChange={(e) => onProtocolChange(e.target.value as ApiProtocol)}
                className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
              >
                {protocolOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                value={baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder="API 服务地址，如 https://api.example.com/v1"
                autoComplete="off"
                className="ui-input w-full rounded px-3 py-2 text-sm"
              />
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="sk-xxxxxxxxxxxxxxxx"
                className="ui-input w-full rounded px-3 py-2 text-sm"
              />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#6E7785]">可用模型 *</p>
                <TagEditor
                  tags={models}
                  tone="purple"
                  addLabel="+ 添加模型"
                  placeholder="输入模型名，如 gpt-4o"
                  emptyLabel="(至少添加 1 个模型)"
                  onChange={onModelsChange}
                  minCount={0}
                />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={onCreate}
            disabled={busy || !canCreate}
            className="rounded bg-[#111418] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2A3038] disabled:opacity-50"
          >
            {busy ? '创建中...' : '创建'}
          </button>
        </div>
      )}
    </div>
  );
}

export function CreateAcpModelProfileSection({
  displayName,
  provider,
  model,
  baseUrl,
  apiKey,
  busy,
  onDisplayNameChange,
  onProviderChange,
  onModelChange,
  onBaseUrlChange,
  onApiKeyChange,
  onCreate,
}: {
  displayName: string;
  provider: EditableAcpModelProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  busy: boolean;
  onDisplayNameChange: (value: string) => void;
  onProviderChange: (value: EditableAcpModelProvider) => void;
  onModelChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onCreate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canCreate = useMemo(
    () =>
      displayName.trim().length > 0 &&
      model.trim().length > 0 &&
      baseUrl.trim().length > 0 &&
      apiKey.trim().length > 0,
    [apiKey, baseUrl, displayName, model],
  );

  return (
    <div className="rounded-2xl border border-[#E6EAF2] bg-[#F8FAFD] p-4">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between text-left"
      >
        <h4 className="text-base font-semibold text-[#2E3440]">+ 新建 ACP Model Profile</h4>
        <span className="text-sm text-[#8A93A2]">{expanded ? '▾ 收起' : '▸ 展开'}</span>
      </button>
      {expanded ? (
        <div className="mt-4 space-y-3">
          <input
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="显示名，如 gateway-default-openai"
            className="ui-input w-full rounded px-3 py-2 text-sm"
          />
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as EditableAcpModelProvider)}
            className="w-full rounded border border-[#DCE2EB] bg-white px-3 py-2 text-sm"
          >
            <option value="">留空自动推断</option>
            {ACP_MODEL_PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="模型名，如 gpt-4.1"
            className="ui-input w-full rounded px-3 py-2 text-sm"
          />
          <input
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder="Base URL"
            className="ui-input w-full rounded px-3 py-2 text-sm"
          />
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="API Key"
            className="ui-input w-full rounded px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={onCreate}
            disabled={busy || !canCreate}
            className="rounded bg-[#111418] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2A3038] disabled:opacity-50"
          >
            {busy ? '创建中...' : '创建'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
