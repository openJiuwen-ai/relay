/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPendingRequest } from '@/hooks/useAuthorization';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useAuthorizationPendingStore } from '@/stores/authorizationPendingStore';
import { apiFetch } from '@/utils/api-client';

Object.assign(globalThis as Record<string, unknown>, { React });

// Mock apiFetch
vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ pending: [] }) }),
}));

const mockClose = vi.fn();
const apiFetchMock = vi.mocked(apiFetch);

describe('useAuthorization pending sync', () => {
  let container: HTMLDivElement;
  let root: Root;
  let capturedHandler: ((data: AuthPendingRequest) => void) | null = null;

  beforeAll(() => {
    // Must use `function` (not arrow) so it can be called with `new`
    const MockNotification = vi.fn().mockImplementation(function (
      this: Record<string, unknown>,
      _title: string,
      _opts: { tag: string },
    ) {
      this.onclick = null;
      this.close = mockClose;
    });
    Object.assign(MockNotification, {
      permission: 'granted',
      requestPermission: vi.fn().mockResolvedValue('granted'),
    });
    Object.defineProperty(globalThis, 'Notification', {
      value: MockNotification,
      writable: true,
      configurable: true,
    });
  });

  beforeEach(() => {
    useAuthorizationPendingStore.setState({ pendingByThread: {}, threadByRequest: {} });
    apiFetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ pending: [] }) } as Response);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    capturedHandler = null;
  });

  function HookCapture({ threadId }: { threadId: string }) {
    const { handleAuthRequest } = useAuthorization(threadId);
    capturedHandler = handleAuthRequest;
    return null;
  }

  it('does not fire browser notifications from the thread-local authorization hook', async () => {
    await act(async () => {
      root.render(React.createElement(HookCapture, { threadId: 'thread-1' }));
    });

    const request: AuthPendingRequest = {
      requestId: 'req-1',
      agentId: 'opus',
      threadId: 'thread-1',
      action: 'file_write',
      reason: 'Need to write a file',
      createdAt: Date.now(),
    };

    act(() => {
      capturedHandler?.(request);
    });

    act(() => {
      capturedHandler?.(request);
    });

    expect(Notification).not.toHaveBeenCalled();
  });

  it('syncs pending ids to authorization pending store', async () => {
    await act(async () => {
      root.render(React.createElement(HookCapture, { threadId: 'thread-sync' }));
    });

    await act(async () => {
      capturedHandler?.({
        requestId: 'req-sync',
        agentId: 'opus',
        threadId: 'thread-sync',
        action: 'file_write',
        reason: 'Need to write a file',
        createdAt: Date.now(),
      });
      await Promise.resolve();
    });

    expect(useAuthorizationPendingStore.getState().hasPending('thread-sync')).toBe(true);
    expect(useAuthorizationPendingStore.getState().pendingByThread['thread-sync']).toEqual(['req-sync']);
  });

  it('keeps the previous thread pending marker when switching to another thread', async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url === '/api/authorization/pending?threadId=thread-a') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ pending: [] }) } as Response);
      }
      if (url === '/api/authorization/pending?threadId=thread-b') {
        return new Promise<Response>(() => {});
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ pending: [] }) } as Response);
    });

    await act(async () => {
      root.render(React.createElement(HookCapture, { threadId: 'thread-a' }));
    });

    await act(async () => {
      capturedHandler?.({
        requestId: 'req-a',
        agentId: 'opus',
        threadId: 'thread-a',
        action: 'file_write',
        reason: 'Need approval',
        createdAt: Date.now(),
      });
      await Promise.resolve();
    });

    expect(useAuthorizationPendingStore.getState().hasPending('thread-a')).toBe(true);

    await act(async () => {
      root.render(React.createElement(HookCapture, { threadId: 'thread-b' }));
      await Promise.resolve();
    });

    expect(useAuthorizationPendingStore.getState().hasPending('thread-a')).toBe(true);
    expect(useAuthorizationPendingStore.getState().hasPending('thread-b')).toBe(false);
  });
});
