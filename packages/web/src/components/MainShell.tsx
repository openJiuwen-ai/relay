/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type DragEvent, lazy, Suspense, useCallback } from 'react';
import {
  RightContentHeaderOverrideProvider,
  useCurrentRightContentHeaderOverride,
} from '@/components/RightContentHeaderOverrideContext';

const RightContentHeader = lazy(async () => {
  const mod = await import('@/components/RightContentHeader');
  return { default: mod.RightContentHeader };
});

const ThreadSidebar = lazy(async () => {
  const mod = await import('@/components/thread-sidebar');
  return { default: mod.ThreadSidebar };
});

function MainShellLayout({ children }: { children: React.ReactNode }) {
  const hasDraggedFiles = useCallback((event: DragEvent<HTMLElement>) => {
    if ((event.dataTransfer?.files?.length ?? 0) > 0) return true;
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes('Files') || types.includes('application/x-moz-file') || types.includes('public.file-url');
  }, []);
  const headerOverride = useCurrentRightContentHeaderOverride();

  const handleSidebarDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      // Block browser default behavior (open/download) when dragging files over sidebar.
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
    },
    [hasDraggedFiles],
  );

  const handleSidebarDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
    },
    [hasDraggedFiles],
  );

  return (
    <div className="ui-shell-surface flex h-dvh max-h-dvh w-full min-h-0 overflow-hidden">
      <Suspense
        fallback={<div className="h-full shrink-0" onDragOver={handleSidebarDragOver} onDrop={handleSidebarDrop} />}
      >
        <ThreadSidebar className="h-full shrink-0" />
      </Suspense>
      <div className="chat-layout-container flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={
            <div
              data-chat-drop-scope="true"
              className="chat-layout-container relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            />
          }
        >
          <RightContentHeader {...(headerOverride ?? {})} />
        </Suspense>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function MainShell({ children }: { children: React.ReactNode }) {
  return (
    <RightContentHeaderOverrideProvider>
      <MainShellLayout>{children}</MainShellLayout>
    </RightContentHeaderOverrideProvider>
  );
}
