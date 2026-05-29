/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatContainerHeader } from '@/components/ChatContainerHeader';

const { mockToggleTheme, mockOpenHub } = vi.hoisted(() => ({
  mockToggleTheme: vi.fn(),
  mockOpenHub: vi.fn(),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'warm', config: null, toggleTheme: mockToggleTheme }),
}));

vi.mock('@/stores/chatStore', () => {
  const state = { openHub: mockOpenHub };
  const hook = Object.assign(
    (selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useChatStore: hook };
});

const defaultProps = {
  sidebarOpen: false,
  onToggleSidebar: vi.fn(),
  threadId: 'default',
  authPendingCount: 0,
  viewMode: 'single' as const,
  onToggleViewMode: vi.fn(),
  onOpenMobileStatus: vi.fn(),
  defaultVoiceAgentId: 'opus',
};

describe('ChatContainerHeader controls', () => {
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
    mockToggleTheme.mockReset();
    mockOpenHub.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('removes page title area while keeping settings/theme controls', () => {
    act(() => {
      root.render(React.createElement(ChatContainerHeader, defaultProps));
    });

    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('img[alt="OfficeClaw"]')).toBeNull();

    const hubBtn = container.querySelector('button[aria-label="OfficeClaw Hub"]') as HTMLButtonElement | null;
    const themeBtn = container.querySelector('button[aria-label="Switch to business theme"]') as HTMLButtonElement | null;
    expect(hubBtn).toBeTruthy();
    expect(themeBtn).toBeTruthy();
  });

  it('still supports settings and theme button interactions', () => {
    act(() => {
      root.render(React.createElement(ChatContainerHeader, defaultProps));
    });

    const hubBtn = container.querySelector('button[aria-label="OfficeClaw Hub"]') as HTMLButtonElement;
    const themeBtn = container.querySelector('button[aria-label="Switch to business theme"]') as HTMLButtonElement;

    act(() => {
      hubBtn.click();
      themeBtn.click();
    });

    expect(mockOpenHub).toHaveBeenCalledTimes(1);
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });
});
