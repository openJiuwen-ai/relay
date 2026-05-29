/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const { PptSessionCard } = await import('@/components/ppt-studio/PptSessionCard');
const mockApiFetch = vi.mocked(apiFetch);

const PAGES_DIR = 'output/demo/pages';

function seedStore(): void {
  useChatStore.setState({
    currentThreadId: 'thread-ppt',
    rightPanelMode: 'status',
    activePptPagesDir: null,
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
      [PAGES_DIR]: {
        threadId: 'thread-ppt',
        projectRoot: '/tmp/ppt-panel-root',
        pagesDir: PAGES_DIR,
        deckTitle: 'Demo',
        status: 'generating',
        slides: [],
        activeSlideId: null,
      },
    },
  });
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getJsonBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
}

describe('PptSessionCard streaming stability', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    seedStore();
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useChatStore.setState({ pptStudioSessions: {}, activePptPagesDir: null, rightPanelMode: 'status' });
  });

  it('shows user-facing copy when stream finished without send_file (status done)', async () => {
    await act(async () => {
      root.render(
        React.createElement(PptSessionCard, {
          pagesDir: PAGES_DIR,
          projectPath: '/tmp/ppt-panel-root',
          status: 'done',
          linkedPptFile: undefined,
        }),
      );
    });
    await flushMicrotasks();
    const card = container.querySelector('[data-testid="cli-output-ppt-card"]');
    expect(card?.textContent).toContain('未收到可下载的演示文稿');
    expect(card?.textContent).not.toContain('正在生成中');
  });

  it('does not re-fetch file meta when linkedPptFile is a new object with the same path while streaming', async () => {
    let metaCalls = 0;
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/projects/local-file-meta') {
        metaCalls += 1;
        return {
          ok: true,
          json: async () => ({ generatedAt: 1_704_000_000_000 }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const linkedA = {
      name: 'NotebookLM.pptx',
      path: '/tmp/out/notebook.pptx',
      kind: 'ppt' as const,
    };
    const linkedB = { ...linkedA };

    await act(async () => {
      root.render(
        React.createElement(PptSessionCard, {
          pagesDir: PAGES_DIR,
          projectPath: '/tmp/ppt-panel-root',
          status: 'streaming',
          linkedPptFile: linkedA,
        }),
      );
    });
    await flushMicrotasks();

    expect(metaCalls).toBe(1);
    expect(container.querySelector('[data-testid="cli-output-ppt-card-loading"]')).toBeNull();
    expect(container.querySelector('[data-testid="cli-output-ppt-open"]')).not.toBeNull();

    await act(async () => {
      root.render(
        React.createElement(PptSessionCard, {
          pagesDir: PAGES_DIR,
          projectPath: '/tmp/ppt-panel-root',
          status: 'streaming',
          linkedPptFile: linkedB,
        }),
      );
    });
    await flushMicrotasks();

    expect(metaCalls).toBe(1);
    expect(container.querySelector('[data-testid="cli-output-ppt-card-loading"]')).toBeNull();
  });

  it('does not bind an absolute linked PPT file to projectPath', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/projects/local-file-meta') {
        return {
          ok: true,
          json: async () => ({ generatedAt: 1_704_000_000_000 }),
        } as Response;
      }
      return { ok: true, json: async () => ({ path: '/tmp/cwd' }) } as Response;
    });

    await act(async () => {
      root.render(
        React.createElement(PptSessionCard, {
          pagesDir: PAGES_DIR,
          projectPath: 'D:/workspace/current-project',
          status: 'done',
          linkedPptFile: {
            name: 'NotebookLM.pptx',
            path: 'D:/exports/notebook.pptx',
            kind: 'ppt' as const,
          },
        }),
      );
    });
    await flushMicrotasks();

    expect(mockApiFetch).not.toHaveBeenCalledWith('/api/projects/cwd');
    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/projects/local-file-meta');
    expect(metaCall).toBeDefined();
    expect(getJsonBody(metaCall!)).toEqual({ path: 'D:/exports/notebook.pptx' });
    const openButton = container.querySelector<HTMLButtonElement>('[data-testid="cli-output-ppt-open"]');
    expect(openButton?.disabled).toBe(false);
  });
});
