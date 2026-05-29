/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * I-1: Thread deletion must show a confirmation dialog before proceeding.
 * Verifies that clicking delete shows a dialog, cancel dismisses it,
 * and confirm actually triggers the DELETE API call.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadSidebar } from '../ThreadSidebar';

// ── Mocks ─────────────────────────────────────────────────────
const mockApiFetch = vi.fn();
vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  API_URL: 'http://localhost:3102',
}));

const mockAddToast = vi.fn();
vi.mock('@/stores/toastStore', () => ({
  useToastStore: () => ({ addToast: mockAddToast }),
}));

const TEST_THREAD = {
  id: 'thread_abc123',
  title: '\u6d4b\u8bd5\u5bf9\u8bdd\u6807\u9898',
  projectPath: '/projects/office-claw-demo',
  createdBy: 'user1',
  participants: ['user1'],
  lastActiveAt: Date.now(),
  createdAt: Date.now() - 100000,
  pinned: false,
  favorited: false,
  preferredAgentIds: [] as string[],
};

let storeThreads = [TEST_THREAD];
const mockStore: Record<string, unknown> = {
  get threads() {
    return storeThreads;
  },
  currentThreadId: 'default',
  setThreads: vi.fn((t: typeof storeThreads) => {
    storeThreads = t;
  }),
  setCurrentProject: vi.fn(),
  isLoadingThreads: false,
  setLoadingThreads: vi.fn(),
  updateThreadTitle: vi.fn(),
  getThreadState: () => ({ agentStatuses: {}, unreadCount: 0 }),
  updateThreadPin: vi.fn(),
  updateThreadFavorite: vi.fn(),
  updateThreadPreferredAgents: vi.fn(),
  threadStates: {},
  clearAllUnread: vi.fn(),
  initThreadUnread: vi.fn(),
};
vi.mock('@/stores/chatStore', () => {
  const hook = Object.assign(
    (selector?: (s: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore),
    { getState: () => mockStore },
  );
  return { useChatStore: hook };
});
vi.mock('@/hooks/useAgentData', () => ({
  useAgentData: () => ({ getAgentById: () => null, agents: [] }),
}));

function jsonOk(data: unknown, headerMap?: Record<string, string>) {
  return Promise.resolve({
    ok: true,
    status: 204,
    headers: {
      get: (key: string) => headerMap?.[key.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(data),
  });
}

describe('Thread delete confirmation (I-1)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    storeThreads = [TEST_THREAD];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockApiFetch.mockReset();
    mockAddToast.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: storeThreads });
      return jsonOk({});
    });
    // Provide localStorage stub for collapse-state persistence
    const store: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  async function openDeleteDialog() {
    const threadTitle = Array.from(container.querySelectorAll('.ui-thread-title')).find((node) =>
      node.textContent?.includes('\u6d4b\u8bd5\u5bf9\u8bdd\u6807\u9898'),
    );
    expect(threadTitle, 'thread row should exist').toBeTruthy();

    const threadItem = threadTitle?.closest('.ui-thread-item') as HTMLDivElement | null;
    expect(threadItem, 'thread item should exist').toBeTruthy();

    act(() => {
      threadItem?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 120,
        }),
      );
    });

    await flush();

    const menu = container.querySelector('[data-testid="thread-context-menu"]') as HTMLDivElement | null;
    expect(menu, 'context menu should open').toBeTruthy();
    expect(menu?.className).toContain('ui-overlay-card');

    const menuButtons = Array.from(menu?.querySelectorAll('button') ?? []);
    const deleteBtn = menuButtons.find((button) => button.textContent?.includes('删除会话')) as
      | HTMLButtonElement
      | undefined;
    expect(deleteBtn, 'delete menu item should exist for non-default thread').toBeTruthy();

    act(() => {
      (deleteBtn as HTMLButtonElement).click();
    });

    await flush();
  }

  it('shows confirmation dialog when clicking delete', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    // Dialog should appear with the current warning copy
    expect(container.textContent).toContain('\u786e\u8ba4\u5220\u9664\u4f1a\u8bdd');
    expect(container.textContent).toContain('\u5220\u9664\u540e\uff0c\u8be5\u4f1a\u8bdd\u53ca\u76f8\u5173\u804a\u5929\u8bb0\u5f55\u5c06\u5168\u90e8\u6e05\u7a7a\u4e14\u4e0d\u53ef\u6062\u590d');
    expect(container.textContent).toContain(TEST_THREAD.projectPath);
    expect(container.textContent).toContain('\u8be5\u5de5\u4f5c\u76ee\u5f55\u5f53\u524d\u672a\u53d1\u73b0\u5176\u4ed6\u4f1a\u8bdd\u5171\u4eab');

    const backdrop = container.querySelector('[data-testid=\"thread-delete-modal\"]') as HTMLDivElement | null;
    expect(backdrop?.className).toContain('ui-modal-backdrop');

    const dialog = container.querySelector('[data-testid=\"thread-delete-modal-panel\"]') as HTMLDivElement | null;
    expect(dialog?.className).toContain('ui-modal-panel');
    expect(dialog?.className).toContain('w-[500px]');

    const stack = container.querySelector('[data-testid=\"thread-delete-modal-content\"]') as HTMLDivElement | null;
    expect(stack?.className).toContain('flex');
    expect(stack?.className).toContain('flex-col');
    expect(stack?.className).toContain('gap-5');

    const closeBtn = dialog?.querySelector('button[aria-label=\"close\"]') as HTMLButtonElement | null;
    expect(closeBtn?.className).toContain('ui-modal-close-button');

    // No DELETE API call yet
    const deleteCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('dismisses dialog when clicking cancel', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();
    expect(container.textContent).toContain('\u786e\u8ba4\u5220\u9664\u4f1a\u8bdd');

    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u53d6\u6d88')!;
    expect(cancelBtn.className).toContain('ui-button-default');
    expect(cancelBtn.className).not.toContain('ui-button-secondary');

    // Click cancel
    act(() => {
      cancelBtn.click();
    });

    // Dialog should be gone
    expect(container.textContent).not.toContain('\u786e\u8ba4\u5220\u9664\u4f1a\u8bdd');
  });

  it('dismisses dialog when pressing Escape', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    expect(container.querySelector('[data-testid="thread-delete-modal-panel"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await flush();

    expect(container.querySelector('[data-testid="thread-delete-modal-panel"]')).toBeNull();
  });

  it('calls DELETE API only after clicking confirm', async () => {
    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    // Click confirm
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u786e\u5b9a')!;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.className).toContain('ui-button-primary');

    await act(async () => {
      confirmBtn.click();
    });
    await flush();

    // Now DELETE should have been called
    const deleteCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === `/api/threads/${TEST_THREAD.id}` &&
        (call[1] as { method?: string } | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it('shows shared workspace warning and does not allow deleting the shared workspace', async () => {
    storeThreads = [
      TEST_THREAD,
      {
        ...TEST_THREAD,
        id: 'thread_shared_2',
        title: '\u5171\u4eab\u76ee\u5f55\u7684\u53e6\u4e00\u4e2a\u4f1a\u8bdd',
      },
    ];

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    expect(container.textContent).toContain(
      '\u8be5\u5de5\u4f5c\u76ee\u5f55\u5f53\u524d\u88ab 1 \u4e2a\u5176\u4ed6\u4f1a\u8bdd\u5171\u4eab\uff0c\u4e0d\u80fd\u5728\u5220\u9664\u4f1a\u8bdd\u65f6\u4e00\u5e76\u5220\u9664',
    );
    expect(container.textContent).toContain(
      '\u5171\u4eab\u5de5\u4f5c\u76ee\u5f55\u4e0d\u53ef\u5728\u8fd9\u91cc\u5220\u9664\uff0c\u8bf7\u5148\u5904\u7406\u5176\u4ed6\u4f1a\u8bdd\u540e\u518d\u624b\u52a8\u6e05\u7406\u8be5\u76ee\u5f55',
    );

    const checkbox = container.querySelector(
      '[data-testid="thread-delete-workspace-option"] input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    expect(checkbox?.disabled).toBe(true);
    expect(checkbox?.checked).toBe(false);

    act(() => {
      checkbox?.click();
    });
    await flush();

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u786e\u5b9a')!;
    await act(async () => {
      confirmBtn.click();
    });
    await flush();

    const deleteCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) =>
        call[0] === `/api/threads/${TEST_THREAD.id}` &&
        (call[1] as { method?: string } | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(1);
  });

  it('shows failure toast when workspace delete does not succeed', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: storeThreads });
      if (path === `/api/threads/${TEST_THREAD.id}?deleteWorkspace=true`) {
        return jsonOk(
          {},
          {
            'x-office-claw-workspace-delete-succeeded': 'false',
            'x-office-claw-workspace-delete-reason': 'delete_failed',
          },
        );
      }
      return jsonOk({});
    });

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    const checkbox = container.querySelector(
      '[data-testid="thread-delete-workspace-option"] input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();

    act(() => {
      checkbox?.click();
    });
    await flush();

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u786e\u5b9a')!;
    await act(async () => {
      confirmBtn.click();
    });
    await flush();

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: '\u5de5\u4f5c\u76ee\u5f55\u672a\u5220\u9664',
      }),
    );
  });

  it('shows retention toast when backend keeps the workspace because it became shared', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/api/threads') return jsonOk({ threads: storeThreads });
      if (path === `/api/threads/${TEST_THREAD.id}?deleteWorkspace=true`) {
        return jsonOk(
          {},
          {
            'x-office-claw-workspace-delete-succeeded': 'false',
            'x-office-claw-workspace-delete-reason': 'shared_workspace',
          },
        );
      }
      return jsonOk({});
    });

    act(() => {
      root.render(React.createElement(ThreadSidebar));
    });
    await flush();
    await openDeleteDialog();

    const checkbox = container.querySelector(
      '[data-testid="thread-delete-workspace-option"] input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();

    act(() => {
      checkbox?.click();
    });
    await flush();

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '\u786e\u5b9a')!;
    await act(async () => {
      confirmBtn.click();
    });
    await flush();

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        title: '\u5de5\u4f5c\u76ee\u5f55\u5df2\u4fdd\u7559',
      }),
    );
  });
});
