/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { buildVirtualPptInProgressPath } from '@/components/cli-output/local-generated-files';
import type { ActiveOutlinePreview } from './chat-types';
import type {
  PptStudioSession,
  PptStudioSlide,
  PptStudioSlideInput,
  PptStudioSlidesUpdate,
  PptStudioStatus,
} from '@/components/ppt-studio/ppt-studio-types';

type RightPanelMode = 'status' | 'workspace' | 'pptStudio' | 'outlinePreview' | 'fileBrowser';

export interface PptStudioPreviewPreference {
  isOpen: boolean;
  activePagesDir: string | null;
}

export interface PptStudioUpsertOptions {
  source?: 'live' | 'recovery';
  /** `replace` = authoritative full list (e.g. GET /api/ppt-studio/session); omit = merge with existing (CLI tool events). */
  slideMerge?: 'incremental' | 'replace';
}

export interface PptPreviewStoreState {
  currentThreadId: string;
  rightPanelMode: RightPanelMode;
  pptStudioSessions: Record<string, PptStudioSession>;
  activePptPagesDir: string | null;
  /** Chat store — deep-link selection in 工作产物 when opening the unified file browser panel. */
  fileBrowserInitialPath?: string | null;
  activeOutlinePreview: ActiveOutlinePreview | null;
  /** Present on full chat store — used to bind PPT paths to the thread project directory. */
  threads?: readonly { id: string; projectPath?: string }[];
}

const PPT_STUDIO_PREVIEW_STORAGE_KEY = 'office-claw:pptStudioPreviewByThread';
const LEGACY_PPT_STUDIO_PREVIEW_STORAGE_KEY = 'catcafe.pptStudioPreviewByThread';

