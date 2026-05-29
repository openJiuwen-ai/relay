/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LocalGeneratedFile } from '@/components/cli-output/local-generated-files';
import { FileBrowserPanel } from '@/components/file-browser-panel/FileBrowserPanel';
import { usePersistedState } from '@/hooks/usePersistedState';
import { MAIN_PANEL_MIN_WIDTH } from '@/shared/constants';
import { useChatStore } from '@/stores/chatStore';
import { ResizeHandle } from '../workspace/ResizeHandle';
import type { PptMessageContext, PptStudioSession } from '../ppt-studio/ppt-studio-types';

type SecondaryPaneMode = 'status' | 'workspace' | 'pptStudio' | 'outlinePreview' | 'fileBrowser';

interface PptPreviewChatState {
  activePptPagesDir: string | null;
  pptStudioSessions: Record<string, PptStudioSession>;
}

/** Shared width for PPT Studio + embedded document preview */
const DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY = 'office-claw:documentPreviewPanelWidth';
const PPT_STUDIO_PANEL_WIDTH_LEGACY_KEY = 'cat-cafe:pptStudioPanelWidth';
const PPT_STUDIO_PANEL_WIDTH_V2_LEGACY_KEY = 'cat-cafe:pptStudioPanelWidthV2';
const LEGACY_DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY = 'cat-cafe:documentPreviewPanelWidth';
/** Hydration / SSR 占位；首帧可用宽度由 ResizeObserver 写成约 50% */
const PPT_STUDIO_PANEL_FALLBACK_WIDTH = 720;
/** Minimum resizable width for PPT / document / unified file-browser preview — fits tab bar (三中文 Tab + 操作图标) on one row. */
const PPT_STUDIO_PANEL_MIN_WIDTH = 432;
const PPT_STUDIO_PANEL_MAX_WIDTH = 1600;
const LEGACY_DEFAULT_SNAP_WIDTH = 1320;
/**
 * 仅当视口无法再同时容纳「最小聊天栏 + 最小预览栏」时再隐藏聊天（全宽预览）。
 * 此前用固定 1280px，浏览器侧栏/开发者工具压低 `innerWidth` 时常误触发。
 */
const PREVIEW_FULL_WIDTH_STACK_BREAKPOINT_PX = MAIN_PANEL_MIN_WIDTH + PPT_STUDIO_PANEL_MIN_WIDTH + 40;

export function selectCurrentPptSession(state: PptPreviewChatState, threadId: string): PptStudioSession | null {
  const sessions = state.pptStudioSessions ?? {};
  const active = state.activePptPagesDir ? sessions[state.activePptPagesDir] : null;
  if (active && active.threadId === threadId) return active;
  const sessionsForThread = Object.values(sessions).filter((session) => session.threadId === threadId);
  return sessionsForThread[sessionsForThread.length - 1] ?? null;
}

export function buildPptMessageContext(session: PptStudioSession | null | undefined): PptMessageContext | undefined {
  if (!session?.pagesDir) return undefined;
  if (!session.projectRoot?.trim()) return undefined;
  return {
    projectRoot: session.projectRoot.trim(),
    pagesDir: session.pagesDir,
    ...(session.deckTitle ? { deckTitle: session.deckTitle } : {}),
  };
}

function clampPptStudioPanelWidth(width: number, containerWidth: number): number {
  if (containerWidth <= 0) {
    return Math.min(PPT_STUDIO_PANEL_MAX_WIDTH, Math.max(PPT_STUDIO_PANEL_MIN_WIDTH, width));
  }
  const maxWidthFromViewport = Math.max(0, containerWidth - MAIN_PANEL_MIN_WIDTH);
  const cappedMax = Math.min(PPT_STUDIO_PANEL_MAX_WIDTH, maxWidthFromViewport);
  return Math.max(PPT_STUDIO_PANEL_MIN_WIDTH, Math.min(width, cappedMax));
}

