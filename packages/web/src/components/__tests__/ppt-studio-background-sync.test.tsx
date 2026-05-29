/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PptStudioBackgroundSync } from '@/components/ppt-studio/PptStudioBackgroundSync';
import { useChatStore } from '@/stores/chatStore';

const mockApiFetch = vi.fn();

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  API_URL: 'http://localhost:3004',
}));

const sessionSnapshot = {
  pagesDir: 'output/demo/pages',
  deckTitle: 'Demo Deck',
  status: 'editable',
  slides: [
    {
      slideId: 'slide-1',
      pageNumber: 1,
      htmlPath: 'output/demo/pages/page-1.pptx.html',
      title: 'Q1 Roadmap',
      blockCount: 2,
      updatedAt: 100,
    },
    {
      slideId: 'slide-2',
      pageNumber: 2,
      htmlPath: 'output/demo/pages/page-2.pptx.html',
      title: 'Revenue Plan',
      blockCount: 1,
      updatedAt: 200,
    },
  ],
};

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('PptStudioBackgroundSync', () => {
  let container: HTMLDivElement;
  let root: Root;

  const renderSync = async () => {
    await act(async () => {
      root.render(React.createElement(PptStudioBackgroundSync));
    });
    await flush();
  };

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    window.localStorage.clear();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => sessionSnapshot,
    });
    useChatStore.setState({
      currentThreadId: 'thread-ppt',
      rightPanelMode: 'status',
      activePptPagesDir: 'output/demo/pages',
      threads: [
        {
          id: 'thread-ppt',
          title: 'PPT Thread',
          projectPath: '/tmp/ppt-panel-root',
          createdBy: 'user',
          participants: ['user'],
          lastActiveAt: 1,
          createdAt: 1,
        },
      ],
      pptStudioSessions: {
        'output/demo/pages': {
          threadId: 'thread-ppt',
          projectRoot: '/tmp/ppt-panel-root',
          pagesDir: 'output/demo/pages',
          deckTitle: 'Demo Deck',
          status: 'generating',
          slides: [
            {
              slideId: 'slide-1',
              pageNumber: 1,
              htmlPath: 'output/demo/pages/page-1.pptx.html',
              title: null,
              blockCount: null,
              updatedAt: null,
            },
          ],
          activeSlideId: null,
        },
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('hydrates missing projectRoot for restored default-project PPT sessions', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/projects/cwd') {
        return { ok: true, json: async () => ({ path: '/tmp/default-root' }) };
      }
      return { ok: true, json: async () => sessionSnapshot };
    });
    useChatStore.setState({
      threads: [
        {
          id: 'thread-ppt',
          title: 'PPT Thread',
          projectPath: 'default',
          createdBy: 'user',
          participants: ['user'],
          lastActiveAt: 1,
          createdAt: 1,
        },
      ],
      pptStudioSessions: {
        'output/demo/pages': {
          threadId: 'thread-ppt',
          projectRoot: null,
          pagesDir: 'output/demo/pages',
          deckTitle: 'Demo Deck',
          status: 'generating',
          slides: [
            {
              slideId: 'slide-1',
              pageNumber: 1,
              htmlPath: 'output/demo/pages/page-1.pptx.html',
              title: null,
              blockCount: null,
              updatedAt: null,
            },
          ],
          activeSlideId: null,
        },
      },
    });

    await renderSync();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd');
    expect(useChatStore.getState().pptStudioSessions['output/demo/pages']?.projectRoot).toBe('/tmp/default-root');
  });

  it('hydrates absolute pagesDir using thread projectRoot (no workspace worktree registry)', async () => {
    const pagesKey =
      '/Users/zhengzhichao/Desktop/opentiny/relay-claw/office-claw-skills/pptx-craft/output/20260418_164242_000/pages';
    const repoRoot = '/Users/zhengzhichao/Desktop/opentiny/relay-claw';

    useChatStore.setState({
      currentThreadId: 'thread-ppt',
      rightPanelMode: 'pptStudio',
      activePptPagesDir: pagesKey,
      threads: [
        {
          id: 'thread-ppt',
          title: 'PPT Thread',
          projectPath: repoRoot,
          createdBy: 'user',
          participants: ['user', 'opus'],
          lastActiveAt: 1,
          createdAt: 1,
        },
      ],
      pptStudioSessions: {
        [pagesKey]: {
          threadId: 'thread-ppt',
          projectRoot: repoRoot,
          pagesDir: pagesKey,
          deckTitle: '20260418_164242_000',
          status: 'generating',
          slides: [],
          activeSlideId: null,
        },
      },
    });

    mockApiFetch.mockImplementation((url: unknown) => {
      const u = String(url);
      if (!u.startsWith('/api/ppt-studio/session?')) {
        throw new Error(`Unexpected request: ${u}`);
      }
      expect(u).toContain('projectRoot=');
      expect(u).toContain(encodeURIComponent(repoRoot));
      return Promise.resolve({
        ok: true,
        json: async () => sessionSnapshot,
      });
    });

    await renderSync();

    expect(useChatStore.getState().pptStudioSessions[pagesKey]).toEqual(
      expect.objectContaining({
        projectRoot: repoRoot,
        pagesDir: pagesKey,
      }),
    );
  });
});
