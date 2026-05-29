/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainerHeader } from '@/components/ChatContainerHeader';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'warm', toggleTheme: vi.fn() }),
}));

vi.mock('@/stores/chatStore', () => {
  const state = { openHub: vi.fn() };
  const hook = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useChatStore: hook };
});

describe('ChatContainerHeader safe-area', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('keeps safe-area class while using token-backed icon buttons', async () => {
    await act(async () => {
      root.render(
        React.createElement(ChatContainerHeader, {
          sidebarOpen: false,
          onToggleSidebar: vi.fn(),
          threadId: 'default',
          authPendingCount: 0,
          viewMode: 'single',
          onToggleViewMode: vi.fn(),
          onOpenMobileStatus: vi.fn(),
          defaultVoiceAgentId: 'opus',
        }),
      );
    });

    const header = container.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.className).toContain('safe-area-top');

    const iconButtons = Array.from(container.querySelectorAll('button'));
    expect(iconButtons.length).toBeGreaterThanOrEqual(2);
    expect(iconButtons.every((button) => button.className.includes('ui-icon-button'))).toBe(true);
  });
});
