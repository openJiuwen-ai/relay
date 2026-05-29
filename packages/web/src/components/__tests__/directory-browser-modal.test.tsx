/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectoryBrowserModal } from '@/components/DirectoryBrowserModal';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DirectoryBrowserModal', () => {
  it('renders modal when open is true', () => {
    act(() => {
      root.render(
        React.createElement(DirectoryBrowserModal, {
          open: true,
          onSelect: vi.fn(),
          onClose: vi.fn(),
        }),
      );
    });

    const modal = container.querySelector('[data-testid="directory-browser-modal"]');
    expect(modal).not.toBeNull();
  });

  it('does not render modal when open is false', () => {
    act(() => {
      root.render(
        React.createElement(DirectoryBrowserModal, {
          open: false,
          onSelect: vi.fn(),
          onClose: vi.fn(),
        }),
      );
    });

    const modal = container.querySelector('[data-testid="directory-browser-modal"]');
    expect(modal).toBeNull();
  });

  it('displays the default title "选择文件夹"', () => {
    act(() => {
      root.render(
        React.createElement(DirectoryBrowserModal, {
          open: true,
          onSelect: vi.fn(),
          onClose: vi.fn(),
        }),
      );
    });

    const title = container.querySelector('[data-testid="directory-browser-modal-title"]');
    expect(title?.textContent).toContain('选择文件夹');
  });

  it('displays custom title when provided', () => {
    act(() => {
      root.render(
        React.createElement(DirectoryBrowserModal, {
          open: true,
          title: '自定义标题',
          onSelect: vi.fn(),
          onClose: vi.fn(),
        }),
      );
    });

    const title = container.querySelector('[data-testid="directory-browser-modal-title"]');
    expect(title?.textContent).toBe('自定义标题');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        React.createElement(DirectoryBrowserModal, {
          open: true,
          onSelect: vi.fn(),
          onClose,
        }),
      );
    });

    const closeButton = container.querySelector('button[aria-label="close-directory-browser"]');
    expect(closeButton).not.toBeNull();

    act(() => {
      closeButton?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the modal when Escape key is pressed', () => {
    const onClose = vi.fn();
    act(() => {
      root.render(
        React.createElement(DirectoryBrowserModal, {
          open: true,
          onSelect: vi.fn(),
          onClose,
        }),
      );
    });

    const modal = container.querySelector('[data-testid="directory-browser-modal"]');
    expect(modal).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
