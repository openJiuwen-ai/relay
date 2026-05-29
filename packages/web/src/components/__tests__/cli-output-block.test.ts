/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPendingRequest } from '@/hooks/useAuthorization';
import type { CliEvent } from '@/stores/chat-types';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/components/AuthorizationCard', () => ({
  AuthorizationCard: ({ request }: { request: AuthPendingRequest }) =>
    React.createElement('div', { 'data-testid': 'authorization-card' }, request.reason),
}));

vi.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => React.createElement('div', { 'data-testid': 'md' }, content),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

const { CliOutputBlock, extractDisplayedLocalGeneratedFiles } = await import('../cli-output/cli-output-block');
const mockApiFetch = vi.mocked(apiFetch);

let container: HTMLDivElement;
let root: Root;

const doneEvents: CliEvent[] = [
  { id: 'tool-1', kind: 'tool_use', timestamp: 1000, label: 'Read index.ts' },
  { id: 'tool-2', kind: 'tool_result', timestamp: 1001, label: 'Read index.ts', detail: '200 lines' },
  { id: 'text-1', kind: 'text', timestamp: 1002, content: 'Looks good.' },
];

const authRequest: AuthPendingRequest = {
  requestId: 'auth-1',
  agentId: 'codex',
  threadId: 'thread-1',
  action: 'shell_command',
  reason: 'Need approval',
  createdAt: 1003,
};

const SEND_FILE_TEST_TS = Date.UTC(2026, 3, 28);

