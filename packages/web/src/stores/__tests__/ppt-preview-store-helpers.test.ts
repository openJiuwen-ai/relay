/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  dedupePptStudioSlidesByPageNumber,
  getPreferredPptPagesDirForThread,
  getRightPanelModeForThread,
  normalizePptStudioApiQuery,
  syncPptStudioActiveSlideId,
} from '@/stores/ppt-preview-store-helpers';

describe('ppt preview store helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('upgrades placeholder slide ids to the generated real slide id when the page becomes available', () => {
    const slides = [
      {
        slideId: 'slide-1',
        pageNumber: 1,
        htmlPath: 'output/demo/pages/page-1.pptx.html',
        title: null,
        blockCount: null,
        updatedAt: null,
        url: null,
        sha256: null,
      },
      {
        slideId: 'slide-2',
        pageNumber: 2,
        htmlPath: 'output/demo/pages/page-2.pptx.html',
        title: null,
        blockCount: null,
        updatedAt: null,
        url: null,
        sha256: null,
      },
    ];

    expect(syncPptStudioActiveSlideId('placeholder-2', slides)).toBe('slide-2');
    expect(syncPptStudioActiveSlideId('slide-1', slides)).toBe('slide-1');
    expect(syncPptStudioActiveSlideId('missing-slide', slides)).toBe('slide-1');
  });


  it('does not inherit fileBrowser from the previous thread when the target thread has no PPT session', () => {
    const mode = getRightPanelModeForThread(
      {
        currentThreadId: 'thread-A',
        rightPanelMode: 'fileBrowser',
        activePptPagesDir: null,
        activeOutlinePreview: null,
        pptStudioSessions: {},
      },
      'thread-B',
    );
    expect(mode).toBe('status');
  });

  it('prefers the persisted pages dir for the thread and otherwise falls back to the latest thread session', () => {
    window.localStorage.setItem(
      'office-claw:pptStudioPreviewByThread',
      JSON.stringify({
        'thread-1': {
          isOpen: true,
          activePagesDir: 'output/saved/pages',
        },
      }),
    );

    const state = {
      pptStudioSessions: {
        'output/older/pages': {
          threadId: 'thread-1',
          projectRoot: '/r',
          pagesDir: 'output/older/pages',
          deckTitle: 'Older deck',
          status: 'editable' as const,
          slides: [],
          activeSlideId: null,
        },
        'output/saved/pages': {
          threadId: 'thread-1',
          projectRoot: '/r',
          pagesDir: 'output/saved/pages',
          deckTitle: 'Saved deck',
          status: 'editable' as const,
          slides: [],
          activeSlideId: null,
        },
        'output/other/pages': {
          threadId: 'thread-2',
          projectRoot: '/r',
          pagesDir: 'output/other/pages',
          deckTitle: 'Other deck',
          status: 'editable' as const,
          slides: [],
          activeSlideId: null,
        },
      },
      activePptPagesDir: null,
      activeOutlinePreview: null,
      rightPanelMode: 'status' as const,
      currentThreadId: 'thread-1',
    };

    expect(getPreferredPptPagesDirForThread(state, 'thread-1')).toBe('output/saved/pages');
    expect(
      getPreferredPptPagesDirForThread(
        {
          ...state,
          activePptPagesDir: null,
          activeOutlinePreview: null,
          pptStudioSessions: {
            'output/older/pages': state.pptStudioSessions['output/older/pages'],
          },
        },
        'thread-1',
      ),
    ).toBe('output/older/pages');
  });

  it('rewrites legacy workspace projectRoot to pptx-craft when pagesDir is absolute under craft (403 fix)', () => {
    const repo = '/Users/dev/relay-claw';
    const absPages = `${repo}/office-claw-skills/pptx-craft/output/20260425_113003_000/pages`;
    const { projectRoot, pagesDir } = normalizePptStudioApiQuery(`${repo}/workspace/20260425111805`, absPages);
    expect(projectRoot).toBe(`${repo}/office-claw-skills/pptx-craft`);
    expect(pagesDir).toBe('output/20260425_113003_000/pages');
  });

  it('leaves monorepo projectRoot when abs pages is under that root', () => {
    const repo = '/Users/dev/relay-claw';
    const absPages = `${repo}/office-claw-skills/pptx-craft/output/x/pages`;
    const { projectRoot, pagesDir } = normalizePptStudioApiQuery(repo, absPages);
    expect(projectRoot).toBe(repo);
    expect(pagesDir).toBe(absPages);
  });

  it('dedupes slides by pageNumber when the same page is reported with different slideIds (double file_write)', () => {
    const deduped = dedupePptStudioSlidesByPageNumber([
      {
        slideId: 'data-slide-aaa',
        pageNumber: 1,
        htmlPath: 'output/x/pages/page-1.pptx.html',
        title: null,
        blockCount: null,
        updatedAt: null,
        url: null,
        sha256: null,
      },
      {
        slideId: 'data-slide-bbb',
        pageNumber: 1,
        htmlPath: 'output/x/pages/page-1.pptx.html',
        title: 'T',
        blockCount: 2,
        updatedAt: null,
        url: null,
        sha256: null,
      },
      {
        slideId: 'slide-2',
        pageNumber: 2,
        htmlPath: 'output/x/pages/page-2.pptx.html',
        title: null,
        blockCount: null,
        updatedAt: null,
        url: null,
        sha256: null,
      },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((s) => s.pageNumber === 1)?.slideId).toBe('data-slide-bbb');
  });

  // outlinePreview mode tests
  it('prefers outlinePreview when active outline preview matches the thread', () => {
    const mode = getRightPanelModeForThread(
      {
        currentThreadId: 'thread-A',
        rightPanelMode: 'pptStudio',
        activePptPagesDir: 'pages/x',
        activeOutlinePreview: {
          requestId: 'req-1',
          threadId: 'thread-A',
          initialText: '# Outline',
          editedText: '# Outline',
          title: '大纲审阅',
          panelMode: 'preview',
          isConfirmed: false,
        },
        pptStudioSessions: {
          'pages/x': {
            threadId: 'thread-A',
            projectRoot: '/r',
            pagesDir: 'pages/x',
            deckTitle: 'Deck',
            status: 'editable',
            slides: [],
            activeSlideId: null,
          },
        },
      },
      'thread-A',
    );
    expect(mode).toBe('outlinePreview');
  });


  it('outlinePreview collapses to status when resolving a thread without an active outline preview', () => {
    const mode = getRightPanelModeForThread(
      {
        currentThreadId: 'thread-B',
        rightPanelMode: 'outlinePreview',
        activePptPagesDir: null,
        activeOutlinePreview: {
          requestId: 'req-1',
          threadId: 'thread-A',
          initialText: '# Outline',
          editedText: '# Outline',
          title: '大纲审阅',
          panelMode: 'preview',
          isConfirmed: false,
        },
        pptStudioSessions: {},
      },
      'thread-B',
    );
    expect(mode).toBe('status');
  });
});
