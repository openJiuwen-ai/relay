/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/pages/HomePage';

const mockRouterPush = vi.fn();
const mockApiFetch = vi.fn();
const mockAddToast = vi.fn();

let capturedChatInputProps: any = null;
let mockStore: {
  setCurrentThread: ReturnType<typeof vi.fn>;
  threads: Array<{ id: string; projectPath: string; lastActiveAt: number }>;
  setPendingNewThreadSend: ReturnType<typeof vi.fn>;
  attachPendingNewThreadTarget: ReturnType<typeof vi.fn>;
  clearPendingNewThreadSend: ReturnType<typeof vi.fn>;
};

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...mod,
    useNavigate: () => mockRouterPush,
    useLocation: () => ({ pathname: '/', search: '', hash: '', state: null, key: 'default' }),
  };
});

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

vi.mock('@/stores/toastStore', () => ({
  useToastStore: () => ({ addToast: mockAddToast }),
}));

vi.mock('@/hooks/useSocket', () => ({
  useSocket: vi.fn(),
}));

vi.mock('@/components/chat-input/ChatInput', () => ({
  ChatInput: (props: unknown) => {
    capturedChatInputProps = props;
    return React.createElement('div', { 'data-testid': 'chat-input-mock' });
  },
}));

vi.mock('@/components/ChatEmptyState', () => ({
  ChatEmptyState: () => React.createElement('div', { 'data-testid': 'chat-empty-state-mock' }),
}));

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('HomePage workspace native picker flow', () => {
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
    capturedChatInputProps = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockStore = {
      setCurrentThread: vi.fn(),
      threads: [
        { id: 'default', projectPath: 'default', lastActiveAt: 0 },
        { id: 't-1', projectPath: '/repo/alpha', lastActiveAt: 100 },
      ],
      setPendingNewThreadSend: vi.fn(),
      attachPendingNewThreadTarget: vi.fn(),
      clearPendingNewThreadSend: vi.fn(),
    };

    mockApiFetch.mockReset();
    mockRouterPush.mockReset();
    mockAddToast.mockReset();
    mockApiFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (url === '/api/projects/cwd') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ path: '/repo', workspacePath: '/repo/workspace' }),
        });
      }
      if (url === '/api/projects/pick-directory') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ path: '/native/workspace', name: 'workspace' }),
        });
      }
      if (url === '/api/threads' && (init?.method ?? 'GET') === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ id: 'thread-new' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('opens native picker via backend and updates selected workspace on 200', async () => {
    await act(async () => {
      root.render(React.createElement(HomePage));
    });

    await act(async () => {
      await capturedChatInputProps.onOpenFolderPicker();
      await flush();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/cwd', {
      signal: expect.any(AbortSignal),
    });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/pick-directory', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialDirectory: '/repo/workspace' }),
      signal: expect.any(AbortSignal),
    }));
    expect(capturedChatInputProps.selectedFolderTitle).toBe('/native/workspace');
    expect(capturedChatInputProps.selectedFolderName).toBe('workspace');
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('keeps previous selection silently when picker is cancelled (204)', async () => {
    mockApiFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (url === '/api/projects/pick-directory') {
        return Promise.resolve({
          ok: true,
          status: 204,
          json: async () => ({}),
        });
      }
      if (url === '/api/threads' && (init?.method ?? 'GET') === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ id: 'thread-new' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    await act(async () => {
      root.render(React.createElement(HomePage));
    });

    act(() => {
      capturedChatInputProps.onSelectExistingWorkspace('/repo/alpha');
    });

    await act(async () => {
      await capturedChatInputProps.onOpenFolderPicker();
      await flush();
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/pick-directory', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initialPath: '/repo/alpha' }),
      signal: expect.any(AbortSignal),
    }));
    expect(mockApiFetch.mock.calls.some((call: unknown[]) => call[0] === '/api/projects/cwd')).toBe(false);
    expect(capturedChatInputProps.selectedFolderTitle).toBe('/repo/alpha');
    expect(capturedChatInputProps.selectedFolderName).toBe('alpha');
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('shows error toast and keeps previous selection when picker request fails', async () => {
    mockApiFetch.mockImplementation((url: string, init?: { method?: string }) => {
      if (url === '/api/projects/pick-directory') {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'picker boom' }),
        });
      }
      if (url === '/api/threads' && (init?.method ?? 'GET') === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ id: 'thread-new' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    await act(async () => {
      root.render(React.createElement(HomePage));
    });

    act(() => {
      capturedChatInputProps.onSelectExistingWorkspace('/repo/alpha');
    });

    await act(async () => {
      await capturedChatInputProps.onOpenFolderPicker();
      await flush();
    });

    expect(capturedChatInputProps.selectedFolderTitle).toBe('/repo/alpha');
    expect(capturedChatInputProps.selectedFolderName).toBe('alpha');
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: '选择文件夹失败',
        message: 'picker boom',
      }),
    );
  });

  it('passes selected native workspace path when creating a new thread', async () => {
    await act(async () => {
      root.render(React.createElement(HomePage));
    });

    await act(async () => {
      await capturedChatInputProps.onOpenFolderPicker();
      await flush();
    });

    await act(async () => {
      await capturedChatInputProps.onSend('hello');
      await flush();
    });

    const createCall = mockApiFetch.mock.calls.find(
      (call: unknown[]) => call[0] === '/api/threads' && (call[1] as { method?: string } | undefined)?.method === 'POST',
    );
    expect(createCall).toBeTruthy();
    const payload = JSON.parse(((createCall?.[1] as { body?: string } | undefined)?.body ?? '{}') as string);
    expect(payload).toEqual({ projectPath: '/native/workspace' });
  });

  it('aborts the pending native picker request on unmount without showing an error toast', async () => {
    let pickerSignal: AbortSignal | null = null;
    mockApiFetch.mockImplementation((url: string, init?: { method?: string; signal?: AbortSignal }) => {
      if (url === '/api/projects/cwd') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ path: '/repo', workspacePath: '/repo/workspace' }),
        });
      }
      if (url === '/api/projects/pick-directory') {
        pickerSignal = init?.signal ?? null;
        return new Promise((_resolve, reject) => {
          pickerSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    await act(async () => {
      root.render(React.createElement(HomePage));
    });

    act(() => {
      capturedChatInputProps.onOpenFolderPicker();
    });
    await flush();
    expect(pickerSignal).toBeInstanceOf(AbortSignal);
    expect(pickerSignal?.aborted).toBe(false);

    await act(async () => {
      root.render(React.createElement(React.Fragment));
      await flush();
    });

    expect(pickerSignal?.aborted).toBe(true);
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('aborts the pending native picker request when selecting an existing workspace from page', async () => {
    let pickerSignal: AbortSignal | null = null;
    mockApiFetch.mockImplementation((url: string, init?: { method?: string; signal?: AbortSignal }) => {
      if (url === '/api/projects/cwd') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ path: '/repo', workspacePath: '/repo/workspace' }),
        });
      }
      if (url === '/api/projects/pick-directory') {
        pickerSignal = init?.signal ?? null;
        return new Promise((_resolve, reject) => {
          pickerSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    await act(async () => {
      root.render(React.createElement(HomePage));
    });

    act(() => {
      capturedChatInputProps.onOpenFolderPicker();
    });
    await flush();
    expect(pickerSignal).toBeInstanceOf(AbortSignal);
    expect(pickerSignal?.aborted).toBe(false);

    act(() => {
      capturedChatInputProps.onSelectExistingWorkspace('/repo/alpha');
    });
    await flush();

    expect(pickerSignal?.aborted).toBe(true);
    expect(capturedChatInputProps.selectedFolderTitle).toBe('/repo/alpha');
    expect(capturedChatInputProps.selectedFolderName).toBe('alpha');
    expect(mockAddToast).not.toHaveBeenCalled();
  });
});
