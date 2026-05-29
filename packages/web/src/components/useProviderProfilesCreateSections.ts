/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect } from 'react';
import { useCallback, useState } from 'react';
import { splitCommandArgs } from './hub-agent-editor.model';
import { parseProviderEnvText } from './hub-provider-env';
import type { AcpProviderKind } from './hub-provider-profiles.sections';
import type { AcpModelAccessMode, AcpModelProfileItem, AcpModelProviderType } from './hub-provider-profiles.types';

type EditableAcpModelProvider = AcpModelProviderType | '';

const DEFAULT_ACP_ARGS = '-m relay_teams gateway acp stdio';

function resolveDefaultAcpCommand(projectPath: string | null): string {
  if (!projectPath) return 'tools/python/python.exe';
  const trimmed = projectPath.replace(/[\\/]+$/, '');
  const separator = trimmed.includes('\\') ? '\\' : '/';
  return `${trimmed}${separator}tools${separator}python${separator}python.exe`;
}

interface CreateSectionsOptions {
  acpModelProfiles: AcpModelProfileItem[];
  mutationProjectPath: string | null;
  callApi: (path: string, init: RequestInit) => Promise<Record<string, unknown>>;
  refresh: () => Promise<void>;
  setBusyId: (value: string | null) => void;
  setError: (value: string | null) => void;
}

