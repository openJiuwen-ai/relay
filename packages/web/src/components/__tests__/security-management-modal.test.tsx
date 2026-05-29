/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/utils/api-client';
import { useToastStore } from '@/stores/toastStore';
import SecurityManagementModal from '../SecurityManagementModal';

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

describe('SecurityManagementModal', () => {
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
    useToastStore.setState({ toasts: [] });
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/authorization/records/settings' && !init?.method) {
        return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
      }
      if (path === '/api/authorization/records/settings' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body ?? '{}')) as { autoCleanupEnabled?: boolean };
        return Promise.resolve(jsonResponse({ autoCleanupEnabled: body.autoCleanupEnabled ?? false }));
      }
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              rw_enabled: true,
              tools: {
                mcp_exec_command: { '*': 'ask', patterns: { 'git status *': 'allow' } },
                write_memory: 'allow',
              },
            },
          }),
        );
      }
      if (path === '/api/config/relayclaw/security' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body ?? '{}')) as { permissions?: unknown };
        return Promise.resolve(
          jsonResponse({
            permissions: body.permissions ?? {},
          }),
        );
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('loads permissions config from the API proxy when the modal opens', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/config/relayclaw/security');
    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;
    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    const workspaceRwToggle = container.querySelector(
      '[data-testid="security-management-workspace-rw-toggle"]',
    ) as HTMLButtonElement | null;
    expect(workspaceRwToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('mcp_exec_command');
    expect(container.textContent).toContain('write_memory');
  });

  it('loads approval record settings only after switching to approval records', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    expect(mockApiFetch).not.toHaveBeenCalledWith('/api/authorization/records/settings');

    const recordsTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === '审批记录',
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      recordsTab?.click();
      await Promise.resolve();
    });
    await flush();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/authorization/records/settings');

    const approvalTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === '安全审批',
    ) as HTMLButtonElement | undefined;

    await act(async () => {
      approvalTab?.click();
      await Promise.resolve();
    });
    await act(async () => {
      recordsTab?.click();
      await Promise.resolve();
    });
    await flush();

    expect(
      mockApiFetch.mock.calls.filter(([path]) => path === '/api/authorization/records/settings'),
    ).toHaveLength(1);
  });

  it('limits modal height and keeps long content inside an internal scroll region', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const panel = document.body.querySelector('[data-testid="security-management-modal"]');
    const body = document.body.querySelector('[data-testid="security-management-modal-body"]');
    const scrollRegion = document.body.querySelector('[data-testid="security-management-scroll-region"]');

    expect(panel?.className).toContain('min-h-[480px]');
    expect(panel?.className).toContain('max-h-[calc(100vh-32px)]');
    expect(panel?.className).toContain('overflow-hidden');
    expect(body?.className).toContain('min-h-0');
    expect(body?.className).toContain('overflow-hidden');
    expect(scrollRegion?.className).toContain('overflow-y-auto');
  });

  it('shows only the shared loading state in the modal body before data resolves', async () => {
    const pending = createDeferred<Response>();
    mockApiFetch.mockImplementationOnce(() => pending.promise);

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="security-management-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="skills-loading-state"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="security-management-approval-header"]')).toBeNull();
    expect(container.querySelector('[data-testid="security-management-policy-section"]')).toBeNull();
    expect(container.querySelector('[data-testid="security-management-load-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="security-management-save-error"]')).toBeNull();
  });

  it('shows approval loading immediately when reopening while config refresh is pending', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pending = createDeferred<Response>();
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return pending.promise;
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: false, onClose: vi.fn() }));
    });
    await flush();

    act(() => {
      flushSync(() => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
    });

    expect(document.body.querySelector('[data-testid="security-management-loading"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="security-management-approval-header"]')).toBeNull();
  });

  it('treats missing permissions.enabled as enabled when loading config', async () => {
    mockApiFetch.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          permissions: {
            tools: {
              mcp_exec_command: { '*': 'ask' },
            },
          },
        }),
      ),
    );

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
  });

  it('treats missing rw_enabled as disabled when loading config', async () => {
    mockApiFetch.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          permissions: {
            enabled: true,
            tools: {
              mcp_exec_command: { '*': 'ask' },
            },
          },
        }),
      ),
    );

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const workspaceRwToggle = container.querySelector(
      '[data-testid="security-management-workspace-rw-toggle"]',
    ) as HTMLButtonElement | null;

    expect(workspaceRwToggle?.getAttribute('aria-checked')).toBe('false');
  });

  it('hides workspace rw trust config when approval guard is disabled', async () => {
    mockApiFetch.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse({
          permissions: {
            enabled: false,
            rw_enabled: true,
            tools: {
              mcp_exec_command: { '*': 'ask' },
            },
          },
        }),
      ),
    );

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    expect(container.querySelector('[data-testid="security-management-workspace-rw-section"]')).toBeNull();
  });

  it('saves approval guard changes through the API proxy', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      pageToggle?.click();
      await Promise.resolve();
    });

    const patchCall = mockApiFetch.mock.calls.find(
      ([path, init]) => path === '/api/config/relayclaw/security' && init?.method === 'PATCH',
    );
    expect(patchCall?.[1]?.body ? JSON.parse(String(patchCall[1].body)) : null).toEqual({
      permissions: {
        enabled: false,
      },
    });
    expect(pageToggle?.getAttribute('aria-checked')).toBe('false');
  });

  it('saves workspace rw trust changes through the API proxy', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const workspaceRwToggle = container.querySelector(
      '[data-testid="security-management-workspace-rw-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      workspaceRwToggle?.click();
      await Promise.resolve();
    });

    const patchCall = mockApiFetch.mock.calls.find(
      ([path, init]) =>
        path === '/api/config/relayclaw/security' &&
        init?.method === 'PATCH' &&
        String(init.body ?? '').includes('rw_enabled'),
    );
    expect(patchCall?.[1]?.body ? JSON.parse(String(patchCall[1].body)) : null).toEqual({
      permissions: {
        rw_enabled: false,
      },
    });
    expect(workspaceRwToggle?.getAttribute('aria-checked')).toBe('false');
  });

  it('saves tool policy toggles as ask or allow and preserves patterns', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const commandToggle = container.querySelector(
      '[data-testid="security-policy-toggle-mcp_exec_command"]',
    ) as HTMLButtonElement | null;
    const memoryToggle = container.querySelector(
      '[data-testid="security-policy-toggle-write_memory"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      commandToggle?.click();
      await Promise.resolve();
    });

    const firstPatchBody = mockApiFetch.mock.calls
      .filter(([path, init]) => path === '/api/config/relayclaw/security' && init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body ?? '{}')))[0];

    expect(firstPatchBody).toEqual({
      permissions: {
        tools: {
          mcp_exec_command: {
            '*': 'allow',
            patterns: {
              'git status *': 'allow',
            },
          },
        },
      },
    });
    expect(commandToggle?.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      memoryToggle?.click();
      await Promise.resolve();
    });

    const lastPatchBody = mockApiFetch.mock.calls
      .filter(([path, init]) => path === '/api/config/relayclaw/security' && init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body ?? '{}')))
      .at(-1);

    expect(lastPatchBody).toEqual({
      permissions: {
        tools: {
          write_memory: 'ask',
        },
      },
    });
    expect(memoryToggle?.getAttribute('aria-checked')).toBe('true');
  });

  it('reverts optimistic changes when save fails', async () => {
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              rw_enabled: false,
              tools: {
                mcp_exec_command: { '*': 'ask', patterns: { 'git status *': 'allow' } },
                write_memory: 'allow',
              },
            },
          }),
        );
      }
      if (path === '/api/config/relayclaw/security' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ error: 'save failed' }, 500));
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      pageToggle?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('save failed');
  });

  it('reverts optimistic workspace rw changes when save fails', async () => {
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              rw_enabled: true,
              tools: {
                mcp_exec_command: { '*': 'ask' },
              },
            },
          }),
        );
      }
      if (path === '/api/config/relayclaw/security' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ error: 'save failed' }, 500));
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const workspaceRwToggle = container.querySelector(
      '[data-testid="security-management-workspace-rw-toggle"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      workspaceRwToggle?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(workspaceRwToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('save failed');
  });

  it('keeps later successful tool toggles when an earlier save fails', async () => {
    const firstSave = createDeferred<Response>();
    const secondSave = createDeferred<Response>();
    mockApiFetch.mockImplementation((path, init) => {
      if (path === '/api/config/relayclaw/security' && !init?.method) {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: {
                mcp_exec_command: { '*': 'ask', patterns: { 'git status *': 'allow' } },
                write_memory: 'allow',
              },
            },
          }),
        );
      }
      if (path === '/api/config/relayclaw/security' && init?.method === 'PATCH') {
        return mockApiFetch.mock.calls.filter(([, callInit]) => callInit?.method === 'PATCH').length === 1
          ? firstSave.promise
          : secondSave.promise;
      }
      throw new Error(`Unexpected apiFetch path: ${String(path)}`);
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
    });
    await flush();

    const commandToggle = container.querySelector(
      '[data-testid="security-policy-toggle-mcp_exec_command"]',
    ) as HTMLButtonElement | null;
    const memoryToggle = container.querySelector(
      '[data-testid="security-policy-toggle-write_memory"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      commandToggle?.click();
      memoryToggle?.click();
      await Promise.resolve();
    });

    secondSave.resolve(
      jsonResponse({
        permissions: {
          tools: {
            write_memory: 'ask',
          },
        },
      }),
    );
    await flush();

    firstSave.resolve(jsonResponse({ error: 'first save failed' }, 500));
    await flush();

    expect(commandToggle?.getAttribute('aria-checked')).toBe('true');
    expect(memoryToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('first save failed');
  });

  it('closes the modal when Escape key is pressed', async () => {
    const onClose = vi.fn();
    mockApiFetch.mockImplementation((path) => {
      if (path === '/api/config/relayclaw/security') {
        return Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: {
                write_memory: 'ask',
              },
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose }));
      await Promise.resolve();
    });

    const modal = container.querySelector('[data-testid="security-management-modal"]');
    expect(modal).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('pagination', () => {
    const manyTools: Record<string, unknown> = {
      tool_1: 'ask',
      tool_2: 'allow',
      tool_3: 'ask',
      tool_4: 'allow',
      tool_5: 'ask',
      tool_6: 'allow',
      tool_7: 'ask',
      tool_8: 'allow',
      tool_9: 'ask',
      tool_10: 'allow',
      tool_11: 'ask',
      tool_12: 'allow',
    };

    it('hides pagination when there are fewer than 5 tools', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: {
                mcp_exec_command: 'ask',
                write_memory: 'allow',
              },
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      expect(container.querySelector('[data-testid="security-management-pagination"]')).toBeNull();
      expect(container.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(2);
    });

    it('shows pagination and displays first 5 tools on page 1', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manyTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      expect(container.querySelector('[data-testid="security-management-pagination"]')).not.toBeNull();
      expect(container.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(5);
      expect(container.querySelector('[data-testid="security-policy-row-tool_1"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="security-policy-row-tool_5"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="security-policy-row-tool_6"]')).toBeNull();
    });

    it('navigates to page 2 when next button is clicked', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manyTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const nextButton = container.querySelector(
        '[data-testid="security-management-pagination-next"]',
      ) as HTMLButtonElement | null;
      expect(nextButton).not.toBeNull();
      expect(nextButton?.disabled).toBe(false);

      await act(async () => {
        nextButton?.click();
        await Promise.resolve();
      });

      expect(container.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(5);
      expect(container.querySelector('[data-testid="security-policy-row-tool_6"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="security-policy-row-tool_10"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="security-policy-row-tool_1"]')).toBeNull();
    });

    it('navigates back to page 1 when prev button is clicked', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manyTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const nextButton = container.querySelector(
        '[data-testid="security-management-pagination-next"]',
      ) as HTMLButtonElement | null;

      await act(async () => {
        nextButton?.click();
        await Promise.resolve();
      });

      const prevButton = container.querySelector(
        '[data-testid="security-management-pagination-prev"]',
      ) as HTMLButtonElement | null;
      expect(prevButton).not.toBeNull();
      expect(prevButton?.disabled).toBe(false);

      await act(async () => {
        prevButton?.click();
        await Promise.resolve();
      });

      expect(container.querySelector('[data-testid="security-policy-row-tool_1"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="security-policy-row-tool_6"]')).toBeNull();
    });

    it('navigates directly to a page when page number button is clicked', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manyTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const page3Button = container.querySelector(
        '[data-testid="security-management-pagination-page-3"]',
      ) as HTMLButtonElement | null;
      expect(page3Button).not.toBeNull();

      await act(async () => {
        page3Button?.click();
        await Promise.resolve();
      });

      expect(container.querySelector('[data-testid="security-policy-row-tool_11"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="security-policy-row-tool_1"]')).toBeNull();
    });

    it('disables prev button on first page and next button on last page', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manyTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const prevButton = container.querySelector(
        '[data-testid="security-management-pagination-prev"]',
      ) as HTMLButtonElement | null;
      const nextButton = container.querySelector(
        '[data-testid="security-management-pagination-next"]',
      ) as HTMLButtonElement | null;

      expect(prevButton?.disabled).toBe(true);
      expect(nextButton?.disabled).toBe(false);

      await act(async () => {
        nextButton?.click();
        await Promise.resolve();
        nextButton?.click();
        await Promise.resolve();
        nextButton?.click();
        await Promise.resolve();
      });

      expect(prevButton?.disabled).toBe(false);
      expect(nextButton?.disabled).toBe(true);
    });

    it('shows ellipsis when there are more than 8 pages', async () => {
      const manyPagesTools: Record<string, unknown> = {};
      for (let i = 1; i <= 50; i += 1) {
        manyPagesTools[`tool_${i}`] = i % 2 === 0 ? 'allow' : 'ask';
      }

      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manyPagesTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const pagination = container.querySelector('[data-testid="security-management-pagination"]');
      expect(pagination?.textContent).toContain('...');
    });

    it('always starts from page 1 when modal opens', async () => {
      mockApiFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manyTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const nextButton = container.querySelector(
        '[data-testid="security-management-pagination-next"]',
      ) as HTMLButtonElement | null;

      await act(async () => {
        nextButton?.click();
        await Promise.resolve();
      });

      expect(container.querySelector('[data-testid="security-policy-row-tool_6"]')).not.toBeNull();

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: false, onClose: vi.fn() }));
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      expect(container.querySelector('[data-testid="security-policy-row-tool_1"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="security-policy-row-tool_6"]')).toBeNull();
    });
  });

  describe('search', () => {
    const searchTools: Record<string, unknown> = {
      mcp_exec_command: 'ask',
      write_memory: 'allow',
      read_file: 'ask',
      delete_file: 'ask',
    };

    it('renders search input above the policy table', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: searchTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      // Modal content is rendered via Portal to document.body
      const searchInput = document.body.querySelector('[data-testid="security-policy-search-input"]');
      expect(searchInput).not.toBeNull();
      expect(searchInput?.getAttribute('placeholder')).toBe('搜索敏感操作');
    });

    it('filters policies by search query', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: searchTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      // Initially all 4 tools are shown (no pagination since < 5)
      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(4);

      const searchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;
      expect(searchInput).not.toBeNull();

      // Search for 'file' - should match read_file and delete_file
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'file');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      const filteredRows = document.body.querySelectorAll('[data-testid^="security-policy-row-"]');
      expect(filteredRows.length).toBe(2);
      expect(document.body.querySelector('[data-testid="security-policy-row-read_file"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="security-policy-row-delete_file"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="security-policy-row-mcp_exec_command"]')).toBeNull();
    });

    it('shows NoSearchResultsState when search has no matches', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: searchTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const searchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;

      // Search for something that doesn't exist
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'nonexistent');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(0);
      expect(document.body.querySelector('[data-testid="no-search-results-state"]')).not.toBeNull();
      expect(document.body.textContent).toContain('暂未匹配到数据');
    });

    it('clears search when clicking clear button in NoSearchResultsState', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: searchTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const searchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;

      // Search for something that doesn't exist to show empty state
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'nonexistent');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(0);

      // Click the clear button in NoSearchResultsState
      const clearButton = document.body.querySelector(
        '[data-testid="no-search-results-clear"]',
      ) as HTMLButtonElement | null;
      expect(clearButton).not.toBeNull();

      await act(async () => {
        clearButton?.click();
      });
      await flush();

      // All policies should be restored
      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(4);
      expect(document.body.querySelector('[data-testid="no-search-results-state"]')).toBeNull();
    });

    it('clears search and restores full list when clear button is clicked', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: searchTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const searchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;

      // First filter with search
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'file');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(2);

      // Click clear button
      const clearButton = document.body.querySelector(
        '[data-testid="search-input-clear-button"]',
      ) as HTMLButtonElement | null;
      expect(clearButton).not.toBeNull();

      await act(async () => {
        clearButton?.click();
      });
      await flush();

      // All policies should be restored
      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(4);
    });

    it('resets to page 1 when search query changes', async () => {
      const manySearchTools: Record<string, unknown> = {};
      for (let i = 1; i <= 12; i += 1) {
        manySearchTools[`tool_${i}`] = i % 2 === 0 ? 'allow' : 'ask';
      }

      mockApiFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: manySearchTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      // Navigate to page 2
      const nextButton = document.body.querySelector(
        '[data-testid="security-management-pagination-next"]',
      ) as HTMLButtonElement | null;
      await act(async () => {
        nextButton?.click();
        await Promise.resolve();
      });
      await flush();

      expect(document.body.querySelector('[data-testid="security-policy-row-tool_6"]')).not.toBeNull();

      // Now search - should reset to page 1 with filtered results
      const searchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'tool_1');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      // Only tool_1 and tool_10 and tool_11 match 'tool_1' substring
      // Should show tool_1 (page 1 result) not tool_6 (page 2 result)
      expect(document.body.querySelector('[data-testid="security-policy-row-tool_1"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="security-policy-row-tool_6"]')).toBeNull();
    });

    it('clears search query when modal is reopened', async () => {
      mockApiFetch.mockImplementation(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: searchTools,
            },
          }),
        ),
      );

      // Open modal and search
      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const searchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'file');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(2);

      // Close modal
      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: false, onClose: vi.fn() }));
      });

      // Reopen modal - search should be cleared
      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(4);
      const newSearchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;
      expect(newSearchInput?.value).toBe('');
    });

    it('search is case-insensitive', async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse({
            permissions: {
              enabled: true,
              tools: searchTools,
            },
          }),
        ),
      );

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const searchInput = document.body.querySelector(
        '[data-testid="security-policy-search-input"]',
      ) as HTMLInputElement | null;

      // Search with uppercase 'FILE'
      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'FILE');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      expect(document.body.querySelectorAll('[data-testid^="security-policy-row-"]').length).toBe(2);
      expect(document.body.querySelector('[data-testid="security-policy-row-read_file"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="security-policy-row-delete_file"]')).not.toBeNull();
    });
  });

  describe('approval records tab', () => {
    const firstPageRecords = [
      {
        id: 'audit-001',
        threadTitle: '整理 windows 安装包发布问题',
        action: 'shell_command',
        approvalLabel: '本次允许',
        decidedAt: 1778840005000,
      },
    ];

    async function openRecordsTab() {
      const recordsTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find(
        (tab) => tab.textContent === '审批记录',
      ) as HTMLButtonElement | undefined;

      await act(async () => {
        recordsTab?.click();
        await Promise.resolve();
      });
    }

    it('renders both tabs and lazy-loads records only after switching to approval records', async () => {
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (String(path).startsWith('/api/authorization/records?')) {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();

      const tabs = document.body.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(2);
      expect(tabs[0].textContent).toBe('安全审批');
      expect(tabs[1].textContent).toBe('审批记录');
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(mockApiFetch.mock.calls.some(([path]) => String(path).startsWith('/api/authorization/records?'))).toBe(false);

      await openRecordsTab();
      await flush();

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/authorization/records?limit=50&offset=0&includeRuleMatched=false',
      );
      expect(document.body.textContent).toContain('自动清理安全审批记录');
      expect(document.body.textContent).toContain('开启后，将仅保存近30天的审批数据；关闭则保存历史全部的审批记录');
      expect(document.body.querySelector('[data-testid="approval-records-title"]')?.textContent).toBe('审批记录');
      expect(document.body.querySelector('[data-testid="approval-records-auto-cleanup-toggle"]')?.getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(document.body.querySelector('[data-testid="approval-records-table"]')).not.toBeNull();
    });

    it('shows loading, empty state, and rendered record fields for the approval records tab', async () => {
      const pending = createDeferred<Response>();
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (String(path).startsWith('/api/authorization/records?')) {
          return pending.promise;
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();

      expect(document.body.querySelector('[data-testid="approval-records-loading"]')).not.toBeNull();

      await act(async () => {
        pending.resolve(
          jsonResponse({
            records: [],
            pageInfo: { hasMore: false },
            totalCount: 0,
          }),
        );
        await pending.promise;
      });
      await flush();

      expect(document.body.querySelector('[data-testid="approval-records-empty-state"]')).not.toBeNull();

      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (String(path).startsWith('/api/authorization/records?')) {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: false, onClose: vi.fn() }));
      });
      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      expect(document.body.querySelector('[data-testid="approval-records-search-input"]')?.getAttribute('placeholder')).toBe(
        '请输入会话名称搜索',
      );
      expect(document.body.textContent).toContain('整理 windows 安装包发布问题');
      expect(document.body.textContent).toContain('shell_command');
      expect(document.body.textContent).toContain('本次允许');
      expect(document.body.textContent).toContain(
        new Date(1778840005000).toLocaleString('zh-CN', { hour12: false }),
      );

      const tooltipCells = document.body.querySelectorAll('[data-testid^="approval-record-cell-"]');
      expect(tooltipCells).toHaveLength(4);
      expect(
        document.body.querySelector('[data-testid="approval-record-cell-audit-001-thread"] span')?.textContent,
      ).toBe('整理 windows 安装包发布问题');
      expect(
        document.body.querySelector('[data-testid="approval-record-cell-audit-001-action"] span')?.textContent,
      ).toBe('shell_command');
      expect(
        document.body.querySelector('[data-testid="approval-record-cell-audit-001-result"] span')?.textContent,
      ).toBe('本次允许');
      expect(
        document.body.querySelector('[data-testid="approval-record-cell-audit-001-time"] span')?.textContent,
      ).toBe(new Date(1778840005000).toLocaleString('zh-CN', { hour12: false }));
    });

    it('saves auto cleanup changes and disables the switch while saving', async () => {
      const pendingSave = createDeferred<Response>();
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/authorization/records/settings' && init?.method === 'PUT') {
          return pendingSave.promise;
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (String(path).startsWith('/api/authorization/records?')) {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      const toggle = document.body.querySelector(
        '[data-testid="approval-records-auto-cleanup-toggle"]',
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.click();
        await Promise.resolve();
      });

      const putCall = mockApiFetch.mock.calls.find(
        ([path, init]) => path === '/api/authorization/records/settings' && init?.method === 'PUT',
      );
      expect(putCall?.[1]?.body ? JSON.parse(String(putCall[1].body)) : null).toEqual({
        autoCleanupEnabled: false,
      });
      expect(toggle?.getAttribute('aria-checked')).toBe('false');
      expect(toggle?.disabled).toBe(true);

      await act(async () => {
        pendingSave.resolve(jsonResponse({ autoCleanupEnabled: false }));
        await pendingSave.promise;
      });
      await flush();

      expect(toggle?.disabled).toBe(false);
      expect(useToastStore.getState().toasts.some((toast) => toast.title === '审批记录设置成功')).toBe(true);
    });

    it('reverts auto cleanup changes when saving fails', async () => {
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/authorization/records/settings' && init?.method === 'PUT') {
          return Promise.resolve(jsonResponse({ error: 'save failed' }, 500));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (String(path).startsWith('/api/authorization/records?')) {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      const toggle = document.body.querySelector(
        '[data-testid="approval-records-auto-cleanup-toggle"]',
      ) as HTMLButtonElement | null;

      await act(async () => {
        toggle?.click();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(toggle?.getAttribute('aria-checked')).toBe('true');
      expect(useToastStore.getState().toasts.some((toast) => toast.title === '审批记录设置失败')).toBe(true);
    });

    it('keeps records usable when loading auto cleanup settings fails', async () => {
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ error: 'settings failed' }, 500));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (String(path).startsWith('/api/authorization/records?')) {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      const toggle = document.body.querySelector(
        '[data-testid="approval-records-auto-cleanup-toggle"]',
      ) as HTMLButtonElement | null;

      expect(useToastStore.getState().toasts.some((toast) => toast.title === '审批记录设置加载失败')).toBe(true);
      expect(toggle?.disabled).toBe(true);
      expect(document.body.querySelector('[data-testid="approval-records-table"]')).not.toBeNull();
    });

    it('searches by thread title with debounce and shows no-results state without the table', async () => {
      vi.useFakeTimers();
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (path === '/api/authorization/records?limit=50&offset=0&includeRuleMatched=false') {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        if (path === '/api/authorization/records?limit=50&offset=0&includeRuleMatched=false&threadQuery=missing') {
          return Promise.resolve(
            jsonResponse({
              records: [],
              pageInfo: { hasMore: false },
              totalCount: 0,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      const searchInput = document.body.querySelector(
        '[data-testid="approval-records-search-input"]',
      ) as HTMLInputElement | null;

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'missing');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(document.body.querySelector('[data-testid="approval-records-search-loading"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="approval-records-table"]')).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      await flush();

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/authorization/records?limit=50&offset=0&includeRuleMatched=false&threadQuery=missing',
      );
      expect(document.body.querySelector('[data-testid="approval-records-no-results"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="approval-records-table"]')).toBeNull();
      vi.useRealTimers();
    });

    it('paginates cached batches locally and requests the next backend batch only when needed', async () => {
      const firstBatchRecords = Array.from({ length: 50 }, (_, index) => ({
        id: `audit-${String(index + 1).padStart(3, '0')}`,
        threadTitle: `第 ${index + 1} 条记录`,
        action: 'shell_command',
        approvalLabel: '本次允许',
        decidedAt: 1778840005000 + index,
      }));

      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (path === '/api/authorization/records?limit=50&offset=0&includeRuleMatched=false') {
          return Promise.resolve(
            jsonResponse({
              records: firstBatchRecords,
              pageInfo: { hasMore: true, nextOffset: 50 },
              totalCount: 55,
            }),
          );
        }
        if (path === '/api/authorization/records?limit=50&offset=50&includeRuleMatched=false') {
          return Promise.resolve(
            jsonResponse({
              records: [
                {
                  id: 'audit-051',
                  threadTitle: '检查发布脚本',
                  action: 'write_file',
                  approvalLabel: '始终允许',
                  decidedAt: 1778840105000,
                },
              ],
              pageInfo: { hasMore: false },
              totalCount: 55,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      expect(document.body.querySelector('[data-testid="approval-records-pagination"]')).not.toBeNull();
      const page2Button = document.body.querySelector(
        '[data-testid="approval-records-pagination-page-2"]',
      ) as HTMLButtonElement | null;
      await act(async () => {
        page2Button?.click();
        await Promise.resolve();
      });
      await flush();

      expect(mockApiFetch).not.toHaveBeenCalledWith(
        '/api/authorization/records?limit=50&offset=50&includeRuleMatched=false',
      );
      expect(document.body.querySelector('[data-testid="approval-record-row-audit-001"]')).toBeNull();
      expect(document.body.querySelector('[data-testid="approval-record-row-audit-006"]')).not.toBeNull();

      const page11Button = document.body.querySelector(
        '[data-testid="approval-records-pagination-page-11"]',
      ) as HTMLButtonElement | null;
      await act(async () => {
        page11Button?.click();
        await Promise.resolve();
      });
      await flush();

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/authorization/records?limit=50&offset=50&includeRuleMatched=false',
      );
      expect(document.body.querySelector('[data-testid="approval-record-row-audit-006"]')).toBeNull();
      expect(document.body.querySelector('[data-testid="approval-record-row-audit-051"]')).not.toBeNull();
    });

    it('retries records loading in the same open session after an initial failure', async () => {
      let shouldFail = true;
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (String(path).startsWith('/api/authorization/records?') && shouldFail) {
          return Promise.resolve(jsonResponse({ error: 'boom' }, 500));
        }
        if (String(path).startsWith('/api/authorization/records?')) {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      expect(useToastStore.getState().toasts.some((toast) => toast.title === '审批记录加载失败')).toBe(true);
      expect(document.body.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('审批记录');
      expect(document.body.querySelector('[data-testid="security-management-approval-header"]')).toBeNull();

      shouldFail = false;
      await act(async () => {
        const approvalTab = Array.from(document.body.querySelectorAll('[role="tab"]')).find(
          (tab) => tab.textContent === '安全审批',
        ) as HTMLButtonElement | undefined;
        approvalTab?.click();
        await Promise.resolve();
      });
      await openRecordsTab();
      await flush();

      expect(document.body.querySelector('[data-testid="approval-record-row-audit-001"]')).not.toBeNull();
    });

    it('keeps the previous table visible when a search request fails', async () => {
      vi.useFakeTimers();
      mockApiFetch.mockImplementation((path, init) => {
        if (path === '/api/authorization/records/settings' && !init?.method) {
          return Promise.resolve(jsonResponse({ autoCleanupEnabled: true }));
        }
        if (path === '/api/config/relayclaw/security' && !init?.method) {
          return Promise.resolve(
            jsonResponse({
              permissions: {
                enabled: true,
                tools: {
                  shell_command: 'ask',
                },
              },
            }),
          );
        }
        if (path === '/api/authorization/records?limit=50&offset=0&includeRuleMatched=false') {
          return Promise.resolve(
            jsonResponse({
              records: firstPageRecords,
              pageInfo: { hasMore: false },
              totalCount: 1,
            }),
          );
        }
        if (path === '/api/authorization/records?limit=50&offset=0&includeRuleMatched=false&threadQuery=boom') {
          return Promise.resolve(jsonResponse({ error: 'search failed' }, 500));
        }
        throw new Error(`Unexpected apiFetch path: ${String(path)}`);
      });

      await act(async () => {
        root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      });
      await flush();
      await openRecordsTab();
      await flush();

      const searchInput = document.body.querySelector(
        '[data-testid="approval-records-search-input"]',
      ) as HTMLInputElement | null;

      await act(async () => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        valueSetter?.call(searchInput, 'boom');
        searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput?.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      await flush();

      expect(useToastStore.getState().toasts.some((toast) => toast.title === '审批记录加载失败')).toBe(true);
      expect(document.body.querySelector('[data-testid="approval-record-row-audit-001"]')).not.toBeNull();
      expect(document.body.querySelector('[data-testid="approval-records-no-results"]')).toBeNull();
    });
  });
});
