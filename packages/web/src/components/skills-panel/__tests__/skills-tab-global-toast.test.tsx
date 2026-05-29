/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsTab } from '@/components/skills-panel/components/SkillsTab';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { notifySkillOptionsChanged } from '@/utils/skill-options-cache';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/utils/skill-options-cache', () => ({ notifySkillOptionsChanged: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);
const mockNotifySkillOptionsChanged = vi.mocked(notifySkillOptionsChanged);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SkillsTab global toast feedback', () => {
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
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useToastStore.setState({ toasts: [] });
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools'] }));
      }
      if (url.startsWith('/api/skills/all')) {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'skill-1',
                slug: 'skill-1',
                name: 'skill-1',
                description: 'search helper',
                tags: ['developer-tools'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 1,
            page: 1,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    mockApiFetch.mockReset();
    mockNotifySkillOptionsChanged.mockReset();
  });

  it('shows a success toast in the global container after skill install succeeds', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools'] }));
      }
      if (url.startsWith('/api/skills/all')) {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'skill-1',
                slug: 'skill-1',
                name: 'skill-1',
                description: 'search helper',
                tags: ['developer-tools'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 1,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/skills/install' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(SkillsTab),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();
    await flushEffects();

    const installButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('安装'),
    );
    expect(installButton).toBeDefined();

    await act(async () => {
      installButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    const toasts = useToastStore.getState().toasts;
    expect(
      toasts.some((toast) => toast.type === 'success' && toast.title === '安装成功' && toast.message.includes('skill-1')),
    ).toBe(true);

    const toastContainer = document.body.querySelector('.fixed');
    expect(toastContainer?.className).toContain('top-6');
    expect(toastContainer?.className).toContain('right-6');
    expect(mockNotifySkillOptionsChanged).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast in the global container after skill install fails', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools'] }));
      }
      if (url.startsWith('/api/skills/all')) {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'skill-1',
                slug: 'skill-1',
                name: 'skill-1',
                description: 'search helper',
                tags: ['developer-tools'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 1,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/skills/install' && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ error: '权限不足' }, 500));
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(SkillsTab),
          React.createElement(ToastContainer),
        ),
      );
    });
    await flushEffects();
    await flushEffects();

    const installButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('安装'),
    );
    expect(installButton).toBeDefined();

    await act(async () => {
      installButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    const toasts = useToastStore.getState().toasts;
    expect(
      toasts.some((toast) => toast.type === 'error' && toast.title === '安装失败' && toast.message.includes('权限不足')),
    ).toBe(true);
  });
});
