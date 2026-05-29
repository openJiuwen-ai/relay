/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function getWorkspacePathFromDownloadUrl(url: string): string | null {
  if (!url.startsWith('/api/workspace/download?') && !url.startsWith('/api/workspace/file/raw?')) return null;
  const query = url.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const path = params.get('path');
  return path ? decodeURIComponent(path) : null;
}

export function getFileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
}
