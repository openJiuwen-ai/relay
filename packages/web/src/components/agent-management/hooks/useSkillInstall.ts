/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback } from 'react';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';
import { useToastStore } from '@/stores/toastStore';

interface UseSkillInstallOptions {
  onInstallSuccess?: (skill: string) => void;
  onInstallError?: (skill: string, error: string) => void;
}

interface UseSkillInstallResult {
  handleInstall: (
    owner: string,
    repo: string,
    skill: string,
    skillDescription: string,
    skillVersion: string,
  ) => Promise<void>;
}

export function useSkillInstall({
  onInstallSuccess,
  onInstallError,
}: UseSkillInstallOptions = {}): UseSkillInstallResult {
  const handleInstall = useCallback(
    async (
      owner: string,
      repo: string,
      skill: string,
      skillDescription: string,
      skillVersion: string,
    ) => {
      try {
        const res = await apiFetch('/api/skills/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner,
            repo,
            skill,
            description: skillDescription,
            version: skillVersion,
          }),
        });
        if (res.ok) {
          notifySkillOptionsChanged();
          useToastStore.getState().addToast({
            type: 'success',
            title: '安装成功',
            message: `"${skill}" 安装成功，可在我的技能中查看`,
            duration: 4000,
          });
          onInstallSuccess?.(skill);
        } else {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          const detail = payload.error ?? `HTTP ${res.status}`;
          useToastStore.getState().addToast({
            type: 'error',
            title: '安装失败',
            message: detail,
            duration: 4000,
          });
          onInstallError?.(skill, detail);
        }
      } catch {
        useToastStore.getState().addToast({
          type: 'error',
          title: '安装失败',
          message: '网络错误，请重试',
          duration: 4000,
        });
        onInstallError?.(skill, '网络错误，请重试');
      }
    },
    [onInstallSuccess, onInstallError],
  );

  return { handleInstall };
}