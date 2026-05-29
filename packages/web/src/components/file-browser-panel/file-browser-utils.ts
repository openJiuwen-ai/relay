/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { apiFetch } from '@/utils/api-client';
import { useToastStore } from '@/stores/toastStore';

export function resolveFolderPath(path: string): string {
  const norm = path.replace(/\\/g, '/');
  const idx = Math.max(norm.lastIndexOf('/'), norm.lastIndexOf('\\'));
  if (idx <= 0) return path;
  return path.slice(0, idx) || path;
}

export async function openLocalProjectFolder(folderPath: string, projectPath?: string): Promise<void> {
  try {
    const res = await apiFetch('/api/projects/open-local-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: folderPath,
        ...(projectPath ? { projectPath } : {}),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      useToastStore.getState().addToast({
        type: 'error',
        title: '打开文件夹失败',
        message: data?.error || `HTTP ${res.status}`,
        duration: 5000,
      });
    }
  } catch (err) {
    useToastStore.getState().addToast({
      type: 'error',
      title: '打开文件夹失败',
      message: err instanceof Error ? err.message : '未知错误',
      duration: 5000,
    });
  }
}

export async function openLocalProjectFile(filePath: string, projectPath?: string): Promise<void> {
  try {
    const res = await apiFetch('/api/projects/open-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: filePath,
        ...(projectPath ? { projectPath } : {}),
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      useToastStore.getState().addToast({
        type: 'error',
        title: '打开文件失败',
        message: data?.error || `HTTP ${res.status}`,
        duration: 5000,
      });
    }
  } catch (err) {
    useToastStore.getState().addToast({
      type: 'error',
      title: '打开文件失败',
      message: err instanceof Error ? err.message : '未知错误',
      duration: 5000,
    });
  }
}
