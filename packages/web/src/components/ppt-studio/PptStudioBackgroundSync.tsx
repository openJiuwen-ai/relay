/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { normalizePptStudioApiQuery } from '@/stores/ppt-preview-store-helpers';
import { apiFetch } from '@/utils/api-client';
import type { PptStudioSlide } from './ppt-studio-types';

interface PptStudioSessionResponse {
  pagesDir: string;
  deckTitle: string;
  status: 'generating' | 'editable' | 'error';
  slides: PptStudioSlide[];
}

export function PptStudioBackgroundSync() {
  const currentThreadId = useChatStore((state) => state.currentThreadId);
  // 获取当前 thread 的所有 PPT Sessions
  const sessionsForThread = useChatStore((state) =>
    Object.values(state.pptStudioSessions ?? {}).filter((s) => s.threadId === state.currentThreadId),
  );
  const upsertPptStudioSlides = useChatStore((state) => state.upsertPptStudioSlides);

  useEffect(() => {
    const unresolvedSessions = sessionsForThread.filter((s) => !s.projectRoot?.trim() && s.pagesDir);
    if (unresolvedSessions.length === 0) return;
    let cancelled = false;

    async function hydrateProjectRoot(): Promise<void> {
      try {
        const res = await apiFetch('/api/projects/cwd');
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { path?: string };
        const projectRoot = typeof body.path === 'string' && body.path.trim() ? body.path.trim() : null;
        if (!projectRoot || cancelled) return;
        for (const session of unresolvedSessions) {
          upsertPptStudioSlides(currentThreadId, {
            projectRoot,
            pagesDir: session.pagesDir,
            deckTitle: session.deckTitle,
            expectedSlideCount: session.expectedSlideCount,
            status: session.status,
            slides: session.slides,
          });
        }
      } catch {
        // Best-effort recovery for default-project background sessions.
      }
    }

    void hydrateProjectRoot();
    return () => {
      cancelled = true;
    };
  }, [
    currentThreadId,
    upsertPptStudioSlides,
    sessionsForThread
      .filter((s) => !s.projectRoot?.trim())
      .map((s) => s.pagesDir)
      .join(','),
  ]);

  // 每个已绑定 projectRoot 的 Session 仅做一次磁盘快照同步（标题/block 等元数据）。
  // 幻灯片内容与刷新由 CLI 中 write_file / edit_file 等工具事件驱动，避免轮询导致 iframe 反复重载闪烁。
  useEffect(() => {
    const resolvedSessions = sessionsForThread.filter((s) => s.projectRoot?.trim() && s.pagesDir);
    if (resolvedSessions.length === 0) return;
    let cancelled = false;

    const syncAll = async () => {
      for (const session of resolvedSessions) {
        if (cancelled) break;
        try {
          const { projectRoot: apiRoot, pagesDir: apiPages } = normalizePptStudioApiQuery(
            session.projectRoot!,
            session.pagesDir,
          );
          const params = new URLSearchParams({
            projectRoot: apiRoot,
            pagesDir: apiPages,
          });
          const res = await apiFetch(`/api/ppt-studio/session?${params.toString()}`);
          if (!res.ok || cancelled) continue;
          const body = (await res.json()) as PptStudioSessionResponse;
          if (cancelled) break;
          const diskMaxPage =
            body.slides.length > 0 ? Math.max(...body.slides.map((s) => s.pageNumber)) : 0;
          upsertPptStudioSlides(
            currentThreadId,
            {
              projectRoot: session.projectRoot,
              // 保持 store 里原始 of pagesDir key，避免 API 返回的路径格式不同导致重复 session
              pagesDir: session.pagesDir,
              deckTitle: body.deckTitle,
              status: body.status,
              expectedSlideCount: diskMaxPage,
              slides: body.slides.map((s) => ({
                ...s,
                slideId: `slide-${s.pageNumber}`,
              })),
            },
            { slideMerge: 'replace', source: 'live' },
          );
        } catch {
          // Ignore errors
        }
      }
    };

    void syncAll();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentThreadId,
    upsertPptStudioSlides,
    sessionsForThread
      .filter((s) => s.projectRoot?.trim())
      .map((s) => {
        const maxPn = s.slides.length > 0 ? Math.max(...s.slides.map((x) => x.pageNumber)) : 0;
        return `${s.projectRoot}:${s.pagesDir}:${s.slides.length}:${maxPn}:${s.expectedSlideCount ?? ''}`;
      })
      .join('|'),
  ]);

  return null;
}
