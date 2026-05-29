/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectorConnectedState } from '../components/ConnectorConnectedState';

describe('ConnectorConnectedState', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('uses the shared compact connected pill styling', async () => {
    await act(async () => {
      root.render(
        React.createElement(ConnectorConnectedState, {
          label: '已连接',
          disconnecting: false,
          onDisconnect: vi.fn(),
          disconnectTestId: 'disconnect-btn',
        }),
      );
    });

    const pill = container.querySelector('[data-testid="connector-connected-pill"]') as HTMLDivElement | null;
    expect(pill).not.toBeNull();
    expect(pill?.className).toContain('w-1/2');
    expect(pill?.className).toContain('h-[34px]');
    expect(pill?.className).toContain('rounded-[8px]');
    expect(pill?.className).toContain('border-[var(--border-default)]');
    expect(pill?.className).toContain('bg-[var(--tag-bg)]');
  });

  it('requires confirmation before invoking disconnect', async () => {
    const onDisconnect = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(ConnectorConnectedState, {
          label: '已连接',
          disconnecting: false,
          onDisconnect,
          disconnectTestId: 'disconnect-btn',
        }),
      );
    });

    const disconnectButton = container.querySelector('[data-testid="disconnect-btn"]') as HTMLButtonElement | null;
    expect(disconnectButton).not.toBeNull();

    await act(async () => {
      disconnectButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="disconnect-btn-confirm-modal"]')).not.toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="disconnect-btn-confirm-submit"]') as HTMLButtonElement | null)?.click();
    });

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});
