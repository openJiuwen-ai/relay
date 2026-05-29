/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAvailableClients } from '@/hooks/useAvailableClients';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { AppModal } from './AppModal';
import { Button } from './shared/Button';
import {
  ChoiceButton,
  clientLabel,
  CLIENT_ROW_1,
  CLIENT_ROW_2,
  FALLBACK_ANTIGRAVITY_ARGS,
  FALLBACK_ANTIGRAVITY_MODELS,
  PillChoiceButton,
} from './hub-add-member-wizard.parts';
import {
  builtinAccountIdForClient,
  type ClientValue,
  filterAccounts,
  type HubAgentEditorDraft,
} from './hub-agent-editor.model';
import type { ProfileItem, ProviderProfilesResponse } from './hub-provider-profiles.types';

interface ModelConfigProfilesResponse {
  projectPath: string;
  fallbackToProviderProfiles?: boolean;
  exists: boolean;
  providers: ProfileItem[];
}

function buildProjectScopedUrl(path: string, projectPath: string | null | undefined): string {
  if (!projectPath || projectPath === 'default') return path;
  const query = new URLSearchParams({ projectPath });
  return `${path}?${query.toString()}`;
}

function mergeAcpProfiles(baseProfiles: ProfileItem[], providerProfiles: ProfileItem[]): ProfileItem[] {
  const nextProfiles = [...baseProfiles];
  const seen = new Set(baseProfiles.map((profile) => profile.id));
  for (const profile of providerProfiles) {
    if (profile.kind !== 'acp' || seen.has(profile.id)) continue;
    nextProfiles.push(profile);
    seen.add(profile.id);
  }
  return nextProfiles;
}

async function loadProfilesForClient(
  projectPath: string | null | undefined,
  client: ClientValue | null,
): Promise<ProfileItem[]> {
  const modelConfigUrl = '/api/model-config-profiles';
  const providerProfilesUrl = buildProjectScopedUrl('/api/provider-profiles', projectPath);
  const needsAcpProfiles = client === 'acp';

  async function readProviderProfiles(): Promise<ProfileItem[]> {
    const providerProfilesRes = await apiFetch(providerProfilesUrl);
    if (!providerProfilesRes.ok) throw new Error(`账号配置加载失败 (${providerProfilesRes.status})`);
    const providerProfilesBody = (await providerProfilesRes.json()) as ProviderProfilesResponse;
    return providerProfilesBody.providers;
  }

  let modelConfigRes: Response;
  try {
    modelConfigRes = await apiFetch(modelConfigUrl);
  } catch {
    const providerProfiles = await readProviderProfiles();
    return needsAcpProfiles ? providerProfiles.filter((profile) => profile.kind === 'acp') : providerProfiles;
  }

  if (!modelConfigRes.ok) {
    if (modelConfigRes.status === 404) return [];
    throw new Error(`模型配置加载失败 (${modelConfigRes.status})`);
  }

  const body = (await modelConfigRes.json()) as ModelConfigProfilesResponse;
  if (body.exists) {
    if (!needsAcpProfiles) return body.providers;
    return mergeAcpProfiles(body.providers, await readProviderProfiles());
  }

  if (needsAcpProfiles) {
    return (await readProviderProfiles()).filter((profile) => profile.kind === 'acp');
  }

  if (!body.fallbackToProviderProfiles) return [];
  return readProviderProfiles();
}

interface HubAddMemberWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: (draft: HubAgentEditorDraft) => void;
}

