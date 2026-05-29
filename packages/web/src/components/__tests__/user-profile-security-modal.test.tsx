/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProfile } from '../UserProfile';

const securityModalSpy = vi.fn();

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'business', setTheme: vi.fn() }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => 'user:Alice',
  getUserName: () => 'Alice',
  getIsSkipAuth: () => false,
}));

vi.mock('../UsageStatsModal', () => ({
  UsageStatsModal: () => null,
}));

vi.mock('../SecurityManagementModal', () => ({
  default: (props: { open: boolean; onClose: () => void }) => {
    securityModalSpy(props);
    return props.open ? React.createElement('div', { 'data-testid': 'security-management-modal-mock' }) : null;
  },
}));

describe('UserProfile security management action', () => {
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
    securityModalSpy.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
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

  it('opens the security management modal from the user profile panel', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;

    act(() => {
      toggle?.click();
    });
    await flush();

    const securityButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('安全管理'));
    expect(securityButton).toBeTruthy();
    expect(securityModalSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: false,
        onClose: expect.any(Function),
      }),
    );

    act(() => {
      securityButton?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="security-management-modal-mock"]')).toBeTruthy();
    expect(securityModalSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        onClose: expect.any(Function),
      }),
    );
  });
});
