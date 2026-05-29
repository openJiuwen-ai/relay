/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { apiFetch } from './api-client';
import { downloadBlob } from './protected-resource';

export type ThreadExportTextFormat = 'md' | 'txt';

export async function exportThreadImage(threadId: string): Promise<void> {
  const res = await apiFetch(`/api/threads/${threadId}/export-image`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string; message?: string };
    throw new Error(data.message || data.error || '导出失败');
  }
  const blob = await res.blob();
  downloadBlob(blob, `chat-${threadId}-${Date.now()}.png`);
}

export async function exportThreadText(threadId: string, format: ThreadExportTextFormat): Promise<void> {
  const res = await apiFetch(`/api/export/thread/${threadId}?format=${format}`);
  if (!res.ok) {
    const data = (await res.json()) as { error?: string; message?: string };
    throw new Error(data.message || data.error || '导出失败');
  }
  const text = await res.text();
  const ext = format === 'md' ? 'md' : 'txt';
  const mime = format === 'md' ? 'text/markdown' : 'text/plain';
  const blob = new Blob([text], { type: `${mime}; charset=utf-8` });
  downloadBlob(blob, `thread-${threadId}.${ext}`);
}
