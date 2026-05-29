/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import type { AcpModelProfileEditPayload } from './HubAcpModelProfileItem';
import type { ProfileEditPayload } from './HubProviderProfileItem';
import type { AcpModelProfilesResponse, ProfileItem, ProviderProfilesResponse } from './hub-provider-profiles.types';
import { ensureBuiltinProviderProfiles, resolveAccountActionId } from './hub-provider-profiles.view';
import { useProviderProfilesCreateSections } from './useProviderProfilesCreateSections';

export function useProviderProfilesState() {
  const currentProjectPath = useChatStore((s) => s.currentProjectPath);
  const threadProjectPath = currentProjectPath && currentProjectPath !== 'default' ? currentProjectPath : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProviderProfilesResponse | null>(null);
  const [acpModelData, setAcpModelData] = useState<AcpModelProfilesResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const requestProjectPath = threadProjectPath;
  const mutationProjectPath = data?.projectPath ?? threadProjectPath;

  const callApi = useCallback(async (path: string, init: RequestInit) => {
    const res = await apiFetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error((body.error as string) ?? `请求失败 (${res.status})`);
    }
    return body;
  }, []);

  const fetchAll = useCallback(async (projectPath?: string) => {
    setError(null);
    try {
      const query = new URLSearchParams();
      if (projectPath) query.set('projectPath', projectPath);
      const [providerRes, acpModelRes] = await Promise.all([
        apiFetch(`/api/provider-profiles?${query.toString()}`),
        apiFetch(`/api/acp-model-profiles?${query.toString()}`),
      ]);
      if (!providerRes.ok) {
        const body = (await providerRes.json().catch(() => ({}))) as Record<string, unknown>;
        setError((body.error as string) ?? '加载失败');
        return;
      }
      if (!acpModelRes.ok) {
        const body = (await acpModelRes.json().catch(() => ({}))) as Record<string, unknown>;
        setError((body.error as string) ?? '加载失败');
        return;
      }
      setData((await providerRes.json()) as ProviderProfilesResponse);
      setAcpModelData((await acpModelRes.json()) as AcpModelProfilesResponse);
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchAll(requestProjectPath ?? undefined);
  }, [fetchAll, requestProjectPath]);

  const refresh = useCallback(async () => {
    await fetchAll(mutationProjectPath ?? undefined);
  }, [fetchAll, mutationProjectPath]);

  const deleteProfile = useCallback(
    async (profileId: string) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/provider-profiles/${profileId}`, {
          method: 'DELETE',
          body: JSON.stringify({ projectPath: mutationProjectPath ?? undefined }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const saveProfile = useCallback(
    async (profileId: string, payload: ProfileEditPayload) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/provider-profiles/${profileId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            projectPath: mutationProjectPath ?? undefined,
            ...payload,
          }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const testProfile = useCallback(
    async (profileId: string) => {
      setBusyId(`${profileId}:test`);
      setError(null);
      try {
        await callApi(`/api/provider-profiles/${profileId}/test`, {
          method: 'POST',
          body: JSON.stringify({ projectPath: mutationProjectPath ?? undefined }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath],
  );

  const saveAcpModelProfile = useCallback(
    async (profileId: string, payload: AcpModelProfileEditPayload) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/acp-model-profiles/${profileId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            projectPath: mutationProjectPath ?? undefined,
            ...payload,
          }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const deleteAcpModelProfile = useCallback(
    async (profileId: string) => {
      setBusyId(profileId);
      setError(null);
      try {
        await callApi(`/api/acp-model-profiles/${profileId}`, {
          method: 'DELETE',
          body: JSON.stringify({ projectPath: mutationProjectPath ?? undefined }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [callApi, mutationProjectPath, refresh],
  );

  const displayProfiles = useMemo(
    () => ensureBuiltinProviderProfiles(data?.providers ?? [], data?.visibleBuiltinClients),
    [data?.providers, data?.visibleBuiltinClients],
  );
  const builtinProfiles = useMemo(() => displayProfiles.filter((profile) => profile.builtin), [displayProfiles]);
  const customProfiles = useMemo(() => displayProfiles.filter((profile) => !profile.builtin), [displayProfiles]);

  const displayCards = useMemo(() => [...builtinProfiles, ...customProfiles], [builtinProfiles, customProfiles]);
  const acpModelProfiles = acpModelData?.profiles ?? [];
  const { providerCreateSectionProps, acpModelCreateSectionProps } = useProviderProfilesCreateSections({
    acpModelProfiles,
    mutationProjectPath,
    callApi,
    refresh,
    setBusyId,
    setError,
  });

  const isProfileBusy = useCallback(
    (profile: ProfileItem) =>
      busyId === resolveAccountActionId(profile) || busyId === `${resolveAccountActionId(profile)}:test`,
    [busyId],
  );

  return {
    loading,
    error,
    data,
    busyId,
    displayCards,
    acpModelProfiles,
    isProfileBusy,
    providerCreateSectionProps: {
      ...providerCreateSectionProps,
      busy: busyId === 'create',
    },
    acpModelCreateSectionProps: {
      ...acpModelCreateSectionProps,
      busy: busyId === 'create-acp-model',
    },
    saveProfile,
    deleteProfile,
    testProfile,
    saveAcpModelProfile,
    deleteAcpModelProfile,
  };
}