function sendFileToUserEvent(id: string, detail: Record<string, unknown>): CliEvent {
  return {
    id,
    kind: 'tool_use',
    timestamp: SEND_FILE_TEST_TS,
    label: 'send_file_to_user',
    detail: JSON.stringify(detail),
  };
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function getJsonBody(call: unknown[]): Record<string, unknown> {
  const init = call[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
}

describe('CliOutputBlock', () => {
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
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (path) => {
      if (path === '/api/projects/cwd') {
        return {
          ok: true,
          json: async () => ({ path: 'C:\\Users\\kagol\\.jiuwenclaw\\agent' }),
        } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders the completed tool-call summary when collapsed by default', () => {
    act(() => {
      root.render(React.createElement(CliOutputBlock, { events: doneEvents, status: 'done' }));
    });

    expect(container.textContent).toContain('已执行1次工具调用');
    expect(container.textContent).not.toContain('正在执行工具调用');
  });

  it('finalized stream: tool_use without matching tool_result does not show error icon (neutral; ChatMessage pads tool events before render)', () => {
    const events: CliEvent[] = [
      { id: 'tu-1', kind: 'tool_use', timestamp: 1, label: 'codex → free_search' },
      { id: 'tr-1', kind: 'tool_result', timestamp: 2, label: 'r', detail: 'ok' },
      { id: 'tu-2', kind: 'tool_use', timestamp: 3, label: 'codex → free_search' },
    ];
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events,
          status: 'done',
          defaultExpanded: true,
        }),
      );
    });
    expect(container.querySelector('[data-testid="tool-use-no-result"]')).toBeNull();
    expect(container.textContent).toContain('已执行2次工具调用');
    const tu2 = container.querySelector('[data-testid="tool-row-tu-2"]');
    expect(tu2).not.toBeNull();
    expect(tu2?.querySelector('img[src="/icons/tool-error.svg"]')).toBeNull();
  });

  it('shows tools, markdown, and inline authorization cards when expanded', () => {
    act(() => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: doneEvents,
          status: 'done',
          defaultExpanded: true,
          authorizationRequests: [authRequest],
          onAuthorizationRespond: vi.fn(),
        }),
      );
    });

    expect(container.querySelector('[data-testid="cli-output-body"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="authorization-card"]')?.textContent).toContain('Need approval');
    expect(container.querySelector('[data-testid="md"]')?.textContent).toBe('Looks good.');
    expect(container.textContent).toContain('Read');
  });

  it('extracts displayed local generated files from send_file_to_user payloads', () => {
    const files = extractDisplayedLocalGeneratedFiles([
      sendFileToUserEvent('send-1', {
        abs_file_path_list: [{ path: 'reports\\quarterly-summary.md', file_name: 'quarterly-summary.md' }],
      }),
    ]);

    expect(files).toEqual([
      {
        kind: 'markdown',
        name: 'quarterly-summary.md',
        path: 'reports\\quarterly-summary.md',
        fallbackGeneratedAt: SEND_FILE_TEST_TS,
      },
    ]);
  });

  it('renders local generated files as disclosure cards instead of open actions', async () => {
    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            sendFileToUserEvent('send-1', {
              abs_file_path_list: [{ path: 'reports', file_name: 'quarterly-summary.md' }],
            }),
          ],
          status: 'done',
        }),
      );
      await flushEffects();
    });

    const card = container.querySelector('[data-testid="cli-output-markdown-card"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('quarterly-summary.md');
    expect(card?.textContent).toContain('生成时间：2026年4月28日');
    expect(card?.querySelector('[data-testid="cli-output-markdown-card-menu-trigger"]')).not.toBeNull();
    act(() => {
      card?.querySelector('[data-testid="cli-output-markdown-card-menu-trigger"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain('默认应用打开');
    expect(menu?.textContent).toContain('在文件夹中显示');
    expect(menu?.textContent).toContain('查看此任务所有文件');
  });

  it('calls cwd and local-file-meta when rendering generated file cards', async () => {
    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            sendFileToUserEvent('send-1', {
              abs_file_path_list: ['reports\\quarterly-summary.md'],
            }),
          ],
          status: 'done',
        }),
      );
      await flushEffects();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd');
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/projects/local-file-meta',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not bind absolute generated files to cwd as projectPath', async () => {
    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          projectPath: 'D:/workspace/current-project',
          events: [
            sendFileToUserEvent('send-1', {
              abs_file_path_list: ['D:/exports/quarterly-summary.md'],
            }),
          ],
          status: 'done',
        }),
      );
      await flushEffects();
    });

    expect(mockApiFetch).not.toHaveBeenCalledWith('/api/projects/cwd');
    const metaCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/projects/local-file-meta');
    expect(metaCall).toBeDefined();
    expect(getJsonBody(metaCall!)).toEqual({ path: 'D:/exports/quarterly-summary.md' });
  });

  it('keeps absolute generated file actions clickable without a default projectPath', async () => {
    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            sendFileToUserEvent('send-1', {
              abs_file_path_list: ['D:\\exports\\quarterly-summary.md'],
            }),
          ],
          status: 'done',
        }),
      );
      await flushEffects();
    });

    const menuTrigger = container.querySelector('[data-testid="cli-output-markdown-card-menu-trigger"]');
    await act(async () => {
      menuTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flushEffects();
    });
    const openButton = document.body.querySelector<HTMLButtonElement>('[data-testid="cli-output-markdown-open"]');
    const openFolderButton = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="cli-output-markdown-open-folder"]',
    );
    expect(openButton?.disabled).toBe(false);
    expect(openFolderButton?.disabled).toBe(false);

    await act(async () => {
      openButton?.click();
      openFolderButton?.click();
      await flushEffects();
    });

    const openCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/projects/open-local');
    const openFolderCall = mockApiFetch.mock.calls.find(([path]) => path === '/api/projects/open-local-folder');
    expect(openCall).toBeDefined();
    expect(openFolderCall).toBeDefined();
    expect(getJsonBody(openCall!)).toEqual({ path: 'D:\\exports\\quarterly-summary.md' });
    expect(getJsonBody(openFolderCall!)).toEqual({ path: 'D:\\exports' });
  });

  it('keeps send_file_to_user PPT on the standard LocalFileAttachment card when there is no artifact:pptx-pages (open / open folder)', async () => {
    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            { id: 't1', kind: 'text', timestamp: 1, content: 'Exported.' },
            sendFileToUserEvent('send-ppt', {
              abs_file_path_list: ['workspace/output/slides/deck.pptx'],
            }),
          ],
          status: 'done',
        }),
      );
      await flushEffects();
    });

    const pptCard = container.querySelector('[data-testid="cli-output-ppt-card"]');
    expect(pptCard).not.toBeNull();
    expect(pptCard?.textContent).toContain('deck.pptx');
    expect(pptCard?.querySelector('[data-testid="cli-output-ppt-card-menu-trigger"]')).not.toBeNull();
    expect(pptCard?.textContent).not.toContain('正在生成中');
  });

  it('omits open-file button for extensions the backend cannot open (e.g. png); keeps open-folder', async () => {
    await act(async () => {
      root.render(
        React.createElement(CliOutputBlock, {
          events: [
            sendFileToUserEvent('send-png', {
              abs_file_path_list: ['D:/workspace/charts/01.png'],
            }),
          ],
          status: 'done',
        }),
      );
      await flushEffects();
    });

    const card = container.querySelector('[data-testid="cli-output-other-card"]');
    expect(card).not.toBeNull();
    act(() => {
      card?.querySelector('[data-testid="cli-output-other-card-menu-trigger"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain('在文件夹中显示');
    expect(document.body.querySelector('[data-testid="cli-output-other-open"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="cli-output-other-open-folder"]')).not.toBeNull();
  });
});
