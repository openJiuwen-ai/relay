/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useThreadSidebarLayout } from '../thread-sidebar/useThreadSidebarLayout';

let container: HTMLDivElement;
let root: Root;
let captured: ReturnType<typeof useThreadSidebarLayout> | null = null;
const originalInnerWidth = window.innerWidth;

function Host() {
  captured = useThreadSidebarLayout();
  return null;
}

describe('ThreadSidebar filter panel', () => {
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    captured = null;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
      writable: true,
    });
  });

  it('closes the filter popover when clicking outside', async () => {
    await act(async () => {
      root.render(React.createElement(Host));
    });

    expect(captured).not.toBeNull();
    expect(captured?.showFilter).toBe(false);

    act(() => {
      captured?.toggleFilter();
    });

    expect(captured?.showFilter).toBe(true);

    await act(async () => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(captured?.showFilter).toBe(false);
  });
});
