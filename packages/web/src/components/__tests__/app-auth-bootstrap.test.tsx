/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppAuthBootstrap } from '../AppAuthBootstrap';
import { vitestRouter } from '@/vitest-router-mock';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity, setCanCreateModel, setIsSkipAuth } from '@/utils/userId';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/utils/userId', () => ({
  clearAuthIdentity: vi.fn(),
  setCanCreateModel: vi.fn(),
  setIsSkipAuth: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const mockClearAuthIdentity = vi.mocked(clearAuthIdentity);
const mockSetCanCreateModel = vi.mocked(setCanCreateModel);
const mockSetIsSkipAuth = vi.mocked(setIsSkipAuth);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AppAuthBootstrap', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    vi.stubGlobal('location', { pathname: '/', href: 'http://localhost/' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vitestRouter.pathname = '/';
    mockApiFetch.mockReset();
    mockClearAuthIdentity.mockReset();
    mockSetCanCreateModel.mockReset();
    mockSetIsSkipAuth.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders children and stores isskip when startup auth reports logged in', async () => {
    mockApiFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ islogin: true, isskip: true, canCreateModel: true })),
    );

    await act(async () => {
      root.render(React.createElement(AppAuthBootstrap, null, React.createElement('div', null, 'ready')));
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/islogin');
    expect(mockSetIsSkipAuth).toHaveBeenCalledWith(true);
    expect(mockSetCanCreateModel).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain('ready');
  });

  it('redirects to login when startup auth reports not logged in', async () => {
    const mockReplace = vi.fn();
    vi.stubGlobal('location', { pathname: '/', href: 'http://localhost/', replace: mockReplace });

    mockApiFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ islogin: false, isskip: false, canCreateModel: false })),
    );

    await act(async () => {
      root.render(React.createElement(AppAuthBootstrap, null, React.createElement('div', null, 'ready')));
    });
    await flush();

    expect(mockSetIsSkipAuth).toHaveBeenCalledWith(false);
    expect(mockSetCanCreateModel).toHaveBeenCalledWith(false);
    expect(mockClearAuthIdentity).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(container.textContent).not.toContain('ready');

    vi.unstubAllGlobals();
  });

it('does not run startup auth on the login page', async () => {
    vitestRouter.pathname = '/login';
    const mockReplace = vi.fn();
    vi.stubGlobal('location', { pathname: '/login', href: 'http://localhost/login', replace: mockReplace });

    await act(async () => {
      root.render(React.createElement(AppAuthBootstrap, null, React.createElement('div', null, 'login')));
    });
    await flush();

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(container.textContent).toContain('login');

    vi.unstubAllGlobals();
  });
});