function loadPptStudioPreviewPreferences(): Record<string, PptStudioPreviewPreference> {
  if (typeof window === 'undefined') return {};
  try {
    let raw = window.localStorage.getItem(PPT_STUDIO_PREVIEW_STORAGE_KEY);
    if (!raw) raw = window.localStorage.getItem(LEGACY_PPT_STUDIO_PREVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<PptStudioPreviewPreference>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result = Object.fromEntries(
      Object.entries(parsed).map(([threadId, value]) => [
        threadId,
        {
          isOpen: value?.isOpen === true,
          activePagesDir: typeof value?.activePagesDir === 'string' ? value.activePagesDir : null,
        },
      ]),
    );
    if (
      window.localStorage.getItem(PPT_STUDIO_PREVIEW_STORAGE_KEY) === null &&
      window.localStorage.getItem(LEGACY_PPT_STUDIO_PREVIEW_STORAGE_KEY) !== null
    ) {
      try {
        window.localStorage.setItem(PPT_STUDIO_PREVIEW_STORAGE_KEY, JSON.stringify(result));
        window.localStorage.removeItem(LEGACY_PPT_STUDIO_PREVIEW_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    return result;
  } catch {
    return {};
  }
}

function loadPptStudioPreviewPreference(threadId: string): PptStudioPreviewPreference | null {
  return loadPptStudioPreviewPreferences()[threadId] ?? null;
}

function persistPptStudioPreviewPreference(threadId: string, next: PptStudioPreviewPreference) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadPptStudioPreviewPreferences();
    window.localStorage.setItem(
      PPT_STUDIO_PREVIEW_STORAGE_KEY,
      JSON.stringify({
        ...existing,
        [threadId]: next,
      }),
    );
    try {
      window.localStorage.removeItem(LEGACY_PPT_STUDIO_PREVIEW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    // ignore storage failures
  }
}

function normalizePptStudioSlide(slide: PptStudioSlideInput): PptStudioSlide {
  return {
    slideId: slide.slideId,
    pageNumber: slide.pageNumber,
    htmlPath: slide.htmlPath,
    title: slide.title ?? null,
    blockCount: slide.blockCount ?? null,
    updatedAt: slide.updatedAt ?? null,
    url: slide.url ?? null,
    sha256: slide.sha256 ?? null,
  };
}

function sortPptStudioSlides(slides: readonly PptStudioSlide[]): PptStudioSlide[] {
  return [...slides].sort(
    (left, right) => left.pageNumber - right.pageNumber || left.slideId.localeCompare(right.slideId),
  );
}

/**
 * 同一 `pageNumber` 只保留一条。同页被多次 `file_write` 时，后端可能用不同 `data-slide-id`，
 * `merge` 按 `slideId` 建 Map 会留下两条、缩略图重复；磁盘上仍只有一个 `page-N.pptx.html`。
 * 在相同 `pageNumber` 的候选中保留 `updatedAt` 更晚的；全相同则取列表中后一条（视为最后一次覆盖写）。
 */
export function dedupePptStudioSlidesByPageNumber(slides: readonly PptStudioSlide[]): PptStudioSlide[] {
  if (slides.length < 2) return [...slides];
  const byPage = new Map<number, PptStudioSlide[]>();
  for (const s of slides) {
    if (!byPage.has(s.pageNumber)) byPage.set(s.pageNumber, []);
    byPage.get(s.pageNumber)!.push(s);
  }
  const out: PptStudioSlide[] = [];
  for (const pageNum of [...byPage.keys()].sort((a, b) => a - b)) {
    const group = byPage.get(pageNum)!;
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    out.push(
      group.reduce((best, s) => {
        const bt = best.updatedAt ?? 0;
        const st = s.updatedAt ?? 0;
        if (st > bt) return s;
        if (st < bt) return best;
        return s;
      }),
    );
  }
  return out;
}

export function syncPptStudioActiveSlideId(
  activeSlideId: string | null,
  slides: readonly PptStudioSlide[],
): string | null {
  if (!activeSlideId) return null;

  if (activeSlideId.startsWith('placeholder-')) {
    const pageNum = parseInt(activeSlideId.split('-')[1] ?? '', 10);
    const realSlide = slides.find((slide) => slide.pageNumber === pageNum);
    if (realSlide) return realSlide.slideId;
    return activeSlideId;
  }

  return slides.some((slide) => slide.slideId === activeSlideId) ? activeSlideId : (slides[0]?.slideId ?? null);
}

export function getRightPanelModeForThread<State extends PptPreviewStoreState>(
  state: State,
  threadId: string,
): State['rightPanelMode'] {
  if (state.activeOutlinePreview?.threadId === threadId) {
    return 'outlinePreview' as State['rightPanelMode'];
  }
  const hasSession = Object.values(state.pptStudioSessions).some((session) => session.threadId === threadId);
  if (hasSession) {
    const preference = loadPptStudioPreviewPreference(threadId);
    return (preference?.isOpen === false ? 'status' : 'fileBrowser') as State['rightPanelMode'];
  }
  // No PPT anchor / doc preview for this thread — do not inherit fileBrowser or workspace from the previous thread
  // (setCurrentThread still reads global `state.rightPanelMode` at switch time).
  return 'status' as State['rightPanelMode'];
}

const PPTX_CRAFT_PATH_KEY = 'office-claw-skills/pptx-craft';

/**
 * 将 `projectRoot` + `pagesDir` 调整为 PPT API 能校验通过的一对路径。
 * 典型问题：thread.projectPath 仍是过期的 `…/workspace/<id>`，而 pages 在 `…/office-claw-skills/pptx-craft/…`，
 * 子路径不在 `projectRoot` 下会触发 403（Path escapes project root）。
 */
export function normalizePptStudioApiQuery(
  projectRoot: string,
  pagesDir: string,
): { projectRoot: string; pagesDir: string } {
  const pr = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const pd = pagesDir.replace(/\\/g, '/').trim();
  if (!pr || !pd) return { projectRoot: pr, pagesDir: pd };

  const isAbs = pd.startsWith('/') || /^[A-Za-z]:/.test(pd);
  if (!isAbs) return { projectRoot: pr, pagesDir: pd };

  const kIdx = pd.indexOf(PPTX_CRAFT_PATH_KEY);
  if (kIdx < 0) return { projectRoot: pr, pagesDir: pd };

  const craftRoot = pd.slice(0, kIdx + PPTX_CRAFT_PATH_KEY.length);
  const relAfter =
    pd[kIdx + PPTX_CRAFT_PATH_KEY.length] === '/'
      ? pd.slice(kIdx + PPTX_CRAFT_PATH_KEY.length + 1)
      : pd.slice(kIdx + PPTX_CRAFT_PATH_KEY.length);

  const prHasWorkspace = pr.includes('/workspace/') || /\/workspace\/[^/]+$/.test(pr);
  const pagesUnderPr = pd === pr || pd.startsWith(`${pr}/`);
  if (prHasWorkspace || !pagesUnderPr) {
    return { projectRoot: craftRoot, pagesDir: relAfter };
  }
  return { projectRoot: pr, pagesDir: pd };
}

export function getPreferredPptPagesDirForThread<State extends PptPreviewStoreState>(
  state: State,
  threadId: string,
): string | null {
  const preference = loadPptStudioPreviewPreference(threadId);
  if (preference?.activePagesDir && state.pptStudioSessions[preference.activePagesDir]?.threadId === threadId) {
    return preference.activePagesDir;
  }
  const active = state.activePptPagesDir ? state.pptStudioSessions[state.activePptPagesDir] : null;
  if (active?.threadId === threadId && state.activePptPagesDir) return state.activePptPagesDir;
  const sessionsForThread = Object.values(state.pptStudioSessions).filter((session) => session.threadId === threadId);
  return sessionsForThread[sessionsForThread.length - 1]?.pagesDir ?? null;
}

export function mergePptStudioSession<State extends PptPreviewStoreState>(
  state: State,
  threadId: string,
  payload: PptStudioSlidesUpdate,
  options?: PptStudioUpsertOptions,
): State | Partial<State> {
  const existing = state.pptStudioSessions[payload.pagesDir];
  const mergedSlides = new Map<string, PptStudioSlide>();
  const slideMerge = options?.slideMerge ?? 'incremental';

  if (slideMerge === 'incremental') {
    for (const slide of existing?.slides ?? []) {
      mergedSlides.set(slide.slideId, slide);
    }
  }

  for (const inputSlide of payload.slides) {
    const slide = normalizePptStudioSlide(inputSlide);
    const previous =
      mergedSlides.get(slide.slideId) ??
      [...mergedSlides.values()].find((candidate) => candidate.htmlPath === slide.htmlPath);
    mergedSlides.set(slide.slideId, {
      ...slide,
      title: slide.title ?? previous?.title ?? null,
      blockCount: slide.blockCount ?? previous?.blockCount ?? null,
      updatedAt: slide.updatedAt ?? previous?.updatedAt ?? null,
      url: slide.url ?? previous?.url ?? null,
      sha256: slide.sha256 ?? previous?.sha256 ?? null,
    });
  }

  let slides = dedupePptStudioSlidesByPageNumber(sortPptStudioSlides([...mergedSlides.values()]));
  // Incremental CLI merge：磁盘扫描或「整会话 replace」不会产生 ghost 幻灯片；仅用 trim 对齐「删减页」类 upsert。
  const trimCap =
    slideMerge === 'incremental' &&
    typeof payload.expectedSlideCount === 'number' &&
    payload.expectedSlideCount > 0 &&
    payload.slides.length > 0
      ? payload.expectedSlideCount
      : null;
  if (trimCap !== null) {
    slides = slides.filter((s) => s.pageNumber <= trimCap);
  }
  const threadProjectPath = state.threads?.find((t) => t.id === threadId)?.projectPath;
  let effectiveProjectRoot =
    payload.projectRoot ??
    existing?.projectRoot ??
    (threadProjectPath && threadProjectPath !== 'default' ? threadProjectPath : null);
  if (effectiveProjectRoot?.trim()) {
    const { projectRoot: coerced } = normalizePptStudioApiQuery(effectiveProjectRoot, payload.pagesDir);
    if (coerced) effectiveProjectRoot = coerced;
  }

  const maxPageInSlides = slides.length === 0 ? 0 : Math.max(...slides.map((s) => s.pageNumber));
  const nextExpectedSlideCount =
    slideMerge === 'replace'
      ? typeof payload.expectedSlideCount === 'number' && payload.expectedSlideCount > 0
        ? payload.expectedSlideCount
        : maxPageInSlides
      : (payload.expectedSlideCount ?? existing?.expectedSlideCount);

  const nextSession: PptStudioSession = {
    threadId,
    projectRoot: effectiveProjectRoot,
    pagesDir: payload.pagesDir,
    deckTitle: payload.deckTitle || existing?.deckTitle || '',
    expectedSlideCount: nextExpectedSlideCount,
    status: payload.status ?? existing?.status ?? 'editable',
    slides,
    activeSlideId: syncPptStudioActiveSlideId(existing?.activeSlideId ?? null, slides),
  };

  const isCurrentThread = threadId === state.currentThreadId;
  const isNewSession = !existing;
  const source = options?.source ?? 'live';
  const preference = loadPptStudioPreviewPreference(threadId);

  const nextState = {
    pptStudioSessions: {
      ...state.pptStudioSessions,
      [payload.pagesDir]: nextSession,
    },
  } as Partial<State>;

  if (!isCurrentThread) return nextState;

  const isGeneratingStatus = nextSession.status === 'generating';
  const openUnifiedBrowser = {
    rightPanelMode: 'fileBrowser' as const,
    ...(isGeneratingStatus ? { fileBrowserInitialPath: buildVirtualPptInProgressPath(payload.pagesDir) } : {}),
  } as Partial<State>;

  if (source === 'recovery' && preference) {
    if (preference.activePagesDir === payload.pagesDir) {
      return {
        ...nextState,
        activePptPagesDir: payload.pagesDir,
        ...(preference.isOpen ? { ...openUnifiedBrowser } : {}),
      } as Partial<State>;
    }
    return nextState;
  }

  if (isNewSession) {
    persistPptStudioPreviewPreference(threadId, {
      isOpen: true,
      activePagesDir: payload.pagesDir,
    });
    return {
      ...nextState,
      activePptPagesDir: payload.pagesDir,
      ...openUnifiedBrowser,
    } as Partial<State>;
  }

  return nextState;
}

export function updatePptStudioActiveSlide<State extends PptPreviewStoreState>(
  state: State,
  pagesDir: string,
  activeSlideId: string | null,
): State | Partial<State> {
  const existing = state.pptStudioSessions[pagesDir];
  if (!existing) return state;

  return {
    pptStudioSessions: {
      ...state.pptStudioSessions,
      [pagesDir]: {
        ...existing,
        activeSlideId: syncPptStudioActiveSlideId(activeSlideId, existing.slides),
      },
    },
  } as Partial<State>;
}

export function updatePptStudioStatus<State extends PptPreviewStoreState>(
  state: State,
  pagesDir: string,
  status: PptStudioStatus,
): State | Partial<State> {
  const existing = state.pptStudioSessions[pagesDir];
  if (!existing) return state;

  return {
    pptStudioSessions: {
      ...state.pptStudioSessions,
      [pagesDir]: {
        ...existing,
        status,
      },
    },
  } as Partial<State>;
}

export function removePptStudioSession<State extends PptPreviewStoreState>(
  state: State,
  pagesDir: string,
): State | Partial<State> {
  if (!state.pptStudioSessions[pagesDir]) return state;
  const nextSessions = { ...state.pptStudioSessions };
  delete nextSessions[pagesDir];

  const wasActive = state.activePptPagesDir === pagesDir;
  const remainingForThread = Object.values(nextSessions).filter(
    (session) => session.threadId === state.currentThreadId,
  );
  const nextActivePagesDir = wasActive
    ? (remainingForThread[remainingForThread.length - 1]?.pagesDir ?? null)
    : state.activePptPagesDir;

  return {
    pptStudioSessions: nextSessions,
    activePptPagesDir: nextActivePagesDir,
    ...(remainingForThread.length === 0 && state.rightPanelMode === 'pptStudio' ? { rightPanelMode: 'status' } : {}),
  } as Partial<State>;
}

export function openPptStudioPreviewForThread<State extends PptPreviewStoreState>(
  state: State,
  pagesDir: string,
  threadId?: string,
): State | Partial<State> {
  const targetThreadId = threadId ?? state.currentThreadId;
  persistPptStudioPreviewPreference(targetThreadId, {
    isOpen: true,
    activePagesDir: pagesDir,
  });
  return targetThreadId === state.currentThreadId
    ? ({
        activePptPagesDir: pagesDir,
        rightPanelMode: 'fileBrowser',
        fileBrowserInitialPath: buildVirtualPptInProgressPath(pagesDir),
      } as Partial<State>)
    : state;
}

export function closePptStudioPreviewForThread<State extends PptPreviewStoreState>(
  state: State,
  threadId?: string,
): State | Partial<State> {
  const targetThreadId = threadId ?? state.currentThreadId;
  const preferredPagesDir = getPreferredPptPagesDirForThread(state, targetThreadId);
  persistPptStudioPreviewPreference(targetThreadId, {
    isOpen: false,
    activePagesDir: preferredPagesDir,
  });
  return targetThreadId === state.currentThreadId
    ? ({
        rightPanelMode: 'status',
        activePptPagesDir: preferredPagesDir,
      } as Partial<State>)
    : state;
}
