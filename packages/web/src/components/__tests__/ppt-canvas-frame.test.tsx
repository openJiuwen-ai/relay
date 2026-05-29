/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PptCanvasFrame } from '@/components/ppt-studio/PptCanvasFrame';

vi.mock('@/utils/api-client', () => ({
  API_URL: 'http://localhost:3004',
}));

describe('PptCanvasFrame', () => {
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
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders a fixed 16:9 slide viewport with CSS-driven scaling only', async () => {
    await act(async () => {
      root.render(
        React.createElement(PptCanvasFrame, {
          projectRoot: '/tmp/ppt-root',
          slide: {
            slideId: 'slide-2',
            pageNumber: 2,
            htmlPath: 'output/demo/pages/page-2.pptx.html',
            title: 'Revenue Plan',
            blockCount: 1,
            updatedAt: 200,
          },
        }),
      );
    });

    const stage = container.querySelector('[data-testid="ppt-canvas-stage"]') as HTMLElement | null;
    const shell = container.querySelector('[data-testid="ppt-canvas-shell"]') as HTMLElement | null;
    const iframe = container.querySelector('[data-testid="ppt-canvas-frame"]') as HTMLIFrameElement | null;

    expect(stage?.className).toContain('min-w-0');
    expect(stage?.style.containerType).toBe('size');
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain('relative');
    expect(shell?.className).toContain('overflow-hidden');
    expect(iframe?.style.width).toBe('1280px');
    expect(iframe?.style.height).toBe('720px');
    expect(iframe?.style.transformOrigin).toBe('0 0');
    expect(iframe?.src).toContain('http://localhost:3004/api/ppt-studio/slide?');
  });
});