export function useProviderProfilesCreateSections(options: CreateSectionsOptions) {
  const [createKind, setCreateKind] = useState<AcpProviderKind>('api_key');
  const [createDisplayName, setCreateDisplayName] = useState('');
  const [createProtocol, setCreateProtocol] = useState<'anthropic' | 'openai' | 'google'>('anthropic');
  const [createBaseUrl, setCreateBaseUrl] = useState('');
  const [createApiKey, setCreateApiKey] = useState('');
  const [createModels, setCreateModels] = useState<string[]>([]);
  const [createAcpCommand, setCreateAcpCommand] = useState(resolveDefaultAcpCommand(options.mutationProjectPath));
  const [createAcpArgs, setCreateAcpArgs] = useState(DEFAULT_ACP_ARGS);
  const [createAcpCwd, setCreateAcpCwd] = useState('');
  const [createAcpEnvText, setCreateAcpEnvText] = useState('');
  const [createAcpModelAccessMode, setCreateAcpModelAccessMode] = useState<AcpModelAccessMode>('self_managed');
  const [createAcpModelProfileRef, setCreateAcpModelProfileRef] = useState('');

  const [createAcpModelDisplayName, setCreateAcpModelDisplayName] = useState('');
  const [createAcpModelProvider, setCreateAcpModelProvider] = useState<EditableAcpModelProvider>('');
  const [createAcpModel, setCreateAcpModel] = useState('');
  const [createAcpModelBaseUrl, setCreateAcpModelBaseUrl] = useState('');
  const [createAcpModelApiKey, setCreateAcpModelApiKey] = useState('');

  useEffect(() => {
    setCreateAcpCommand((prev) => {
      const normalizedPrev = prev.trim();
      if (
        normalizedPrev.length === 0 ||
        normalizedPrev === 'relay-teams' ||
        normalizedPrev === 'tools/python/python.exe' ||
        /[\\/]tools[\\/]python[\\/]python\.exe$/i.test(normalizedPrev)
      ) {
        return resolveDefaultAcpCommand(options.mutationProjectPath);
      }
      return prev;
    });
    setCreateAcpCwd((prev) => (prev === '/opt/workspace/relay-teams' ? '' : prev));
  }, [options.mutationProjectPath]);

  const resetCreateProfileForm = useCallback(() => {
    setCreateDisplayName('');
    setCreateProtocol('anthropic');
    setCreateBaseUrl('');
    setCreateApiKey('');
    setCreateModels([]);
    setCreateAcpCommand(resolveDefaultAcpCommand(options.mutationProjectPath));
    setCreateAcpArgs(DEFAULT_ACP_ARGS);
    setCreateAcpCwd('');
    setCreateAcpEnvText('');
    setCreateAcpModelAccessMode('self_managed');
    setCreateAcpModelProfileRef('');
  }, [options.mutationProjectPath]);

  const resetCreateAcpModelForm = useCallback(() => {
    setCreateAcpModelDisplayName('');
    setCreateAcpModelProvider('');
    setCreateAcpModel('');
    setCreateAcpModelBaseUrl('');
    setCreateAcpModelApiKey('');
  }, []);

  const createProfile = useCallback(async () => {
    if (!createDisplayName.trim()) {
      options.setError('请输入账号显示名');
      return;
    }
    if (createKind === 'acp') {
      if (!createAcpCommand.trim()) {
        options.setError('ACP provider 需要填写 command');
        return;
      }
      if (createAcpModelAccessMode === 'clowder_default_profile' && !createAcpModelProfileRef.trim()) {
        options.setError('请选择 ACP Model Profile');
        return;
      }
    } else if (!createBaseUrl.trim() || !createApiKey.trim()) {
      options.setError('API Key 账号需要填写 baseUrl 和 apiKey');
      return;
    }

    options.setBusyId('create');
    options.setError(null);
    try {
      await options.callApi('/api/provider-profiles', {
        method: 'POST',
        body: JSON.stringify(
          createKind === 'acp'
            ? {
                projectPath: options.mutationProjectPath ?? undefined,
                kind: 'acp',
                displayName: createDisplayName.trim(),
                command: createAcpCommand.trim(),
                args: splitCommandArgs(createAcpArgs),
                cwd: createAcpCwd.trim(),
                ...(parseProviderEnvText(createAcpEnvText) ? { env: parseProviderEnvText(createAcpEnvText) } : {}),
                modelAccessMode: createAcpModelAccessMode,
                ...(createAcpModelAccessMode === 'clowder_default_profile' && createAcpModelProfileRef.trim()
                  ? { defaultModelProfileRef: createAcpModelProfileRef.trim() }
                  : {}),
              }
            : {
                projectPath: options.mutationProjectPath ?? undefined,
                displayName: createDisplayName.trim(),
                authType: 'api_key',
                protocol: createProtocol,
                baseUrl: createBaseUrl.trim(),
                apiKey: createApiKey.trim(),
                models: createModels,
              },
        ),
      });
      resetCreateProfileForm();
      await options.refresh();
    } catch (err) {
      options.setError(err instanceof Error ? err.message : String(err));
    } finally {
      options.setBusyId(null);
    }
  }, [
    createAcpArgs,
    createAcpCommand,
    createAcpCwd,
    createAcpEnvText,
    createAcpModelAccessMode,
    createAcpModelProfileRef,
    createApiKey,
    createBaseUrl,
    createDisplayName,
    createKind,
    createModels,
    createProtocol,
    options,
    resetCreateProfileForm,
  ]);

  const createAcpModelProfile = useCallback(async () => {
    if (
      !createAcpModelDisplayName.trim() ||
      !createAcpModel.trim() ||
      !createAcpModelBaseUrl.trim() ||
      !createAcpModelApiKey.trim()
    ) {
      options.setError('ACP Model Profile 需要填写显示名、model、baseUrl、apiKey');
      return;
    }

    options.setBusyId('create-acp-model');
    options.setError(null);
    try {
      await options.callApi('/api/acp-model-profiles', {
        method: 'POST',
        body: JSON.stringify({
          projectPath: options.mutationProjectPath ?? undefined,
          displayName: createAcpModelDisplayName.trim(),
          ...(createAcpModelProvider ? { provider: createAcpModelProvider } : {}),
          model: createAcpModel.trim(),
          baseUrl: createAcpModelBaseUrl.trim(),
          apiKey: createAcpModelApiKey.trim(),
        }),
      });
      resetCreateAcpModelForm();
      await options.refresh();
    } catch (err) {
      options.setError(err instanceof Error ? err.message : String(err));
    } finally {
      options.setBusyId(null);
    }
  }, [
    createAcpModel,
    createAcpModelApiKey,
    createAcpModelBaseUrl,
    createAcpModelDisplayName,
    createAcpModelProvider,
    options,
    resetCreateAcpModelForm,
  ]);

  return {
    providerCreateSectionProps: {
      kind: createKind,
      displayName: createDisplayName,
      protocol: createProtocol,
      baseUrl: createBaseUrl,
      apiKey: createApiKey,
      models: createModels,
      command: createAcpCommand,
      args: createAcpArgs,
      cwd: createAcpCwd,
      envText: createAcpEnvText,
      modelAccessMode: createAcpModelAccessMode,
      defaultModelProfileRef: createAcpModelProfileRef,
      acpModelProfiles: options.acpModelProfiles,
      busy: false,
      onKindChange: setCreateKind,
      onDisplayNameChange: setCreateDisplayName,
      onProtocolChange: setCreateProtocol,
      onBaseUrlChange: setCreateBaseUrl,
      onApiKeyChange: setCreateApiKey,
      onModelsChange: setCreateModels,
      onCommandChange: setCreateAcpCommand,
      onArgsChange: setCreateAcpArgs,
      onCwdChange: setCreateAcpCwd,
      onEnvTextChange: setCreateAcpEnvText,
      onModelAccessModeChange: setCreateAcpModelAccessMode,
      onDefaultModelProfileRefChange: setCreateAcpModelProfileRef,
      onCreate: createProfile,
    },
    acpModelCreateSectionProps: {
      displayName: createAcpModelDisplayName,
      provider: createAcpModelProvider,
      model: createAcpModel,
      baseUrl: createAcpModelBaseUrl,
      apiKey: createAcpModelApiKey,
      busy: false,
      onDisplayNameChange: setCreateAcpModelDisplayName,
      onProviderChange: setCreateAcpModelProvider,
      onModelChange: setCreateAcpModel,
      onBaseUrlChange: setCreateAcpModelBaseUrl,
      onApiKeyChange: setCreateAcpModelApiKey,
      onCreate: createAcpModelProfile,
    },
  };
}
