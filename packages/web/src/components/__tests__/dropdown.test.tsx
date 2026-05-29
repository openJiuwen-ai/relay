/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dropdown } from '@/components/shared/Dropdown';

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  // dropdown test init
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  // dropdown test init
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('Dropdown', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onClickA = vi.fn();
  const onClickB = vi.fn();

  const options = [
    { label: '选项 A', onClick: onClickA },
    { label: '选项 B', onClick: onClickB },
  ];

  beforeEach(() => {
    onClickA.mockClear();
    onClickB.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: { align?: 'left' | 'right' } = {}) {
    const { align = 'right' } = props;
    act(() => {
      root.render(
        React.createElement(Dropdown, {
          trigger: React.createElement('span', null, '打开菜单'),
          options,
          align,
        }),
      );
    });
  }

  // ─── D-01 ───────────────────────────────────────────────────────────────────

  it('D-01: renders trigger element', () => {
    render();
    const trigger = container.querySelector('[role="button"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toBe('打开菜单');
  });

  // ─── D-02 ───────────────────────────────────────────────────────────────────

  it('D-02: clicking trigger opens dropdown menu', () => {
    render();
    const trigger = container.querySelector('[role="button"]')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Menu is portal-rendered into document.body
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
  });

  // ─── D-03 ───────────────────────────────────────────────────────────────────

  it('D-03: dropdown menu displays all options', () => {
    render();
    const trigger = container.querySelector('[role="button"]')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Menu is portal-rendered into document.body
    const menuItems = document.body.querySelectorAll('[role="menuitem"]');
    expect(menuItems).toHaveLength(2);
    expect(menuItems[0].textContent).toBe('选项 A');
    expect(menuItems[1].textContent).toBe('选项 B');
  });

  // ─── D-04 ───────────────────────────────────────────────────────────────────

  it('D-04: clicking an option triggers its onClick handler', () => {
    render();
    const trigger = container.querySelector('[role="button"]')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Menu is portal-rendered into document.body
    const menuItem = document.body.querySelectorAll('[role="menuitem"]')[0];
    act(() => {
      menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClickA).toHaveBeenCalledTimes(1);
    expect(onClickB).not.toHaveBeenCalled();
  });

  // ─── D-05 ───────────────────────────────────────────────────────────────────

  it('D-05: clicking an option closes the dropdown', () => {
    render();
    const trigger = container.querySelector('[role="button"]')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Menu is portal-rendered into document.body
    const menuItem = document.body.querySelectorAll('[role="menuitem"]')[0];
    act(() => {
      menuItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).toBeNull();
  });

  // ─── D-06 ───────────────────────────────────────────────────────────────────

  it('D-06: clicking outside closes dropdown', () => {
    render();
    const trigger = container.querySelector('[role="button"]')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).toBeNull();
  });

  // ─── D-07 ───────────────────────────────────────────────────────────────────

  it('D-07: trigger aria-expanded reflects open state', () => {
    render();
    const trigger = container.querySelector('[role="button"]') as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  // ─── D-08 ───────────────────────────────────────────────────────────────────

  it('D-08: pressing Escape closes dropdown', () => {
    render();
    const trigger = container.querySelector('[role="button"]') as HTMLElement;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // Dispatch Escape on the dropdown container (which has the onKeyDown handler)
    const dropdown = container.querySelector('[class*="relative"]') as HTMLElement;
    act(() => {
      dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).toBeNull();
  });

  // ─── D-09 ───────────────────────────────────────────────────────────────────

  it('D-09: pressing Enter or Space on trigger opens dropdown', () => {
    render();
    const trigger = container.querySelector('[role="button"]') as HTMLElement;
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const menu = document.body.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
  });
});