function migrateSidePreviewPanelWidthStorageOnce(): void {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem(DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY) !== null) return;
    const legacyDoc = localStorage.getItem(LEGACY_DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY);
    if (legacyDoc !== null) {
      localStorage.setItem(DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY, legacyDoc);
      try {
        localStorage.removeItem(LEGACY_DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const v2 = localStorage.getItem(PPT_STUDIO_PANEL_WIDTH_V2_LEGACY_KEY);
    if (v2 !== null) {
      localStorage.setItem(DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY, v2);
      return;
    }
    const legacyRaw = localStorage.getItem(PPT_STUDIO_PANEL_WIDTH_LEGACY_KEY);
    if (legacyRaw === null) return;
    const legacy = Number(legacyRaw);
    if (!Number.isFinite(legacy) || legacy === LEGACY_DEFAULT_SNAP_WIDTH) return;
    localStorage.setItem(DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY, String(legacy));
  } catch {
    /* ignore */
  }
}

export function useCurrentPptSession(threadId: string): PptStudioSession | null {
  return useChatStore((state) => selectCurrentPptSession(state, threadId));
}

export function usePptMessageContext(session: PptStudioSession | null | undefined): PptMessageContext | undefined {
  return useMemo(() => buildPptMessageContext(session), [session]);
}

export function usePreviewPaneLayout(rightPanelMode: SecondaryPaneMode) {
  const didRunWidthMigrationRef = useRef(false);
  if (typeof window !== 'undefined' && !didRunWidthMigrationRef.current) {
    didRunWidthMigrationRef.current = true;
    migrateSidePreviewPanelWidthStorageOnce();
  }
  const [pptStudioPanelWidth, setPptStudioPanelWidth] = usePersistedState(
    DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY,
    PPT_STUDIO_PANEL_FALLBACK_WIDTH,
  );
  const [windowWidth, setWindowWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSplitPreviewLayout = rightPanelMode === 'pptStudio' || rightPanelMode === 'outlinePreview' || rightPanelMode === 'fileBrowser';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncWindowWidth = () => setWindowWidth(window.innerWidth);
    syncWindowWidth();
    window.addEventListener('resize', syncWindowWidth);
    return () => window.removeEventListener('resize', syncWindowWidth);
  }, [setWindowWidth]);

  const isCompactPreviewLayout =
    (rightPanelMode === 'pptStudio' || rightPanelMode === 'fileBrowser' || rightPanelMode === 'outlinePreview') &&
    windowWidth > 0 &&
    windowWidth < PREVIEW_FULL_WIDTH_STACK_BREAKPOINT_PX;

  const clampWidth = useCallback(
    (width: number) => clampPptStudioPanelWidth(width, containerRef.current?.clientWidth ?? 0),
    [],
  );

  const handlePptStudioPanelResize = useCallback(
    (delta: number) => {
      setPptStudioPanelWidth((prev) => clampWidth(prev - delta));
    },
    [clampWidth, setPptStudioPanelWidth],
  );

  const resetPptStudioPanelWidth = useCallback(() => {
    const cw = containerRef.current?.clientWidth ?? 0;
    const half = clampPptStudioPanelWidth(Math.round(cw * 0.5), cw);
    setPptStudioPanelWidth(half);
  }, [setPptStudioPanelWidth]);

  useEffect(() => {
    if (rightPanelMode !== 'pptStudio' && rightPanelMode !== 'fileBrowser' && rightPanelMode !== 'outlinePreview')
      return;
    const el = containerRef.current;
    if (!el) return;

    const syncFromContainer = () => {
      const cw = el.clientWidth;
      if (cw <= 0) return;
      try {
        if (localStorage.getItem(DOCUMENT_PREVIEW_SIDE_PANEL_WIDTH_KEY) === null) {
          const half = clampPptStudioPanelWidth(Math.round(cw * 0.5), cw);
          setPptStudioPanelWidth(half);
          return;
        }
      } catch {
        /* ignore */
      }
      setPptStudioPanelWidth((prev) => clampPptStudioPanelWidth(prev, cw));
    };

    syncFromContainer();
    const ro = new ResizeObserver(syncFromContainer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rightPanelMode, setPptStudioPanelWidth]);

  return {
    containerRef,
    pptStudioPaneWidth: isCompactPreviewLayout
      ? undefined
      : rightPanelMode === 'pptStudio' || rightPanelMode === 'fileBrowser' || rightPanelMode === 'outlinePreview'
        ? clampWidth(pptStudioPanelWidth)
        : undefined,
    isCompactPreviewLayout,
    handlePptStudioPanelResize,
    resetPptStudioPanelWidth,
  };
}

interface PreviewSecondaryPaneProps {
  rightPanelMode: SecondaryPaneMode;
  pptStudioPaneWidth?: number;
  isCompactPreviewLayout?: boolean;
  onResize: (delta: number) => void;
  onReset: () => void;
  /** 主内容区（会话 + 侧栏）根节点，用于 PPT 全屏时限制在侧栏与顶栏之外的主区域内，不遮挡左侧 ThreadSidebar */
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  /** Artifacts (send_file_to_user) for the current thread — required for fileBrowser mode. */
  artifacts?: LocalGeneratedFile[];
  /** Thread workspace root path — required for fileBrowser mode. */
  projectPath?: string;
  /** Thread id — required for fileBrowser mode. */
  threadId?: string;
  /** Called when the file browser panel close button is clicked. */
  onCloseFileBrowser?: () => void;
}

export function PreviewSecondaryPane({
  rightPanelMode,
  pptStudioPaneWidth,
  isCompactPreviewLayout = false,
  onResize,
  onReset,
  fullScreenContainerRef,
  artifacts = [],
  projectPath = '',
  threadId = '',
  onCloseFileBrowser,
}: PreviewSecondaryPaneProps) {
  const closeFileBrowser = useChatStore((s) => s.setRightPanelMode);
  if (rightPanelMode === 'status') return null;

  /** Legacy `pptStudio` mode is migrated to the unified 任务/产物/文件 panel — render the same shell. */
  const isUnifiedFileBrowser = rightPanelMode === 'fileBrowser' || rightPanelMode === 'pptStudio';
  const needsSplitResizer = isUnifiedFileBrowser;
  const paneTestId = isUnifiedFileBrowser ? 'file-browser-secondary-pane' : undefined;

  const handleCloseFileBrowser = onCloseFileBrowser ?? (() => closeFileBrowser('status'));

  const resizerTestId = 'file-browser-pane-resizer';

  return (
    <>
      {needsSplitResizer ? (
        <div data-testid={resizerTestId} className="flex shrink-0">
          {!isCompactPreviewLayout ? (
            <ResizeHandle direction="horizontal" onResize={onResize} onDoubleClick={onReset} />
          ) : null}
        </div>
      ) : null}
      <aside
        data-testid={paneTestId}
        className={
          needsSplitResizer
            ? isCompactPreviewLayout
              ? 'flex min-h-0 min-w-0 flex-1 overflow-hidden'
              : 'flex min-h-0 min-w-0 shrink-0 overflow-hidden'
            : 'hidden xl:flex min-h-0 min-w-0 overflow-hidden'
        }
        style={
          pptStudioPaneWidth
            ? {
                width: `${pptStudioPaneWidth}px`,
                flexShrink: 0,
                flexGrow: 0,
                flexBasis: `${pptStudioPaneWidth}px`,
                minWidth: `${PPT_STUDIO_PANEL_MIN_WIDTH}px`,
                maxWidth: `${pptStudioPaneWidth}px`,
              }
            : undefined
        }
      >
        {isUnifiedFileBrowser ? (
          <FileBrowserPanel
            artifacts={artifacts}
            projectPath={projectPath}
            threadId={threadId}
            onClose={handleCloseFileBrowser}
            fullScreenContainerRef={fullScreenContainerRef}
          />
        ) : null}
      </aside>
    </>
  );
}
