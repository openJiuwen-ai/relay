/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { apiFetch, API_URL } from './api-client';

function resolveProtectedApiPath(url: string): string | null {
  if (url.startsWith('/uploads/') || url.startsWith('/api/')) {
    return url;
  }

  if ((url.startsWith(`${API_URL}/uploads/`) || url.startsWith(`${API_URL}/api/`)) && url.length > API_URL.length) {
    return url.slice(API_URL.length);
  }

  return null;
}

export function isProtectedResourceUrl(url: string): boolean {
  return resolveProtectedApiPath(url) !== null;
}

export async function fetchProtectedResource(url: string, init?: RequestInit): Promise<Response> {
  const path = resolveProtectedApiPath(url);
  if (path) {
    return apiFetch(path, init);
  }
  return fetch(url, init);
}

export async function fetchProtectedResourceBlob(url: string, init?: RequestInit): Promise<Blob> {
  const res = await fetchProtectedResource(url, init);
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status}`);
  }
  return res.blob();
}

export async function downloadProtectedResource(url: string, filename: string): Promise<void> {
  const blob = await fetchProtectedResourceBlob(url);
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
