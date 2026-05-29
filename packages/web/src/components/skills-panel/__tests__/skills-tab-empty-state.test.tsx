/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsTab } from '@/components/skills-panel/components/SkillsTab';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

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

async function changeInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('SkillsTab empty search state', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    vi.useFakeTimers();
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class MockIntersectionObserver {
      constructor() {}
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  afterAll(() => {
    vi.useRealTimers();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all?')) {
        const parsedUrl = new URL(url, 'http://localhost');
        const category = parsedUrl.searchParams.get('category');
        if (!category) {
          return Promise.resolve(
            jsonResponse({
              skills: [],
              total: 0,
              page: 1,
              hasMore: false,
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'skill-1',
                slug: 'skill-1',
                name: 'skill-1',
                description: 'Alpha skill',
                category: 'ai-intelligence',
                tags: ['ignored-tag'],
                repo: { githubOwner: 'demo', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 1,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url.startsWith('/api/skills/search?')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockApiFetch.mockReset();
  });

  it('shows the shared empty search state and clears back to the current category browse results', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    const categoryButtons = Array.from(container.querySelectorAll('[data-testid="hub-skills-fixed-header"] button'));
    const categoryButton = categoryButtons[1];
    expect(categoryButton).toBeDefined();

    await act(async () => {
      categoryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();
    expect(container.textContent).toContain('(1)');
    expect(container.textContent).toContain('skill-1');

    await changeInputValue(searchInput!, 'zzz');
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await flushEffects();

    const emptyShell = container.querySelector('[data-testid="hub-skills-empty-state-shell"]') as HTMLDivElement | null;
    expect(emptyShell).not.toBeNull();
    expect(emptyShell?.className).toContain('h-full');
    expect(emptyShell?.className).toContain('items-center');
    expect(emptyShell?.className).toContain('justify-center');
    expect(container.querySelector('[data-testid="no-search-results-clear"]')).not.toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="no-search-results-clear"]') as HTMLButtonElement | null)?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      await Promise.resolve();
    });
    await flushEffects();

    expect((container.querySelector('input[type="text"]') as HTMLInputElement | null)?.value).toBe('');
    expect(container.textContent).toContain('(1)');
    expect(container.textContent).toContain('skill-1');
    expect(
      mockApiFetch.mock.calls.some(([input]) =>
        String(input).includes('/api/skills/all?page=1&limit=24&category=ai-intelligence'),
      ),
    ).toBe(true);
  });

  it('uses the shared empty-data state when browse results are empty', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    const emptyState = container.querySelector('[data-testid="empty-data-state"]') as HTMLDivElement | null;
    expect(emptyState).not.toBeNull();
    expect(emptyState?.querySelector('[data-testid="empty-data-image"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="no-search-results-state"]')).toBeNull();
    expect(container.querySelector('[data-testid="no-search-results-clear"]')).toBeNull();
  });

  it('orders category tabs with 办公套件 immediately after 全部', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', '办公套件', 'communication-collaboration'] }));
      }
      if (url.startsWith('/api/skills/all?')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url.startsWith('/api/skills/search?')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    const categoryButtons = Array.from(container.querySelectorAll('[data-testid="hub-skills-fixed-header"] button')).map(
      (button) => button.textContent?.trim(),
    );
    expect(categoryButtons.slice(0, 4)).toEqual(['全部', '办公套件', '开发工具', '沟通协作']);
  });

  it('keeps no-search-results state for empty search responses', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    const categoryButtons = Array.from(container.querySelectorAll('[data-testid="hub-skills-fixed-header"] button'));
    const categoryButton = categoryButtons[1];
    expect(categoryButton).toBeDefined();

    await act(async () => {
      categoryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'zzz');
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="no-search-results-state"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="no-search-results-clear"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="empty-data-state"]')).toBeNull();
  });

  it('shows backend fallback category instead of a noisy long tag', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools'] }));
      }
      if (url.startsWith('/api/skills/all?')) {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'skill-2',
                slug: 'skill-2',
                name: 'skill-2',
                description: 'Beta skill',
                category: '通用',
                tags: ['This is an unexpectedly long English sentence that should not be used as a badge.'],
                repo: { githubOwner: 'demo', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 1,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url.startsWith('/api/skills/search?')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    });

    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    expect(container.textContent).toContain('skill-2');
    expect(container.textContent).toContain('通用');
    expect(container.textContent).not.toContain(
      'This is an unexpectedly long English sentence that should not be used as a badge.',
    );
  });
});
