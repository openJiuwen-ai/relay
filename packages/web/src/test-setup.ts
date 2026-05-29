/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// Polyfills for jsdom test environment
import React from 'react';
import { beforeEach, vi } from 'vitest';
import { vitestRouter } from '@/vitest-router-mock';

function VitestLink({
  to,
  children,
  ...rest
}: {
  to?: string | { pathname?: string };
  children?: React.ReactNode;
  [k: string]: unknown;
}) {
  const href = typeof to === 'string' ? to : (to?.pathname ?? '#');
  return React.createElement('a', { href, ...rest }, children);
}

// React Flow requires ResizeObserver
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not provide localStorage by default in all vitest contexts
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.getItem !== 'function') {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage;
}

// useConfirm hook: provide a no-op confirm globally so components can render without <ConfirmProvider>
vi.mock('@/components/useConfirm', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true),
}));

// react-router-dom — keep real router components; stub hooks + Link for jsdom unit tests
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...mod,
    useNavigate: () => vitestRouter.navigate,
    useLocation: () => ({
      pathname: vitestRouter.pathname,
      search: vitestRouter.search,
      hash: vitestRouter.hash,
      state: null,
      key: 'vitest-router',
    }),
    useParams: () => vitestRouter.params,
    Link: VitestLink,
    NavLink: VitestLink,
  };
});

beforeEach(() => {
  vitestRouter.navigate.mockReset();
  vitestRouter.pathname = '/';
  vitestRouter.search = '';
  vitestRouter.hash = '';
  vitestRouter.params = {};
});
