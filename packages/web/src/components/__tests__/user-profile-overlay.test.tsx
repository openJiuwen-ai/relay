/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProfile } from '../UserProfile';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity } from '@/utils/userId';

const mockSetTheme = vi.fn();
const mockWindowOpen = vi.fn();
const mockLocationAssign = vi.fn();
const originalLocation = window.location;
let currentTheme: 'business' | 'warm' | 'dark' = 'business';
let currentUserId = 'user:Alice';
let currentUserName = 'Alice';

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: currentTheme, setTheme: mockSetTheme }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => currentUserId,
  getUserName: () => currentUserName,
  getIsSkipAuth: () => false,
  clearAuthIdentity: vi.fn(),
}));

const usageStatsModalSpy = vi.fn();
const mockApiFetch = vi.mocked(apiFetch);
const mockClearAuthIdentity = vi.mocked(clearAuthIdentity);

vi.mock('../UsageStatsModal', () => ({
  UsageStatsModal: (props: { open: boolean; onClose: () => void }) => {
    usageStatsModalSpy(props);
    return props.open ? React.createElement('div', { 'data-testid': 'usage-stats-modal' }) : null;
  },
}));

describe('UserProfile overlay classes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: mockWindowOpen,
    });
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    currentTheme = 'business';
    mockSetTheme.mockReset();
    mockWindowOpen.mockReset();
    mockLocationAssign.mockReset();
    mockApiFetch.mockReset();
    mockClearAuthIdentity.mockReset();
    usageStatsModalSpy.mockReset();

    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: mockLocationAssign,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('renders a stable fallback name on the server before browser user state loads', async () => {
    currentUserId = 'default-user';
    currentUserName = '';
    expect(renderToString(React.createElement(UserProfile))).toContain('未登录');

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    expect(container.textContent).toContain('未登录');
  });

  it('opens settings modal with theme section and no profile theme menu item', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    const toggleAvatar = toggle?.querySelector('div.rounded-full');
    const toggleName = toggle?.querySelector('[data-testid="user-profile-name"]');
    expect(toggle).toBeTruthy();
    expect(toggle?.className).toContain('text-[var(--text-primary)]');
    expect(toggleAvatar?.className).toContain('bg-[var(--surface-avatar-shell)]');
    expect(toggleName?.className).toContain('text-[var(--text-primary)]');

    act(() => {
      toggle?.click();
    });
    await flush();

    const panel = container.querySelector('[data-testid="user-profile-panel"]');
    expect(container.querySelector('[data-testid="user-profile-theme-trigger"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="user-theme-popover"]')).toBeNull();

    const settingsTrigger = container.querySelector('[data-testid="user-profile-settings-trigger"]') as HTMLButtonElement | null;
    const logoutButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('退出登录'));

    expect(panel).toBeTruthy();
    expect(panel?.className).toContain('ui-overlay-card');
    expect(settingsTrigger).toBeTruthy();
    expect(settingsTrigger?.className).toContain('ui-overlay-item');
    expect(logoutButton).toBeTruthy();
    expect(logoutButton?.className).toContain('ui-button-md');

    act(() => {
      settingsTrigger?.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="user-settings-modal"]')).toBeTruthy();
    expect(document.body.textContent).toContain('主题模式');
    const themeOptions = document.body.querySelector('[data-testid="user-theme-options"]');
    expect(themeOptions).toBeTruthy();
    expect(themeOptions?.className).toContain('gap-4');
    expect(themeOptions?.className).not.toContain('justify-between');
  });

  it('does not show keep-awake entry in the profile menu (moved to settings)', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="user-profile-keep-awake-anchor"]')).toBeNull();
    expect(container.querySelector('[data-testid="user-profile-content-actions"]')?.textContent).not.toContain('防休眠');
  });

  it('uses the warm selected badge color for the orange-white theme option in settings', async () => {
    currentTheme = 'warm';

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="user-profile-settings-trigger"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    const warmBadge = document.body.querySelector('[data-testid="user-theme-selected-badge-warm"]') as HTMLDivElement | null;
    expect(warmBadge).toBeTruthy();
    expect(warmBadge?.style.backgroundColor).toBe('var(--theme-preview-warm-badge)');
  });

  it('shows the full username in an overflow tooltip when the visible name is truncated', async () => {
    currentUserName = 'very-long-user-name-for-overflow-tooltip-check';

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();
    vi.useFakeTimers();

    const toggleName = container.querySelector('[data-testid="user-profile-name"]') as HTMLDivElement | null;
    expect(toggleName).toBeTruthy();
    expect(toggleName?.getAttribute('title')).toBeNull();

    Object.defineProperty(toggleName!, 'clientWidth', { configurable: true, value: 80 });
    Object.defineProperty(toggleName!, 'scrollWidth', { configurable: true, value: 220 });

    await act(async () => {
      toggleName?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('very-long-user-name-for-overflow-tooltip-check');
  });

  it('uses the shared right tooltip for the collapsed avatar instead of a native title', async () => {
    currentUserName = 'Alice Collapsed';
    vi.useFakeTimers();

    act(() => {
      root.render(React.createElement(UserProfile, { collapsed: true }));
    });

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();
    expect(toggle?.getAttribute('title')).toBeNull();
    expect(toggle?.getAttribute('aria-label')).toBe('Alice Collapsed');

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip?.dataset.placement).toBe('right');
    expect(tooltip?.textContent).toContain('Alice Collapsed');
    vi.useRealTimers();
  });

  it('selects warm theme from the settings modal', async () => {
    currentTheme = 'business';

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="user-profile-settings-trigger"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    const warmThemeOption = document.body.querySelector('[data-testid="user-theme-option-warm"]') as HTMLButtonElement | null;
    expect(warmThemeOption).toBeTruthy();
    expect(warmThemeOption?.textContent).toContain('橙白');

    act(() => {
      warmThemeOption?.click();
    });
    await flush();

    expect(mockSetTheme).toHaveBeenCalledWith('warm');
  });

  it('calls handle_memory_toggle when toggling long-term memory in settings', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="user-profile-settings-trigger"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    act(() => {
      (document.body.querySelector('[data-testid="user-settings-tab-memory"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    const memorySwitch = document.body.querySelector('[data-testid="user-settings-memory-switch"]') as HTMLButtonElement | null;
    expect(memorySwitch).toBeTruthy();
    expect(memorySwitch?.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      memorySwitch?.click();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/handle_memory_toggle',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }),
    );
    expect(memorySwitch?.getAttribute('aria-checked')).toBe('true');
  });

  it('opens the about popover and reuses the help action inside it', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.trim() === '帮助')).toBe(false);

    act(() => {
      (container.querySelector('[data-testid="user-profile-about-trigger"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="user-about-popover"]')).toBeTruthy();

    act(() => {
      (document.body.querySelector('[data-testid="user-about-help-action"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://support.huaweicloud.com/officeclaw-agentarts-pc/officeclaw-agentarts-pc-0001.html',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens the feedback modal from the help popover', async () => {
    currentUserId = 'user:Alice';
    currentUserName = 'Alice';
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="user-profile-about-trigger"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="user-about-popover"]')).toBeTruthy();

    act(() => {
      (document.body.querySelector('[data-testid="user-about-feedback-action"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="feedback-modal"]')).toBeTruthy();
  });

  it('falls back to the default logout url when the logout request fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    const logoutButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('退出登录'));
    expect(logoutButton).toBeTruthy();

    await act(async () => {
      logoutButton?.click();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockClearAuthIdentity).toHaveBeenCalledTimes(1);
    expect(mockLocationAssign).toHaveBeenCalledWith(
      'https://auth.huaweicloud.com/authui/login.html?service=https://auth.huaweicloud.com/authui/v1/oauth2/authorize?',
    );
  });

  it('shows security management before 帮助与反馈 and keeps the panel open on click', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    const actions = container.querySelector('[data-testid="user-profile-content-actions"]');
    expect(actions).toBeTruthy();

    const actionButtons = actions ? Array.from(actions.querySelectorAll('button')) : [];
    const securityButton = actionButtons.find((button) => button.textContent?.includes('安全管理'));
    const supportButton = actionButtons.find((button) => button.textContent?.includes('帮助与反馈'));

    expect(securityButton).toBeTruthy();
    expect(supportButton).toBeTruthy();
    expect(actionButtons.indexOf(securityButton as HTMLButtonElement)).toBeLessThan(
      actionButtons.indexOf(supportButton as HTMLButtonElement),
    );

    act(() => {
      securityButton?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="user-profile-panel"]')).toBeNull();
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('shows usage stats above 帮助与反馈 and opens the usage modal', async () => {
 	     act(() => {
 	       root.render(React.createElement(UserProfile));
 	     });
 	     await flush();
 	 
 	     const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
 	     expect(toggle).toBeTruthy();
 	 
 	     act(() => {
 	       toggle?.click();
 	     });
 	     await flush();
 	 
 	     const actions = container.querySelector('[data-testid="user-profile-content-actions"]');
 	     expect(actions).toBeTruthy();
 	 
 	     const actionButtons = actions ? Array.from(actions.querySelectorAll('button')) : [];
 	     const usageButton = actionButtons.find((button) => button.textContent?.includes('用量统计'));
 	     const supportButton = actionButtons.find((button) => button.textContent?.includes('帮助与反馈'));
 	 
 	     expect(usageButton).toBeTruthy();
 	     expect(supportButton).toBeTruthy();
 	     expect(actionButtons.indexOf(usageButton as HTMLButtonElement)).toBeLessThan(
 	       actionButtons.indexOf(supportButton as HTMLButtonElement),
 	     );
 	     expect(usageStatsModalSpy).not.toHaveBeenCalled();
 	 
 	     act(() => {
 	       usageButton?.click();
 	     });
 	     await flush();
 	 
 	     expect(container.querySelector('[data-testid="usage-stats-modal"]')).toBeTruthy();
 	     expect(usageStatsModalSpy).toHaveBeenLastCalledWith(
 	       expect.objectContaining({
 	         open: true,
 	         onClose: expect.any(Function),
 	       }),
 	     );
 	   });
});
