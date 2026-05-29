/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorConfigTab } from '@/components/channels-panel/components/ConnectorConfigTab';
import {
  HubCoCreatorOverviewCard,
  HubMemberOverviewCard,
  HubOverviewToolbar,
} from '@/components/HubMemberOverviewCard';
import { SkillsTab } from '@/components/skills-panel/components/SkillsTab';
import type { AgentData } from '@/hooks/useAgentData';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/components/skills-panel/UploadSkillModal', () => ({ UploadSkillModal: () => null }));
vi.mock('@/components/channels-panel/components/WeixinQrPanel', () => ({
  WeixinQrPanel: () => React.createElement('div', { 'data-testid': 'weixin-qr' }),
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

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
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

function mockOverflow(node: Element, { clientWidth, scrollWidth }: { clientWidth: number; scrollWidth: number }) {
  Object.defineProperty(node, 'clientWidth', {
    configurable: true,
    value: clientWidth,
  });
  Object.defineProperty(node, 'scrollWidth', {
    configurable: true,
    value: scrollWidth,
  });
}

function mockBlockOverflow(node: Element, clientHeight: number, scrollHeight: number) {
  Object.defineProperty(node, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(node, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
}

const sampleCat = {
  id: 'office',
  displayName: 'Office',
  breedDisplayName: 'Office',
  nickname: 'Ops',
  provider: 'openai',
  defaultModel: 'gpt-5',
  mentionPatterns: ['@office', '@ops'],
  source: 'config',
  roster: { available: true },
} as unknown as AgentData;

let intersectionObserverCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;

describe('business theme secondary surfaces', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class MockIntersectionObserver {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        intersectionObserverCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });

  beforeEach(() => {
    vi.useFakeTimers();
    intersectionObserverCallback = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all') || url.startsWith('/api/skills?')) {
        const parsed = new URL(url, 'https://example.test');
        const category = parsed.searchParams.get('category');
        const skills =
          category === 'developer-tools'
            ? [
                {
                  id: 'skill-1',
                  slug: 'skill-1',
                  name: 'skill-1',
                  description: 'search helper',
                  tags: ['developer-tools'],
                  repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                  isInstalled: false,
                },
              ]
            : category === 'ai-intelligence'
              ? [
                  {
                    id: 'alpha-helper',
                    slug: 'alpha-helper',
                    name: 'alpha-helper',
                    description: 'alpha helper',
                    tags: ['ai-intelligence'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                ]
              : [
                  {
                    id: 'skill-1',
                    slug: 'skill-1',
                    name: 'skill-1',
                    description: 'search helper',
                    tags: ['developer-tools'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                  {
                    id: 'alpha-helper',
                    slug: 'alpha-helper',
                    name: 'alpha-helper',
                    description: 'alpha helper',
                    tags: ['ai-intelligence'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                ];
        return Promise.resolve(
          jsonResponse({
            skills,
            total: skills.length,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/connector/status') {
        return Promise.resolve(
          jsonResponse({
            platforms: [
              {
                id: 'slack',
                name: 'Slack',
                nameEn: 'Slack',
                configured: false,
                docsUrl: 'https://example.com/docs',
                steps: ['Open app settings', 'Save credentials'],
                fields: [{ envName: 'SLACK_TOKEN', label: 'Token', sensitive: false, currentValue: null }],
              },
            ],
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
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  it('renders member surfaces with shared card and button tokens', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          'div',
          null,
          React.createElement(HubOverviewToolbar, { onAddMember: vi.fn() }),
          React.createElement(HubCoCreatorOverviewCard, {
            coCreator: {
              name: 'ME',
              aliases: ['me'],
              mentionPatterns: ['@me'],
              color: { primary: '#D4A76A', secondary: '#FFF8F0' },
              avatar: undefined,
            },
            onEdit: vi.fn(),
          }),
          React.createElement(HubMemberOverviewCard, {
            member: sampleCat,
            onEdit: vi.fn(),
            onToggleAvailability: vi.fn(),
          }),
        ),
      );
    });

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('添加成员'),
    );
    expect(button?.className).toContain('ui-button-primary');
    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections.some((section) => section.className.includes('ui-card-muted'))).toBe(true);
    expect(sections.some((section) => section.className.includes('ui-card'))).toBe(true);
    expect(sections.some((section) => section.className.includes('ui-card-hover'))).toBe(true);
  });

  it('renders SkillsTab with tokenized cards, fields, and actions', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();
    await flushEffects();

    expect(container.querySelector('input')?.className).toContain('ui-input');
    const plazaHeading = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(2)'),
    );
    const searchInput = container.querySelector('input[aria-label="搜索技能"]');
    const firstSkillCard = container.querySelector('article');
    expect(
      Boolean(
        plazaHeading &&
          searchInput &&
          firstSkillCard &&
          (plazaHeading.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
          (searchInput.compareDocumentPosition(firstSkillCard) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ),
    ).toBe(true);
    expect(firstSkillCard?.className).toContain('ui-card');
    expect(firstSkillCard?.className).toContain('ui-card-hover');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((button) => button.textContent?.includes('安装'))).toBe(true);
    expect(buttons.some((button) => button.textContent?.includes('导入'))).toBe(false);
  });

  it('shows a centered loading icon instead of loading text while plaza skills are loading', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all')) {
        return new Promise<Response>(() => {});
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(SkillsTab));
      await Promise.resolve();
    });

    const loadingState = container.querySelector('[data-testid="skills-loading-state"]');
    expect(loadingState).not.toBeNull();
    expect(loadingState?.className).toContain('items-center');
    expect(loadingState?.className).toContain('justify-center');
    expect(loadingState?.querySelector('img')).not.toBeNull();
    expect(container.textContent).not.toContain('加载中...');
  });

  it('keeps plaza search controls outside the results region', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();
    await flushEffects();

    const fixedHeader = container.querySelector('[data-testid="hub-skills-fixed-header"]') as HTMLDivElement | null;
    const scrollRegion = container.querySelector('[data-testid="hub-skills-scroll-region"]') as HTMLDivElement | null;
    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;

    expect(fixedHeader).not.toBeNull();
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion?.className).not.toContain('overflow-y-auto');
    expect(fixedHeader?.contains(searchInput)).toBe(true);
    expect(scrollRegion?.contains(searchInput)).toBe(false);
    expect(scrollRegion?.querySelector('article')).not.toBeNull();
  });

  it('uses the shared custom tooltip for plaza skill descriptions', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const descriptionNode = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('search helper'),
    );
    expect(descriptionNode).not.toBeNull();
    expect(descriptionNode?.getAttribute('title')).toBeNull();

    await act(async () => {
      descriptionNode?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    if (!descriptionNode) return;
    mockOverflow(descriptionNode, { clientWidth: 180, scrollWidth: 180 });
    mockBlockOverflow(descriptionNode, 44, 88);

    await act(async () => {
      descriptionNode.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('search helper');
  });

  it('shows the full plaza skill title in a tooltip when the title is truncated', async () => {
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
                id: 'skill-very-long-title',
                slug: 'skill-very-long-title-that-should-show-in-tooltip',
                name: 'skill-very-long-title-that-should-show-in-tooltip',
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

    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const title = 'skill-very-long-title-that-should-show-in-tooltip';
    const titleNode = Array.from(container.querySelectorAll('h3')).find((candidate) => candidate.textContent === title);
    expect(titleNode).not.toBeNull();
    expect(titleNode?.getAttribute('title')).toBeNull();
    if (!titleNode) return;

    mockOverflow(titleNode, { clientWidth: 120, scrollWidth: 320 });

    await act(async () => {
      titleNode.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(title);
  });

  it('keeps the plaza category badge auto-sized and shows a tooltip when truncated', async () => {
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['super-long-category'] }));
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
                tags: ['这是一个非常非常长的技能广场分类名称用于验证tooltip'],
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

    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const badge = container.querySelector('.ui-badge-muted') as HTMLElement | null;
    expect(badge).not.toBeNull();
    const badgeClasses = badge?.className.split(/\s+/) ?? [];
    expect(badgeClasses).toContain('max-w-full');
    expect(badgeClasses).not.toContain('w-full');

    if (!badge) return;
    mockOverflow(badge, { clientWidth: 96, scrollWidth: 280 });

    await act(async () => {
      badge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(
      '这是一个非常非常长的技能广场分类名称用于验证tooltip',
    );
  });

  it('debounces input changes and uses remote plaza search', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'alpha');
    await flushEffects();
    expect(mockApiFetch.mock.calls.some(([input]) => String(input).startsWith('/api/skills/search'))).toBe(false);

    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url.startsWith('/api/skills/search')) {
        const parsed = new URL(url, 'https://example.test');
        expect(parsed.searchParams.get('keyword')).toBe('alpha');
        expect(parsed.searchParams.get('page')).toBe('1');
        expect(parsed.searchParams.get('limit')).toBe('24');
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'alpha-helper',
                slug: 'alpha-helper',
                name: 'alpha-helper',
                description: 'alpha helper',
                tags: ['ai-intelligence'],
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

    await advanceTimers(300);
    await flushEffects();
    await flushEffects();

    expect(container.textContent).toContain('alpha-helper');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/search?page=1&limit=24&keyword=alpha', {
      signal: expect.any(AbortSignal),
    });
  });

  it('keeps the active category when searching from a category tab', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const developerTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('开发工具'),
    );
    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(developerTab).not.toBeUndefined();
    expect(searchInput).not.toBeNull();

    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url === '/api/skills/all?page=1&limit=24') {
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
              {
                id: 'alpha-helper',
                slug: 'alpha-helper',
                name: 'alpha-helper',
                description: 'alpha helper',
                tags: ['ai-intelligence'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 2,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/skills/all?page=1&limit=24&category=developer-tools') {
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
      if (url.startsWith('/api/skills/search')) {
        const parsed = new URL(url, 'https://example.test');
        if (
          parsed.searchParams.get('page') === '1' &&
          parsed.searchParams.get('limit') === '24' &&
          parsed.searchParams.get('keyword') === 'alpha' &&
          parsed.searchParams.get('category') === 'developer-tools'
        ) {
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
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      developerTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    await changeInputValue(searchInput!, 'alpha');
    await advanceTimers(300);
    await flushEffects();

    const heading = Array.from(container.querySelectorAll('p')).find((candidate) => candidate.textContent?.includes('(1)'));
    expect(heading?.textContent).toContain('开发工具 (1)');
    expect(
      mockApiFetch.mock.calls.some(([input, init]) => {
        const url = String(input);
        if (!url.startsWith('/api/skills/search')) return false;
        const parsed = new URL(url, 'https://example.test');
        return (
          parsed.searchParams.get('page') === '1' &&
          parsed.searchParams.get('limit') === '24' &&
          parsed.searchParams.get('keyword') === 'alpha' &&
          parsed.searchParams.get('category') === 'developer-tools' &&
          init?.signal instanceof AbortSignal
        );
      }),
    ).toBe(true);
  });

  it('loads more search results using the search endpoint pagination', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    await changeInputValue(searchInput!, 'alpha');

    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url.startsWith('/api/skills/all')) {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/skills/search?page=1&limit=24&keyword=alpha') {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'alpha-1',
                slug: 'alpha-1',
                name: 'alpha-1',
                description: 'alpha page 1',
                tags: ['ai-intelligence'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 2,
            page: 1,
            hasMore: true,
          }),
        );
      }
      if (url === '/api/skills/search?page=2&limit=24&keyword=alpha') {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'alpha-2',
                slug: 'alpha-2',
                name: 'alpha-2',
                description: 'alpha page 2',
                tags: ['ai-intelligence'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 2,
            page: 2,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await advanceTimers(300);
    await flushEffects();

    expect(intersectionObserverCallback).not.toBeNull();
    await act(async () => {
      intersectionObserverCallback?.([{ isIntersecting: true }]);
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.textContent).toContain('alpha-1');
    expect(container.textContent).toContain('alpha-2');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/search?page=2&limit=24&keyword=alpha', {
      signal: expect.any(AbortSignal),
    });
  });

  it('loads more category search results with the active category preserved', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const developerTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('开发工具'),
    );
    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(developerTab).not.toBeUndefined();
    expect(searchInput).not.toBeNull();

    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url === '/api/skills/all?page=1&limit=24') {
        return Promise.resolve(
          jsonResponse({
            skills: [],
            total: 0,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/skills/all?page=1&limit=24&category=developer-tools') {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'alpha-1',
                slug: 'alpha-1',
                name: 'alpha-1',
                description: 'alpha page 1',
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
      if (url.startsWith('/api/skills/search')) {
        const parsed = new URL(url, 'https://example.test');
        if (
          parsed.searchParams.get('limit') === '24' &&
          parsed.searchParams.get('keyword') === 'alpha' &&
          parsed.searchParams.get('category') === 'developer-tools'
        ) {
          if (parsed.searchParams.get('page') === '1') {
            return Promise.resolve(
              jsonResponse({
                skills: [
                  {
                    id: 'alpha-1',
                    slug: 'alpha-1',
                    name: 'alpha-1',
                    description: 'alpha page 1',
                    tags: ['developer-tools'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                ],
                total: 2,
                page: 1,
                hasMore: true,
              }),
            );
          }
          if (parsed.searchParams.get('page') === '2') {
            return Promise.resolve(
              jsonResponse({
                skills: [
                  {
                    id: 'alpha-2',
                    slug: 'alpha-2',
                    name: 'alpha-2',
                    description: 'alpha page 2',
                    tags: ['developer-tools'],
                    repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                    isInstalled: false,
                  },
                ],
                total: 2,
                page: 2,
                hasMore: false,
              }),
            );
          }
        }
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      developerTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await flushEffects();

    await changeInputValue(searchInput!, 'alpha');
    await advanceTimers(300);
    await flushEffects();

    expect(intersectionObserverCallback).not.toBeNull();
    await act(async () => {
      intersectionObserverCallback?.([{ isIntersecting: true }]);
      await Promise.resolve();
    });
    await flushEffects();

    expect(container.textContent).toContain('alpha-1');
    expect(container.textContent).toContain('alpha-2');
    expect(
      mockApiFetch.mock.calls.some(([input, init]) => {
        const url = String(input);
        if (!url.startsWith('/api/skills/search')) return false;
        const parsed = new URL(url, 'https://example.test');
        return (
          parsed.searchParams.get('page') === '2' &&
          parsed.searchParams.get('limit') === '24' &&
          parsed.searchParams.get('keyword') === 'alpha' &&
          parsed.searchParams.get('category') === 'developer-tools' &&
          init?.signal instanceof AbortSignal
        );
      }),
    ).toBe(true);
  });

  it('clearing the search box falls back to browse results after debounce', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();

    const searchInput = container.querySelector('input[aria-label="搜索技能"]') as HTMLInputElement | null;
    expect(searchInput).not.toBeNull();

    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url === '/api/skills/all?page=1&limit=24') {
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
      if (url === '/api/skills/search?page=1&limit=24&keyword=alpha') {
        return Promise.resolve(
          jsonResponse({
            skills: [
              {
                id: 'alpha-1',
                slug: 'alpha-1',
                name: 'alpha-1',
                description: 'alpha page 1',
                tags: ['ai-intelligence'],
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

    await changeInputValue(searchInput!, 'alpha');
    await advanceTimers(300);
    await flushEffects();
    expect(container.textContent).toContain('alpha-1');

    await changeInputValue(searchInput!, '');
    await advanceTimers(300);
    await flushEffects();

    expect(container.textContent).toContain('skill-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/skills/all?page=1&limit=24', { signal: expect.any(AbortSignal) });
  });

  it('uses the active category name as the plaza title', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const initialHeading = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(2)'),
    );
    expect(initialHeading?.textContent).toContain('全部 (2)');

    const developerTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('开发工具'),
    );
    expect(developerTab).not.toBeUndefined();

    await act(async () => {
      developerTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();
    await flushEffects();

    const updatedHeading = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(1)'),
    );
    expect(updatedHeading?.textContent).toContain('开发工具 (1)');
    expect(updatedHeading?.textContent).not.toContain('技能广场');
  });

  it('keeps the previous heading count until the new category results arrive', async () => {
    let resolveCategoryRequest: ((value: Response) => void) | null = null;
    mockApiFetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/skills/categories') {
        return Promise.resolve(jsonResponse({ categories: ['developer-tools', 'ai-intelligence'] }));
      }
      if (url === '/api/skills/all?page=1&limit=24') {
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
              {
                id: 'alpha-helper',
                slug: 'alpha-helper',
                name: 'alpha-helper',
                description: 'alpha helper',
                tags: ['ai-intelligence'],
                repo: { githubOwner: 'openai', githubRepoName: 'skills' },
                isInstalled: false,
              },
            ],
            total: 2,
            page: 1,
            hasMore: false,
          }),
        );
      }
      if (url === '/api/skills/all?page=1&limit=24&category=developer-tools') {
        return new Promise<Response>((resolve) => {
          resolveCategoryRequest = resolve;
        });
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(SkillsTab));
    });
    await flushEffects();
    await flushEffects();

    const developerTab = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('开发工具'),
    );
    expect(developerTab).not.toBeUndefined();

    await act(async () => {
      developerTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const headingDuringLoad = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(2)'),
    );
    expect(headingDuringLoad?.textContent).toContain('全部 (2)');

    await act(async () => {
      resolveCategoryRequest?.(
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
      await Promise.resolve();
    });
    await flushEffects();

    const headingAfterLoad = Array.from(container.querySelectorAll('p')).find((candidate) =>
      candidate.textContent?.includes('(1)'),
    );
    expect(headingAfterLoad?.textContent).toContain('开发工具 (1)');
  });

  it('renders ConnectorConfigTab with tokenized cards and form controls', async () => {
    await act(async () => {
      root.render(React.createElement(ConnectorConfigTab));
    });
    await flushEffects();

    const leftPane = container.querySelector('[data-testid="connector-left-pane"]');
    const rightPane = container.querySelector('[data-testid="connector-right-pane"]');
    expect(leftPane).not.toBeNull();
    expect(rightPane).not.toBeNull();

    const slackItem = container.querySelector('[data-testid="platform-item-slack"]');
    expect(slackItem?.className).toContain('[border-radius:var(--connector-tab-radius)]');
    await act(async () => {
      slackItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('input')?.className).toContain('ui-input');
    const buttons = Array.from(container.querySelectorAll('button'));
    // Button uses CSS Modules with camelCase class names (uiButtonMajor, uiButtonDefault)
    expect(buttons.some((button) => button.className.includes('uiButtonMajor') || button.className.includes('ui-button-major'))).toBe(true);
    expect(buttons.some((button) => button.className.includes('uiButtonDefault') || button.className.includes('ui-button-default'))).toBe(true);
  });
});
