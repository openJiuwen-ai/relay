/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it } from 'vitest';
import { consumeBackgroundSystemInfo } from '@/hooks/useSocket-background-system-info';
import type { HandleBackgroundMessageOptions } from '@/hooks/useSocket-background.types';
import { useChatStore } from '@/stores/chatStore';

function createBackgroundOptions(): HandleBackgroundMessageOptions {
  let seq = 0;
  return {
    store: useChatStore.getState(),
    bgStreamRefs: new Map(),
    finalizedBgRefs: new Map(),
    replacedInvocations: new Map(),
    backgroundErrorToastsShown: new Set(),
    nextBgSeq: () => {
      seq += 1;
      return seq;
    },
    addToast: () => undefined,
    clearDoneTimeout: () => undefined,
  };
}

describe('preview auto-open store', () => {
  afterEach(() => {
    // Reset store between tests
    window.localStorage.clear();
    useChatStore.setState({
      currentThreadId: 'default',
      messages: [],
      threadStates: {},
      pendingPreviewAutoOpen: null,
      pptStudioSessions: {},
      activePptPagesDir: null,
      rightPanelMode: 'status',
    });
  });

  it('pendingPreviewAutoOpen defaults to null', () => {
    const state = useChatStore.getState();
    expect(state.pendingPreviewAutoOpen).toBeNull();
  });

  it('setPendingPreviewAutoOpen stores port and path', () => {
    useChatStore.getState().setPendingPreviewAutoOpen({ port: 5173, path: '/about' });
    const state = useChatStore.getState();
    expect(state.pendingPreviewAutoOpen).toEqual({ port: 5173, path: '/about' });
  });

  it('setPendingPreviewAutoOpen does not switch to the retired workspace panel', () => {
    useChatStore.setState({ rightPanelMode: 'status' });
    useChatStore.getState().setPendingPreviewAutoOpen({ port: 5173, path: '/' });
    expect(useChatStore.getState().rightPanelMode).toBe('status');
  });

  it('consumePreviewAutoOpen returns and clears pending', () => {
    useChatStore.getState().setPendingPreviewAutoOpen({ port: 3000, path: '/home' });
    const consumed = useChatStore.getState().consumePreviewAutoOpen();
    expect(consumed).toEqual({ port: 3000, path: '/home' });
    expect(useChatStore.getState().pendingPreviewAutoOpen).toBeNull();
  });

  it('consumePreviewAutoOpen returns null when nothing pending', () => {
    const consumed = useChatStore.getState().consumePreviewAutoOpen();
    expect(consumed).toBeNull();
  });

  it('keeps background-thread ppt studio updates off the active timeline but restores them on thread switch', () => {
    useChatStore.setState({
      currentThreadId: 'thread-active',
      messages: [{ id: 'user-1', type: 'user', content: '继续生成', timestamp: 1 }],
      rightPanelMode: 'status',
      threadStates: {},
      threads: [
        {
          id: 'thread-active',
          title: null,
          projectPath: '/tmp/active',
          createdBy: 'user',
          participants: ['user'],
          lastActiveAt: 0,
          createdAt: 0,
        },
        {
          id: 'thread-ppt',
          title: null,
          projectPath: '/tmp/ppt-bg',
          createdBy: 'user',
          participants: ['user'],
          lastActiveAt: 0,
          createdAt: 0,
        },
      ],
      pptStudioSessions: {},
    });

    const result = consumeBackgroundSystemInfo(
      {
        type: 'system_info',
        agentId: 'codex',
        threadId: 'thread-ppt',
        content: JSON.stringify({
          type: 'ppt_studio_page',
          session: {
            pagesDir: 'output/demo/pages',
            deckTitle: 'Quarterly review',
            slides: [{ slideId: 'slide-1', pageNumber: 1, htmlPath: 'output/demo/pages/page-1.pptx.html' }],
          },
        }),
        timestamp: Date.now(),
      },
      undefined,
      createBackgroundOptions(),
    );

    expect(result.consumed).toBe(true);
    expect(useChatStore.getState().messages).toEqual([{ id: 'user-1', type: 'user', content: '继续生成', timestamp: 1 }]);
    expect(useChatStore.getState().rightPanelMode).toBe('status');
    expect(useChatStore.getState().pptStudioSessions['output/demo/pages']).toEqual(
      expect.objectContaining({
        projectRoot: '/tmp/ppt-bg',
        pagesDir: 'output/demo/pages',
      }),
    );

    useChatStore.getState().setCurrentThread('thread-ppt');

    expect(useChatStore.getState().rightPanelMode).toBe('fileBrowser');
    expect(useChatStore.getState().pptStudioSessions['output/demo/pages']?.slides).toEqual([
      expect.objectContaining({
        slideId: 'slide-1',
        htmlPath: 'output/demo/pages/page-1.pptx.html',
      }),
    ]);
  });
});
