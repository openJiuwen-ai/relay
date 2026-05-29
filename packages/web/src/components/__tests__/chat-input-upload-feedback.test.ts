/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat-input/ChatInput';
import { useToastStore } from '@/stores/toastStore';

vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/components/chat-input/components/ImagePreview', () => ({
  ImagePreview: () => null,
}));
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<React.ComponentProps<typeof ChatInput>> = {}) {
  const defaults = { onSend: vi.fn(), disabled: false };
  act(() => {
    root.render(React.createElement(ChatInput, { ...defaults, ...props }));
  });
  return defaults;
}

function dispatchDrop(target: Element, files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {
      files,
      types: ['Files'],
      dropEffect: 'none',
    },
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('ChatInput upload feedback', () => {
  it('shows uploading hint while image request is in progress', () => {
    render({ uploadStatus: 'uploading' });
    expect(container.textContent).toContain('文件上传中，请稍候...');
  });

  it('shows visible error hint when image send fails', () => {
    render({ uploadStatus: 'failed', uploadError: '上传超时' });
    expect(container.textContent).toContain('文件发送失败：上传超时');
  });

  it('blocks oversized files (>100MB) and shows a toast', () => {
    render();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const oversized = new File([new Uint8Array(100 * 1024 * 1024 + 1)], 'oversized.pdf', {
      type: 'application/pdf',
    });

    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: [oversized],
    });

    act(() => {
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast?.title).toBe('上传失败');
    expect(latestToast?.message).toContain('最大支持 100MB');

  });

  it('blocks selecting more than 5 attachments and shows a toast', () => {
    render();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const files = Array.from({ length: 6 }, (_, index) =>
      new File([`file-${index}`], `file-${index}.pdf`, {
        type: 'application/pdf',
      }),
    );

    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: files,
    });

    act(() => {
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast?.title).toBe('附件数量已达上限');
    expect(latestToast?.message).toContain('最多支持选择 5 个附件');
  });

  it('accepts legacy Office attachments without showing unsupported-type errors', () => {
    render();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).toBeTruthy();

    const files = [
      new File(['doc'], 'legacy.doc', { type: 'application/msword' }),
      new File(['xls'], 'legacy.xls', { type: 'application/vnd.ms-excel' }),
      new File(['xlsb'], 'binary.xlsb', { type: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12' }),
      new File(['ppt'], 'slides.ppt', { type: 'application/vnd.ms-powerpoint' }),
    ];

    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: files,
    });

    act(() => {
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((toast) => toast.title === '上传失败' && toast.message.includes('暂不支持'))).toBe(false);
  });

  it('shows unsupported-type toast when dropping unsupported files into input area', () => {
    render();
    const editor = container.querySelector('[role="textbox"]');
    expect(editor).toBeTruthy();

    const unsupported = new File(['hello'], 'script.exe', { type: 'application/x-msdownload' });
    dispatchDrop(editor!, [unsupported]);

    const latestToast = useToastStore.getState().toasts.at(-1);
    expect(latestToast?.title).toBe('上传失败');
    expect(latestToast?.message).toContain('暂不支持');
  });

  it('applies one-time drop count limit the same as picker upload', () => {
    render();
    const editor = container.querySelector('[role="textbox"]');
    expect(editor).toBeTruthy();

    const files = Array.from({ length: 6 }, (_, index) =>
      new File([`drop-${index}`], `drop-${index}.pdf`, {
        type: 'application/pdf',
      }),
    );
    dispatchDrop(editor!, files);

    const overflowToasts = useToastStore
      .getState()
      .toasts.filter((toast) => toast.title === '附件数量已达上限' && toast.message.includes('最多支持选择 5 个附件'));
    expect(overflowToasts.length).toBe(1);
  });

  it('applies cumulative count limit on drop the same as picker upload', () => {
    render();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    const editor = container.querySelector('[role="textbox"]');
    expect(fileInput).toBeTruthy();
    expect(editor).toBeTruthy();

    const initialFiles = Array.from({ length: 4 }, (_, index) =>
      new File([`pick-${index}`], `pick-${index}.pdf`, {
        type: 'application/pdf',
      }),
    );
    Object.defineProperty(fileInput!, 'files', {
      configurable: true,
      value: initialFiles,
    });
    act(() => {
      fileInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const droppedFiles = Array.from({ length: 3 }, (_, index) =>
      new File([`extra-${index}`], `extra-${index}.pdf`, {
        type: 'application/pdf',
      }),
    );
    dispatchDrop(editor!, droppedFiles);

    const overflowToasts = useToastStore
      .getState()
      .toasts.filter((toast) => toast.title === '附件数量已达上限' && toast.message.includes('最多支持选择 5 个附件'));
    expect(overflowToasts.length).toBe(1);
  });
});
