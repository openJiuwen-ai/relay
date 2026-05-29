/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  extractPptxHtmlPagesFromWriteFile,
  extractPptxPagesMarkerDirsFromCliEvents,
} from '@/components/ppt-studio/pptx-pages-artifact';
import type { CliEvent, CliStatus } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

function normalizePptPagesDir(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function useSyncCliOutputPptPreview({
  events,
  status,
  currentThreadId,
  workspaceWorktreeId: _workspaceWorktreeId,
}: {
  events: CliEvent[];
  status: CliStatus;
  currentThreadId: string;
  workspaceWorktreeId: string | null;
}): { pagesDir: string }[] {
  void _workspaceWorktreeId;
  const [defaultProjectRoot, setDefaultProjectRoot] = useState<string | null>(null);
  const pptHtmlPages = useMemo(() => extractPptxHtmlPagesFromWriteFile(events), [events]);
  const pptPageMarkers = useMemo(() => extractPptxPagesMarkerDirsFromCliEvents(events), [events]);
  const hasPptPreviewSignal = pptHtmlPages.length > 0 || pptPageMarkers.length > 0;

  const pptHtmlPagesKey = useMemo(() => {
    return pptHtmlPages
      .map((p) => {
        const filesKey = p.htmlFiles
          .map((f) => `${f.filePath}-${f.pageNumber}-${f.lastTouchedAt}`)
          .join(',');
        return `${p.pagesDir}:${filesKey}`;
      })
      .join('|');
  }, [pptHtmlPages]);

  const pptPageMarkersKey = useMemo(() => {
    return pptPageMarkers.map((m) => `${m.pagesDir}:${m.expectedSlideCount ?? ''}`).join('|');
  }, [pptPageMarkers]);

  const threads = useChatStore((s) => s.threads);

  useEffect(() => {
    let cancelled = false;
    const thread = threads.find((t) => t.id === currentThreadId);
    if (!thread || (thread.projectPath && thread.projectPath !== 'default')) {
      setDefaultProjectRoot(null);
      return;
    }
    if (!hasPptPreviewSignal) return;

    async function loadDefaultProjectRoot(): Promise<void> {
      try {
        const response = await apiFetch('/api/projects/cwd');
        if (!response.ok) return;
        const payload = (await response.json()) as { path?: string };
        if (!cancelled && typeof payload.path === 'string' && payload.path.trim()) {
          setDefaultProjectRoot(payload.path.trim());
        }
      } catch {
        if (!cancelled) setDefaultProjectRoot(null);
      }
    }

    void loadDefaultProjectRoot();
    return () => {
      cancelled = true;
    };
  }, [currentThreadId, hasPptPreviewSignal, threads]);

  useEffect(() => {
    if (!hasPptPreviewSignal) return;

    const store = useChatStore.getState();
    const thread = threads.find((t) => t.id === currentThreadId);
    const threadProjectRoot = thread?.projectPath && thread.projectPath !== 'default' ? thread.projectPath : defaultProjectRoot;
    if (!threadProjectRoot) return;

    for (const { pagesDir, htmlFiles } of pptHtmlPages) {
      const normalizedPagesDir = normalizePptPagesDir(pagesDir);

      let existing = store.pptStudioSessions[pagesDir];
      let resolvedPagesDir = pagesDir;

      if (!existing) {
        const matchedEntry = Object.entries(store.pptStudioSessions).find(([key]) => {
          const normalizedKey = normalizePptPagesDir(key);
          return normalizedKey.endsWith(normalizedPagesDir) || normalizedPagesDir.endsWith(normalizedKey);
        });
        if (matchedEntry) {
          resolvedPagesDir = matchedEntry[0];
          existing = matchedEntry[1];
        }
      }

      const maxPage = htmlFiles.length > 0 ? Math.max(...htmlFiles.map((f) => f.pageNumber)) : 0;
      const markerForDir = pptPageMarkers.find(
        (m) => normalizePptPagesDir(m.pagesDir) === normalizedPagesDir,
      );
      const markerPlan = markerForDir?.expectedSlideCount;
      /** 有 artifact `count:` 时以计划页数为准（含 10→5 缩减），否则单调递增避免流式阶段误裁掉未生成页。 */
      const cliExpectedSlideCount =
        markerPlan != null && markerPlan > 0 && !Number.isNaN(markerPlan)
          ? Math.max(markerPlan, maxPage)
          : Math.max(existing?.expectedSlideCount ?? 0, maxPage);

      const slides = htmlFiles.map(({ filePath, pageNumber, lastTouchedAt }) => ({
        slideId: `slide-${pageNumber}`,
        pageNumber,
        htmlPath: filePath,
        title: null,
        blockCount: null,
        updatedAt: lastTouchedAt,
        url: null,
        sha256: null,
      }));

      store.upsertPptStudioSlides(
        currentThreadId,
        {
          projectRoot: threadProjectRoot,
          pagesDir: resolvedPagesDir,
          deckTitle: existing?.deckTitle ?? '',
          expectedSlideCount: cliExpectedSlideCount,
          status: existing?.status ?? 'generating',
          slides,
        },
        { source: status === 'streaming' ? 'live' : 'recovery' },
      );
    }

    for (const { pagesDir, expectedSlideCount } of pptPageMarkers) {
      if (store.pptStudioSessions[pagesDir]) continue;
      store.upsertPptStudioSlides(
        currentThreadId,
        {
          projectRoot: threadProjectRoot,
          pagesDir,
          deckTitle: '',
          ...(expectedSlideCount !== undefined ? { expectedSlideCount } : {}),
          status: 'generating',
          slides: [],
        },
        { source: status === 'streaming' ? 'live' : 'recovery' },
      );
    }
  }, [currentThreadId, defaultProjectRoot, hasPptPreviewSignal, pptHtmlPagesKey, pptPageMarkersKey, status, threads]);

  return [
    ...pptHtmlPages.map((p) => ({ pagesDir: p.pagesDir })),
    ...pptPageMarkers.map((p) => ({ pagesDir: p.pagesDir })),
  ];
}
