/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { buildVirtualPptInProgressPath } from '@/components/cli-output/local-generated-files';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '@/stores/chatStore';

describe('ppt studio store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useChatStore.setState({
      currentThreadId: 'thread-1',
      rightPanelMode: 'status',
      messages: [],
      threadStates: {},
      threads: [
        {
          id: 'thread-1',
          title: null,
          projectPath: '/tmp/ppt-store-root',
          createdBy: 'user',
          participants: ['user'],
          lastActiveAt: 0,
          createdAt: 0,
        },
      ],
      pptStudioSessions: {},
      activePptPagesDir: null,
    });
  });

  it('upserts slides into a thread-scoped ppt studio session and opens the unified file browser panel', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/demo/pages',
      deckTitle: 'Demo deck',
      slides: [{ slideId: 'slide-1', pageNumber: 1, htmlPath: 'output/demo/pages/page-1.pptx.html' }],
    });

    const state = useChatStore.getState();
    expect(state.rightPanelMode).toBe('fileBrowser');
    expect(state.fileBrowserInitialPath).toBe(buildVirtualPptInProgressPath('output/demo/pages'));
    expect(state.activePptPagesDir).toBe('output/demo/pages');
    expect(state.pptStudioSessions['output/demo/pages']).toEqual(
      expect.objectContaining({
        threadId: 'thread-1',
        projectRoot: '/tmp/ppt-store-root',
        pagesDir: 'output/demo/pages',
        deckTitle: 'Demo deck',
        status: 'editable',
        activeSlideId: null,
      }),
    );
    expect(state.pptStudioSessions['output/demo/pages']?.slides).toEqual([
      expect.objectContaining({
        slideId: 'slide-1',
        pageNumber: 1,
        htmlPath: 'output/demo/pages/page-1.pptx.html',
      }),
    ]);
  });

  it('opens the ppt studio as soon as a new preview marker appears before slides exist', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/demo/pages',
      deckTitle: 'Demo deck',
      expectedSlideCount: 6,
      status: 'generating',
      slides: [],
    });

    const state = useChatStore.getState();
    expect(state.rightPanelMode).toBe('fileBrowser');
    expect(state.fileBrowserInitialPath).toBe(buildVirtualPptInProgressPath('output/demo/pages'));
    expect(state.activePptPagesDir).toBe('output/demo/pages');
    expect(state.pptStudioSessions['output/demo/pages']).toEqual(
      expect.objectContaining({
        projectRoot: '/tmp/ppt-store-root',
        pagesDir: 'output/demo/pages',
        expectedSlideCount: 6,
        status: 'generating',
        slides: [],
      }),
    );
  });

  it('switches to a second ppt preview when its html generation marker appears', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/first/pages',
      deckTitle: 'First deck',
      status: 'generating',
      slides: [],
    });

    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/second/pages',
      deckTitle: 'Second deck',
      status: 'generating',
      slides: [],
    });

    const state = useChatStore.getState();
    expect(state.rightPanelMode).toBe('fileBrowser');
    expect(state.fileBrowserInitialPath).toBe(buildVirtualPptInProgressPath('output/second/pages'));
    expect(state.activePptPagesDir).toBe('output/second/pages');
  });

  it('keeps the ppt studio closed on refresh recovery after the user closes it', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/demo/pages',
      deckTitle: 'Demo deck',
      status: 'generating',
      slides: [],
    });
    useChatStore.getState().closePptStudioPreview();

    useChatStore.setState({
      currentThreadId: 'thread-1',
      rightPanelMode: 'status',
      pptStudioSessions: {},
      activePptPagesDir: null,
    });

    useChatStore.getState().upsertPptStudioSlides(
      'thread-1',
      {
        pagesDir: 'output/demo/pages',
        deckTitle: 'Demo deck',
        status: 'generating',
        slides: [],
      },
      { source: 'recovery' },
    );

    const state = useChatStore.getState();
    expect(state.rightPanelMode).toBe('status');
    expect(state.activePptPagesDir).toBe('output/demo/pages');
  });

  it('restores the last open ppt preview on refresh recovery', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/first/pages',
      deckTitle: 'First deck',
      status: 'generating',
      slides: [],
    });
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/second/pages',
      deckTitle: 'Second deck',
      status: 'generating',
      slides: [],
    });

    useChatStore.setState({
      currentThreadId: 'thread-1',
      rightPanelMode: 'status',
      pptStudioSessions: {},
      activePptPagesDir: null,
    });

    useChatStore.getState().upsertPptStudioSlides(
      'thread-1',
      {
        pagesDir: 'output/first/pages',
        deckTitle: 'First deck',
        status: 'generating',
        slides: [],
      },
      { source: 'recovery' },
    );
    useChatStore.getState().upsertPptStudioSlides(
      'thread-1',
      {
        pagesDir: 'output/second/pages',
        deckTitle: 'Second deck',
        status: 'generating',
        slides: [],
      },
      { source: 'recovery' },
    );

    const state = useChatStore.getState();
    expect(state.rightPanelMode).toBe('fileBrowser');
    expect(state.fileBrowserInitialPath).toBe(buildVirtualPptInProgressPath('output/second/pages'));
    expect(state.activePptPagesDir).toBe('output/second/pages');
  });

  it('drops pages above expectedSlideCount when syncing a shorter deck from disk scan', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/demo/pages',
      deckTitle: 'Deck',
      expectedSlideCount: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({
        slideId: `slide-${i + 1}`,
        pageNumber: i + 1,
        htmlPath: `output/demo/pages/page-${i + 1}.pptx.html`,
      })),
    });

    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/demo/pages',
      deckTitle: 'Deck',
      expectedSlideCount: 5,
      slides: Array.from({ length: 5 }, (_, i) => ({
        slideId: `slide-${i + 1}`,
        pageNumber: i + 1,
        htmlPath: `output/demo/pages/page-${i + 1}.pptx.html`,
      })),
    });

    const slides = useChatStore.getState().pptStudioSessions['output/demo/pages']?.slides ?? [];
    expect(slides).toHaveLength(5);
    expect(slides.map((s) => s.pageNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(useChatStore.getState().pptStudioSessions['output/demo/pages']?.expectedSlideCount).toBe(5);
  });

  it('slideMerge replace overwrites incremental session with disk snapshot slides', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/rep/pages',
      deckTitle: 'Deck',
      expectedSlideCount: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({
        slideId: `slide-${i + 1}`,
        pageNumber: i + 1,
        htmlPath: `output/rep/pages/page-${i + 1}.pptx.html`,
      })),
    });

    useChatStore.getState().upsertPptStudioSlides(
      'thread-1',
      {
        pagesDir: 'output/rep/pages',
        deckTitle: 'Deck',
        expectedSlideCount: 5,
        slides: Array.from({ length: 5 }, (_, i) => ({
          slideId: `slide-${i + 1}`,
          pageNumber: i + 1,
          htmlPath: `output/rep/pages/page-${i + 1}.pptx.html`,
        })),
      },
      { slideMerge: 'replace' },
    );

    const sess = useChatStore.getState().pptStudioSessions['output/rep/pages'];
    expect(sess?.slides).toHaveLength(5);
    expect(sess?.slides.map((s) => s.pageNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(sess?.expectedSlideCount).toBe(5);
  });

  it('dedupes the same page when two events use different slideIds (double file_write to page-1)', () => {
    useChatStore.getState().upsertPptStudioSlides('thread-1', {
      pagesDir: 'output/dedupe/pages',
      deckTitle: 'Deck',
      slides: [
        { slideId: 'from-html-aaa', pageNumber: 1, htmlPath: 'output/dedupe/pages/page-1.pptx.html' },
        { slideId: 'from-html-bbb', pageNumber: 1, htmlPath: 'output/dedupe/pages/page-1.pptx.html' },
        { slideId: 'slide-2', pageNumber: 2, htmlPath: 'output/dedupe/pages/page-2.pptx.html' },
      ],
    });
    const slides = useChatStore.getState().pptStudioSessions['output/dedupe/pages']?.slides ?? [];
    expect(slides).toHaveLength(2);
    expect(slides.find((s) => s.pageNumber === 1)?.slideId).toBe('from-html-bbb');
  });
});
