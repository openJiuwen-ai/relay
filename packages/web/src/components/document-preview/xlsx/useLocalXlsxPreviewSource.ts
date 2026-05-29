/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export type XlsxPreviewLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; contentBase64: string }
  | { status: 'error'; message: string };

type ReadResponse = { error?: string; message?: string; contentBase64?: string };

function messageForFailedBinaryPreview(res: Response, body: ReadResponse | null): string {
  const err = body?.error ?? `HTTP ${res.status}`;
  if (
    res.status === 404 &&
    (err === 'Not Found' || /route .+ not found/i.test(String(body?.message ?? '')))
  ) {
    return '预览服务未就绪：后端未注册文档预览接口。请重启 API（pnpm dev / pnpm start）后再试。';
  }
  return err;
}

async function fetchLocalXlsxBase64(
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
    return { ok: false, message: messageForFailedBinaryPreview(res, body) };
  }
  if (typeof body?.contentBase64 !== 'string' || !body.contentBase64.length) {
    return { ok: false, message: 'Invalid response' };
  }
  return { ok: true, contentBase64: body.contentBase64 };
}

/** Loads .xlsx/.xls/.csv bytes (base64) from `POST /api/projects/read-local-binary-preview` for ExcelJS / CSV preview. */
export function useLocalXlsxPreviewSource(
  resolvedPath: string | null,
  projectPath?: string | null,
  reloadRevision = 0,
): XlsxPreviewLoadState {
  const [state, setState] = useState<XlsxPreviewLoadState>({ status: 'idle' });

  useEffect(() => {
    if (!resolvedPath?.trim()) {
      setState({ status: 'idle' });
      return;
    }
    const path = resolvedPath.trim();
    const ac = new AbortController();
    setState({ status: 'loading' });

    void fetchLocalXlsxBase64(path, projectPath ?? undefined, ac.signal)
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
  }, [resolvedPath, projectPath, reloadRevision]);

  return state;
}
