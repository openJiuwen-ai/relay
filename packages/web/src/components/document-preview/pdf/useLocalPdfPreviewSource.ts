/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export type PdfPreviewLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; contentBase64: string }
  | { status: 'error'; message: string };

type ReadResponse = { error?: string; message?: string; contentBase64?: string };

async function fetchLocalPdfBase64(
  path: string,
  projectPath: string | undefined,
  signal: AbortSignal,
): Promise<{ ok: true; contentBase64: string } | { ok: false; message: string }> {
  const res = await apiFetch('/api/projects/read-local-binary-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path,
      ...(projectPath && projectPath !== 'default' ? { projectPath } : {}),
    }),
    signal,
  });
  const body = (await res.json().catch(() => null)) as ReadResponse | null;
  if (!res.ok) {
    const err = body?.error ?? `HTTP ${res.status}`;
    return { ok: false, message: err };
  }
  if (typeof body?.contentBase64 !== 'string' || !body.contentBase64.length) {
    return { ok: false, message: 'Invalid response' };
  }
  return { ok: true, contentBase64: body.contentBase64 };
}

/** Loads .pdf bytes (base64) from `POST /api/projects/read-local-binary-preview`. */
export function useLocalPdfPreviewSource(
  resolvedPath: string | null,
  projectPath?: string | null,
  reloadRevision = 0,
  /** 用户点击「刷新」等触发的递增键，便于重新请求磁盘正文 */
  refreshNonce = 0,
): PdfPreviewLoadState {
  const [state, setState] = useState<PdfPreviewLoadState>({ status: 'idle' });

  useEffect(() => {
    if (!resolvedPath?.trim()) {
      setState({ status: 'idle' });
      return;
    }
    const path = resolvedPath.trim();
    const ac = new AbortController();
    setState({ status: 'loading' });

    void fetchLocalPdfBase64(path, projectPath ?? undefined, ac.signal)
      .then((result) => {
        if (ac.signal.aborted) return;
        if (!result.ok) {
          setState({ status: 'error', message: result.message });
          return;
        }
        setState({ status: 'ok', contentBase64: result.contentBase64 });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : 'Request failed' });
      });

    return () => ac.abort();
  }, [resolvedPath, projectPath, reloadRevision, refreshNonce]);

  return state;
}