export function HubAddMemberWizard({ open, onClose, onComplete }: HubAddMemberWizardProps) {
  const { clients: detectedClients, loading: loadingClients } = useAvailableClients();
  const currentProjectPath = useChatStore((state) => state.currentProjectPath);
  const clientIds = useMemo(() => new Set(detectedClients.map((client) => client.id)), [detectedClients]);
  const clientLabels = useMemo(
    () => new Map(detectedClients.map((client) => [client.id, client.label])),
    [detectedClients],
  );
  const clientRow1 = useMemo(() => CLIENT_ROW_1.filter((id) => clientIds.has(id)), [clientIds]);
  const clientRow2 = useMemo(() => CLIENT_ROW_2.filter((id) => clientIds.has(id)), [clientIds]);

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [seedCats, setSeedCats] = useState<
    Array<{ provider: string; source?: string; defaultModel?: string; commandArgs?: string[] }>
  >([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientValue | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [commandArgs, setCommandArgs] = useState(FALLBACK_ANTIGRAVITY_ARGS);

  const antigravityDefaults = useMemo((): { command: string; models: string[] } => {
    const templateAntigravity = seedCats.filter(
      (cat) => cat.provider === 'antigravity' && (cat.source === 'seed' || cat.source === undefined),
    );
    const command = templateAntigravity.find((cat) => (cat.commandArgs?.length ?? 0) > 0)?.commandArgs?.join(' ');
    const models = templateAntigravity
      .map((cat) => cat.defaultModel?.trim() ?? '')
      .filter((value) => value.length > 0);
    return {
      command: command?.trim() || FALLBACK_ANTIGRAVITY_ARGS,
      models: models.length > 0 ? Array.from(new Set(models)) : [...FALLBACK_ANTIGRAVITY_MODELS],
    };
  }, [seedCats]);

  const availableProfiles = useMemo(() => {
    if (!client || client === 'antigravity') return [];
    return filterAccounts(client, profiles);
  }, [client, profiles]);

  const selectedProfile = useMemo(
    () => availableProfiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [availableProfiles, selectedProfileId],
  );

  const selectableModels = useMemo(() => {
    if (client === 'antigravity') return antigravityDefaults.models;
    const currentModel = defaultModel.trim();
    const profileModels =
      selectedProfile?.models?.map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
    if (currentModel && !profileModels.includes(currentModel)) {
      return [currentModel, ...profileModels];
    }
    return profileModels;
  }, [antigravityDefaults.models, client, defaultModel, selectedProfile]);

  function profileSubtitle(profile: ProfileItem) {
    if (profile.source === 'model_config') return '用户模型配置';
    if (profile.builtin) return '内置';
    return 'API Key';
  }

  useEffect(() => {
    if (!open) return;
    setError(null);
    setClient(null);
    setSelectedProfileId('');
    setDefaultModel('');
    setCommandArgs(antigravityDefaults.command);
  }, [open, antigravityDefaults.command]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingProfiles(true);
    Promise.resolve()
      .then(() => loadProfilesForClient(currentProjectPath, client))
      .then((nextProfiles) => {
        if (!cancelled) setProfiles(nextProfiles);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '账号配置加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoadingProfiles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, currentProjectPath, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch('/api/agents')
      .then(async (res) => {
        if (!res.ok) throw new Error(`成员模板加载失败 (${res.status})`);
        return (await res.json()) as {
          agents?: Array<{ provider: string; source?: string; defaultModel?: string; commandArgs?: string[] }>;
        };
      })
      .then((body) => {
        if (cancelled) return;
        setSeedCats(Array.isArray(body.agents) ? body.agents : []);
      })
      .catch(() => {
        if (!cancelled) setSeedCats([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!client || client === 'antigravity') return;
    if (!availableProfiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(builtinAccountIdForClient(client) ?? availableProfiles[0]?.id ?? '');
    }
    if (!defaultModel.trim()) {
      setDefaultModel(selectableModels[0] ?? '');
    }
  }, [availableProfiles, client, defaultModel, selectableModels, selectedProfileId]);

  useEffect(() => {
    if (client !== 'antigravity') return;
    if (defaultModel.trim()) return;
    setDefaultModel(antigravityDefaults.models[0] ?? '');
  }, [antigravityDefaults.models, client, defaultModel]);

  if (!open) return null;

  const canFinish = Boolean(
    client &&
      defaultModel.trim() &&
      (client === 'antigravity' ? commandArgs.trim().length > 0 : Boolean(selectedProfile)),
  );

  const handleClientSelect = (nextClient: ClientValue) => {
    setClient(nextClient);
    setSelectedProfileId(nextClient === 'antigravity' ? '' : (builtinAccountIdForClient(nextClient) ?? ''));
    setDefaultModel(nextClient === 'antigravity' ? (antigravityDefaults.models[0] ?? '') : '');
    setCommandArgs(antigravityDefaults.command);
  };

  const handleProviderSelect = (nextProviderId: string) => {
    setSelectedProfileId(nextProviderId);
    const nextProfile = availableProfiles.find((profile) => profile.id === nextProviderId);
    setDefaultModel(nextProfile?.models?.[0] ?? '');
  };

  const handleComplete = () => {
    if (!client || !defaultModel.trim()) return;
    if (client === 'antigravity') {
      onComplete({
        client,
        defaultModel: defaultModel.trim(),
        commandArgs: commandArgs.trim(),
      });
      return;
    }
    const resolvedProfileId =
      availableProfiles.find((profile) => profile.id === selectedProfileId)?.id ?? selectedProfileId.trim();
    if (!resolvedProfileId) return;
    onComplete({
      client,
      accountRef: resolvedProfileId,
      defaultModel: defaultModel.trim(),
    });
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#D18A61]">成员协作 &gt; 总览 &gt; 添加成员</p>
        </div>
      }
      closeButtonAriaLabel="关闭"
      panelClassName="max-h-[88vh] max-w-[520px] bg-[#FFF8F2] p-0"
      bodyClassName="flex min-h-0 flex-1 flex-col pt-0"
      backdropTestId="hub-add-member-wizard"
      panelTestId="hub-add-member-wizard-panel"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-[#F0DDCD] px-7 py-6">
        <section className="space-y-4 rounded-[20px] border border-[#F1E7DF] bg-[#FFFDFC] p-[18px]">
          <div>
            <h4 className="text-[17px] font-bold text-[#2D2118]">Step 1: 选择 Client</h4>
            <p className="mt-1 text-sm leading-6 text-[#7F7168]">选择要接入的 CLI 工具、Agent 平台或 Antigravity bridge</p>
          </div>
          {loadingClients ? (
            <p className="text-sm text-[#8A776B]">正在检测可用 Client...</p>
          ) : clientRow1.length === 0 && clientRow2.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#E8DCCF] bg-white/80 px-4 py-3 text-sm text-[#8A776B]">
              未检测到可用的 CLI Client。请先安装对应的 CLI 工具。            </p>
          ) : (
            [clientRow1, clientRow2]
              .filter((row) => row.length > 0)
              .map((row, index) => (
                <div key={index} role="group" aria-label={`Client Row ${index + 1}`} className="flex flex-wrap gap-3">
                  {row.map((value) => (
                    <PillChoiceButton
                      key={value}
                      label={clientLabels.get(value) ?? clientLabel(value)}
                      selected={client === value}
                      onClick={() => handleClientSelect(value)}
                    />
                  ))}
                </div>
              ))
          )}
        </section>

        <section className="space-y-4 rounded-[20px] border border-[#F1E7DF] bg-[#FFFDFC] p-[18px]">
          <div>
            <h4 className="text-[17px] font-bold text-[#2D2118]">Step 2: 选择 Provider / 配置 CLI</h4>
          </div>

          {!client ? (
            <p className="rounded-2xl border border-dashed border-[#E8DCCF] bg-white/80 px-4 py-3 text-sm text-[#8A776B]">
              先在 Step 1 选择 Client。
            </p>
          ) : client === 'antigravity' ? (
            <label className="space-y-1.5 text-sm text-[#5C4B42]">
              <span className="font-medium">CLI Command</span>
              <input
                aria-label="CLI Command"
                value={commandArgs}
                onChange={(event) => setCommandArgs(event.target.value)}
                className="ui-input ui-input-soft w-full rounded-xl px-3 py-2.5 text-sm transition"
              />
            </label>
          ) : loadingProfiles ? (
            <p className="text-sm text-[#8A776B]">账号配置加载中...</p>
          ) : availableProfiles.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {availableProfiles.map((profile) => (
                <ChoiceButton
                  key={profile.id}
                  label={profile.displayName}
                  subtitle={profileSubtitle(profile)}
                  selected={selectedProfileId === profile.id}
                  onClick={() => handleProviderSelect(profile.id)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-[#F1E7DF] bg-white/80 px-4 py-3 text-sm text-[#8A776B]">
              当前 Client 还没有可用 Provider。
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-[20px] border border-[#F1E7DF] bg-[#FFFDFC] p-[18px]">
          <div>
            <h4 className="text-[17px] font-bold text-[#2D2118]">Step 3: 选择模型</h4>
          </div>

          {!client ? (
            <p className="rounded-2xl border border-dashed border-[#E8DCCF] bg-white/80 px-4 py-3 text-sm text-[#8A776B]">
              先选择 Client。
            </p>
          ) : client !== 'antigravity' && !selectedProfile ? (
            <p className="rounded-2xl border border-dashed border-[#E8DCCF] bg-white/80 px-4 py-3 text-sm text-[#8A776B]">
              先在 Step 2 选择 Provider。
            </p>
          ) : selectableModels.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {selectableModels.map((model) => (
                <PillChoiceButton
                  key={model}
                  label={model}
                  selected={defaultModel === model}
                  onClick={() => setDefaultModel(model)}
                />
              ))}
            </div>
          ) : (
            <label className="space-y-1.5 text-sm text-[#5C4B42]">
              <span className="font-medium">Model</span>
              <input
                aria-label="Model"
                value={defaultModel}
                onChange={(event) => setDefaultModel(event.target.value)}
                className="ui-input ui-input-soft w-full rounded-xl px-3 py-2.5 text-sm transition"
              />
            </label>
          )}
          {client === 'opencode' && selectedProfile?.authType === 'api_key' ? (
            <p className="rounded-2xl border border-dashed border-[#E8DCCF] bg-white/80 px-4 py-2 text-xs leading-5 text-[#8A776B]">
              OpenCode API Key 认证需要 Provider 名称，下一步编辑器中填写。
            </p>
          ) : null}
        </section>

        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}
      </div>

      <div className="ui-modal-footer-actions flex shrink-0 items-center justify-between border-t border-[#F0DDCD] bg-[#FFF3EA] px-7 py-4">
        <Button variant="default" onClick={onClose}>
          取消
        </Button>

        <Button variant="major" onClick={handleComplete} disabled={!canFinish}>
          创建后继续编辑
        </Button>
      </div>
    </AppModal>
  );
}
