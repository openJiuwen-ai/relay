/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { inferLocalGeneratedFileKind } from '@/components/cli-output/local-generated-files';
import { apiFetch } from '@/utils/api-client';
import type { FileBrowserEntry } from './file-browser-panel-types';

interface ListFilesResponse {
  path: string;
  entries: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    extension: string;
  }>;
}

export type WorkspaceFilesStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface WorkspaceFilesResult {
  entries: FileBrowserEntry[];
  status: WorkspaceFilesStatus;
  reload: () => void;
}

/**
 * Fetches the flat file+directory listing for a workspace path via
 * GET /api/projects/list-files?path=&maxDepth=2
 */
export function useWorkspaceFiles(projectPath: string): WorkspaceFilesResult {
  const [entries, setEntries] = useState<FileBrowserEntry[]>([]);
  const [status, setStatus] = useState<WorkspaceFilesStatus>('idle');
  const reloadCounterRef = useRef(0);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!projectPath || projectPath === 'default') {
      setEntries([]);
      setStatus('idle');
      return;
    }

    setStatus('loading');
    const controller = new AbortController();

    const params = new URLSearchParams({ path: projectPath, maxDepth: '4' });
    apiFetch(`/api/projects/list-files?${params.toString()}`, {
      method: 'GET',
      signal: controller.signal,
      timeoutMs: 15_000,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ListFilesResponse;
        const mapped: FileBrowserEntry[] = (data.entries ?? []).map((e) => ({
          name: e.name,
          path: e.path,
          isDirectory: e.isDirectory,
          kind: e.isDirectory ? 'other' : inferLocalGeneratedFileKind(e.path, e.name),
        }));
        setEntries(mapped);
        setStatus('loaded');
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return;
        setStatus('error');
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, reloadTick]);

  const reload = useCallback(() => {
    reloadCounterRef.current += 1;
    setReloadTick(reloadCounterRef.current);
  }, []);

  return { entries, status, reload };
}
