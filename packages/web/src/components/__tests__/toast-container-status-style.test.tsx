/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';

describe('ToastContainer status styling', () => {
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
    useToastStore.setState({
      toasts: [
        {
          id: 'toast-success',
          type: 'success',
          title: '安装成功',
          message: 'skill-a 已安装',
          duration: 0,
          createdAt: Date.now(),
        },
        {
          id: 'toast-error',
          type: 'error',
          title: '安装失败',
          message: '权限不足',
          duration: 0,
          createdAt: Date.now() + 1,
        },
      ],
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useToastStore.setState({ toasts: [] });
  });

  it('uses the updated global toast card layout and status surfaces', async () => {
    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const alerts = Array.from(document.body.querySelectorAll('[role="alert"]'));
    expect(alerts).toHaveLength(2);

    const successToast = alerts.find((node) => node.textContent?.includes('安装成功'));
    const errorToast = alerts.find((node) => node.textContent?.includes('安装失败'));

    expect(successToast?.className).toContain('bg-[var(--toast-success-surface)]');
    expect(errorToast?.className).toContain('bg-[var(--toast-error-surface)]');
    expect(successToast?.className).toContain('border-[var(--toast-success-surface)]');
    expect(errorToast?.className).toContain('border-[var(--toast-error-surface)]');
    expect(successToast?.className).toContain('box-border');
    expect(successToast?.className).toContain('rounded-[8px]');
    expect(successToast?.className).toContain('shadow-[var(--toast-shadow)]');
    expect(successToast?.className).toContain('px-4');
    expect(successToast?.className).toContain('py-2');
    expect(successToast?.className).toContain('max-w-lg');
    expect(successToast?.className).toContain('text-[var(--toast-text)]');
    expect(successToast?.textContent).not.toContain('⚠');
    expect(errorToast?.textContent).not.toContain('⚠');

    const contentRow = successToast?.firstElementChild as HTMLDivElement | null;
    expect(contentRow?.className).toContain('items-start');
    expect(contentRow?.className).toContain('gap-2');
    const messageNode = successToast?.querySelectorAll('p')[1] as HTMLParagraphElement | undefined;
    expect(messageNode?.className).toContain('whitespace-pre-wrap');
    expect(messageNode?.className).toContain('break-words');
    expect(messageNode?.className).not.toContain('line-clamp-2');
    expect(successToast?.querySelector('[data-testid="toast-status-icon"]')?.getAttribute('src')).toBe(
      '/icons/message-success.svg',
    );
    expect(errorToast?.querySelector('[data-testid="toast-status-icon"]')?.getAttribute('src')).toBe(
      '/icons/message-error.svg',
    );

    const closeButton = successToast?.querySelector('button');
    expect(closeButton?.className).toContain('text-[var(--toast-close-icon)]');
    expect(closeButton?.querySelector('svg')?.getAttribute('class')).toContain('h-4');
    expect(closeButton?.querySelector('svg')?.getAttribute('class')).toContain('w-4');
  });

  it('keeps global toasts above modal overlays', async () => {
    await act(async () => {
      root.render(React.createElement(ToastContainer));
    });

    const toastLayer = document.body.querySelector('.fixed.top-6.right-6');
    expect(toastLayer?.className).toContain('z-[130]');
  });
});
