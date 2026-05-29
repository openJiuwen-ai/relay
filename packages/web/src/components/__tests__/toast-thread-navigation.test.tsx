/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContainer } from '@/components/ToastContainer';
import { vitestRouter } from '@/vitest-router-mock';
import { useToastStore } from '@/stores/toastStore';
vi.mock('@/stores/chatStore', () => ({
  useChatStore: vi.fn((selector) => selector(mockChatStore)),
}));

const mockSetCurrentProject = vi.fn();
const mockChatStore = {
  setCurrentProject: mockSetCurrentProject,
  threads: [
    { id: 'thread-abc', title: '我的测试对话', projectPath: 'project-1' },
    { id: 'thread-xyz', title: '另一个对话', projectPath: 'project-2' },
  ],
};

describe('Toast thread navigation', () => {
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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockSetCurrentProject.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useToastStore.setState({ toasts: [] });
  });

  it('shows thread title when threadTitle is provided', async () => {
    useToastStore.setState({
      toasts: [
        {
          id: 'toast-with-title',
          type: 'success',
          title: 'codex 完成',
          message: '任务已完成',
          threadId: 'thread-abc',
          threadTitle: '我的测试对话',
          duration: 0,
          createdAt: Date.now(),
        },
      ],
    });

    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const threadTitleEl = document.querySelector('[data-testid="toast-thread-title"]');
    expect(threadTitleEl).toBeTruthy();
    expect(threadTitleEl?.textContent).toBe('我的测试对话');
  });

  it('does not show thread title when threadTitle is undefined', async () => {
    useToastStore.setState({
      toasts: [
        {
          id: 'toast-no-title',
          type: 'success',
          title: 'codex 完成',
          message: '任务已完成',
          threadId: 'thread-abc',
          duration: 0,
          createdAt: Date.now(),
        },
      ],
    });

    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const threadTitleEl = document.querySelector('[data-testid="toast-thread-title"]');
    expect(threadTitleEl).toBeFalsy();
  });

  it('shows view button when threadId is provided', async () => {
    useToastStore.setState({
      toasts: [
        {
          id: 'toast-with-thread',
          type: 'success',
          title: 'codex 完成',
          message: '任务已完成',
          threadId: 'thread-abc',
          threadTitle: '我的测试对话',
          duration: 0,
          createdAt: Date.now(),
        },
      ],
    });

    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const viewButton = document.querySelector('[data-testid="toast-view-button"]');
    expect(viewButton).toBeTruthy();
    expect(viewButton?.textContent).toBe('查看');
  });

  it('does not show view button when threadId is undefined', async () => {
    useToastStore.setState({
      toasts: [
        {
          id: 'toast-no-thread',
          type: 'success',
          title: '安装成功',
          message: 'skill-a 已安装',
          duration: 0,
          createdAt: Date.now(),
        },
      ],
    });

    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const viewButton = document.querySelector('[data-testid="toast-view-button"]');
    expect(viewButton).toBeFalsy();
  });

  it('calls router.push and setCurrentProject when view button is clicked', async () => {
    useToastStore.setState({
      toasts: [
        {
          id: 'toast-view-test',
          type: 'success',
          title: 'codex 完成',
          message: '任务已完成',
          threadId: 'thread-abc',
          threadTitle: '我的测试对话',
          duration: 0,
          createdAt: Date.now(),
        },
      ],
    });

    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const viewButton = document.querySelector('[data-testid="toast-view-button"]') as HTMLButtonElement;
    expect(viewButton).toBeTruthy();

    await act(async () => {
      viewButton.click();
    });

    expect(mockSetCurrentProject).toHaveBeenCalledWith('project-1');
    expect(vitestRouter.navigate).toHaveBeenCalledWith('/thread/thread-abc', { preventScrollReset: true });
    expect(useToastStore.getState().toasts[0].exiting).toBe(true);
  });
});
