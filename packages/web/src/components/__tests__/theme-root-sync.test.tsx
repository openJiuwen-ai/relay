/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeRootSync } from '@/components/ThemeRootSync';
import { useThemeStore } from '@/stores/themeStore';
import { THEME_STORAGE_KEY } from '@/utils/theme-persistence';

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockStorage[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
  }),
  key: vi.fn(() => null),
  get length() {
    return Object.keys(mockStorage).length;
  },
};

vi.stubGlobal('localStorage', mockLocalStorage);

describe('ThemeRootSync', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockLocalStorage.clear();
    vi.clearAllMocks();
    document.cookie = `${THEME_STORAGE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.documentElement.removeAttribute('data-ui-theme');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useThemeStore.setState({
      theme: 'business',
      isLoaded: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.documentElement.removeAttribute('data-ui-theme');
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('syncs the active theme to the document root dataset', async () => {
    await act(async () => {
      root.render(React.createElement(ThemeRootSync));
    });

    expect(document.documentElement.dataset.uiTheme).toBe('business');

    await act(async () => {
      useThemeStore.getState().setTheme('warm');
    });

    expect(document.documentElement.dataset.uiTheme).toBe('warm');

    await act(async () => {
      useThemeStore.getState().setTheme('dark');
    });

    expect(document.documentElement.dataset.uiTheme).toBe('dark');
  });

  it('restores the theme from cookies when the store has not loaded yet', async () => {
    document.cookie = `${THEME_STORAGE_KEY}=warm; path=/`;
    useThemeStore.setState({
      theme: 'business',
      isLoaded: false,
    });

    await act(async () => {
      root.render(React.createElement(ThemeRootSync));
    });

    expect(useThemeStore.getState().theme).toBe('warm');
    expect(document.documentElement.dataset.uiTheme).toBe('warm');
  });

  it('restores the dark theme from cookies when available', async () => {
    document.cookie = `${THEME_STORAGE_KEY}=dark; path=/`;
    useThemeStore.setState({
      theme: 'business',
      isLoaded: false,
    });

    await act(async () => {
      root.render(React.createElement(ThemeRootSync));
    });

    expect(useThemeStore.getState().theme).toBe('dark');
    expect(document.documentElement.dataset.uiTheme).toBe('dark');
  });
});
