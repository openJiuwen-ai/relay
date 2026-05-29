/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export type EmbeddedTextPreviewLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; content: string }
  | { status: 'error'; message: string };

type ReadResponse = { error?: string; content?: string };

const INSPIRATION_PRODUCT_API_PREFIX = '/api/inspiration/products/';

function isInspirationProductApiPath(path: string): boolean {
  return path.startsWith(INSPIRATION_PRODUCT_API_PREFIX);
}

async function fetchApiPreviewText(
  path: string,
  signal: AbortSignal,
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  const res = await apiFetch(path, { signal });
  if (!res.ok) {
    return { ok: false, message: `HTTP ${res.status}` };
  }
  return { ok: true, content: await res.text() };
}

async function fetchLocalPreviewText(
  path: string,
  projectPath: string | undefined,
  signal: AbortSignal,
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  const res = await apiFetch('/api/projects/read-local-text', {
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
    return { ok: false, message: body?.error ?? `HTTP ${res.status}` };
  }
  if (typeof body?.content !== 'string') {
    return { ok: false, message: 'Invalid response' };
  }
  return { ok: true, content: body.content };
}

/** UTF-8 bodies from `POST /api/projects/read-local-text` (Markdown / HTML / txt, …). */
export function useEmbeddedTextPreviewSource(
  resolvedPath: string | null,
  projectPath?: string | null,
  reloadRevision = 0,
  /** 用户点击「刷新」等触发的递增键，便于重新请求磁盘正文 */
  refreshNonce = 0,
): EmbeddedTextPreviewLoadState {
  const [state, setState] = useState<EmbeddedTextPreviewLoadState>({ status: 'idle' });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadRevision / refreshNonce 需触发重新读取磁盘
  useEffect(() => {
    if (!resolvedPath?.trim()) {
      setState({ status: 'idle' });
      return;
    }
    const path = resolvedPath.trim();
    const ac = new AbortController();
    setState({ status: 'loading' });

    const load = isInspirationProductApiPath(path)
      ? fetchApiPreviewText(path, ac.signal)
      : fetchLocalPreviewText(path, projectPath ?? undefined, ac.signal);

    void load
      .then((result) => {
        if (ac.signal.aborted) return;
        if (!result.ok) {
          setState({ status: 'error', message: result.message });
          return;
        }
        setState({ status: 'ok', content: result.content });
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : 'Request failed' });
      });

    return () => ac.abort();
  }, [resolvedPath, projectPath, reloadRevision, refreshNonce]);

  return state;
}
