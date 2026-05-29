/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/chat-input/ChatInput';

vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/components/chat-input/components/ImagePreview', () => ({ ImagePreview: () => null }));
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));

describe('ChatInput folder tooltip', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('shows the unified overflow tooltip for long selected folder names', async () => {
    await act(async () => {
      root.render(
        React.createElement(ChatInput, {
          onSend: vi.fn(),
          folderSelectionEnabled: true,
          selectedFolderName: 'very-long-folder-name-for-tooltip',
          selectedFolderTitle: 'D:/workspace/projects/very-long-folder-name-for-tooltip',
          onOpenFolderPicker: vi.fn(),
        }),
      );
    });

    const button = container.querySelector('[data-testid="folder-select-button"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    Object.defineProperty(button!, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(button!, 'scrollWidth', { configurable: true, value: 240 });
    Object.defineProperty(button!, 'clientHeight', { configurable: true, value: 28 });
    Object.defineProperty(button!, 'scrollHeight', { configurable: true, value: 28 });

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip?.textContent).toContain('D:/workspace/projects/very-long-folder-name-for-tooltip');
    expect(tooltip?.querySelector('[data-testid="overflow-tooltip-arrow"]')).not.toBeNull();
  });

  it('shows a non-copyable tooltip for the attach file button', async () => {
    await act(async () => {
      root.render(
        React.createElement(ChatInput, {
          onSend: vi.fn(),
        }),
      );
    });

    const button = container.querySelector('[data-testid="attach-file-button"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip?.textContent).toContain('选择附件');
    expect(tooltip?.querySelector('button')).toBeNull();
  });
});
