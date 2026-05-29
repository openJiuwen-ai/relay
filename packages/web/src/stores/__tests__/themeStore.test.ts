/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '../themeStore';
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

beforeEach(() => {
  mockLocalStorage.clear();
  vi.clearAllMocks();
  document.cookie = `${THEME_STORAGE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  useThemeStore.setState({
    theme: 'business',
    isLoaded: false,
  });
});

describe('themeStore', () => {
  it('keeps theme runtime state without embedding style config objects', () => {
    const state = useThemeStore.getState() as unknown as Record<string, unknown>;

    expect(state.theme).toBe('business');
    expect(state.isLoaded).toBe(false);
    expect('config' in state).toBe(false);
  });

  it('initializes from localStorage while remaining config-free', () => {
    mockStorage[THEME_STORAGE_KEY] = 'business';

    useThemeStore.getState().initializeTheme();

    const state = useThemeStore.getState() as unknown as Record<string, unknown>;
    expect(state.theme).toBe('business');
    expect(state.isLoaded).toBe(true);
    expect('config' in state).toBe(false);
  });

  it('migrates legacy default theme storage to business', () => {
    mockStorage[THEME_STORAGE_KEY] = 'default';

    useThemeStore.getState().initializeTheme();

    const state = useThemeStore.getState() as unknown as Record<string, unknown>;
    expect(state.theme).toBe('business');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'business');
    expect(document.cookie).toContain(`${THEME_STORAGE_KEY}=business`);
  });

  it('persists theme selection to both localStorage and cookies', () => {
    useThemeStore.getState().setTheme('warm');

    const state = useThemeStore.getState();
    expect(state.theme).toBe('warm');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'warm');
    expect(document.cookie).toContain(`${THEME_STORAGE_KEY}=warm`);
  });

  it('accepts and persists the dark theme selection', () => {
    useThemeStore.getState().setTheme('dark');

    const state = useThemeStore.getState();
    expect(state.theme).toBe('dark');
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
    expect(document.cookie).toContain(`${THEME_STORAGE_KEY}=dark`);
  });

  it('prefers the cookie theme so desktop random ports keep the same choice', () => {
    document.cookie = `${THEME_STORAGE_KEY}=warm; path=/`;

    useThemeStore.getState().initializeTheme();

    const state = useThemeStore.getState();
    expect(state.theme).toBe('warm');
    expect(state.isLoaded).toBe(true);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'warm');
  });

  it('cycles through business, warm, and dark when toggling', () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('warm');

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');

    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('business');
  });
});
