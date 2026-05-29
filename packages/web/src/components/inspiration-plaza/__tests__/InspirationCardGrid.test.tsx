/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InspirationCardGrid } from '../components/InspirationCardGrid';
import type { InspirationTemplateListItem } from '../types';

const mockTemplates: InspirationTemplateListItem[] = [
  {
    id: 'tpl-001',
    name: '模板1',
    imagePath: '/images/test1.png',
    description: '描述1',
    skills: [],
    agents: [],
    tags: ['定时任务'],
  },
  {
    id: 'tpl-002',
    name: '模板2',
    imagePath: '/images/test2.png',
    description: '描述2',
    skills: [],
    agents: [],
    tags: ['文档处理'],
  },
];

describe('InspirationCardGrid', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onClick = vi.fn();

  beforeEach(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    onClick.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders templates in grid', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCardGrid, {
        templates: mockTemplates,
        isLoading: false,
        onCardClick: onClick
      }));
    });

    expect(container.textContent).toContain('模板1');
    expect(container.textContent).toContain('模板2');
  });

  it('keeps inspiration cards at least 237px wide in the responsive grid', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCardGrid, {
        templates: mockTemplates,
        isLoading: false,
        onCardClick: onClick
      }));
    });

    expect(container.firstElementChild?.className).toContain('grid-cols-[repeat(auto-fit,minmax(237px,1fr))]');
  });

  it('uses wider responsive column ranges for desktop breakpoints', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCardGrid, {
        templates: mockTemplates,
        isLoading: false,
        onCardClick: onClick
      }));
    });

    const gridClassName = container.firstElementChild?.className;
    expect(gridClassName).toContain('min-[1280px]:grid-cols-[repeat(3,minmax(237px,1fr))]');
    expect(gridClassName).toContain('min-[1440px]:grid-cols-[repeat(4,minmax(237px,1fr))]');
    expect(gridClassName).toContain('min-[1600px]:grid-cols-[repeat(5,minmax(237px,1fr))]');
    expect(gridClassName).toContain('justify-items-center');
  });

  it('renders loading skeletons when isLoading is true', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCardGrid, {
        templates: [],
        isLoading: true,
        onCardClick: onClick
      }));
    });

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders empty state when no templates', async () => {
    await act(async () => {
      root.render(React.createElement(InspirationCardGrid, {
        templates: [],
        isLoading: false,
        onCardClick: onClick
      }));
    });

    expect(container.textContent).toContain('暂无灵感');
  });
});
