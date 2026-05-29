/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tab } from '@/components/shared/Tab';

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  // tab comp test init
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  // tab comp test init
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe('Tab', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();

  const items = [
    { value: 'preset', label: '平台推荐' },
    { value: 'my', label: '我的模板' },
  ];

  beforeEach(() => {
    onChange.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(props: { value?: string; onChange?: typeof onChange } = {}) {
    const { value = 'preset', onChange: onChangeProps = onChange } = props;
    act(() => {
      root.render(
        React.createElement(Tab, {
          items,
          value,
          onChange: onChangeProps,
        }),
      );
    });
  }

  // ─── T-01 ───────────────────────────────────────────────────────────────────

  it('T-01: renders two tab items', () => {
    render();
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toBe('平台推荐');
    expect(tabs[1].textContent).toBe('我的模板');
  });

  // ─── T-02 ───────────────────────────────────────────────────────────────────

  it('T-02: preset tab is active by default', () => {
    render({ value: 'preset' });
    const presetTab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(presetTab).not.toBeNull();
    expect(presetTab?.textContent).toBe('平台推荐');
  });

  // ─── T-03 ───────────────────────────────────────────────────────────────────

  it('T-03: clicking my tab triggers onChange with "my"', () => {
    render({ value: 'preset' });
    const myTab = container.querySelectorAll('[role="tab"]')[1];
    act(() => {
      myTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('my');
  });

  // ─── T-04 ───────────────────────────────────────────────────────────────────

  it('T-04: clicking preset tab triggers onChange with "preset"', () => {
    render({ value: 'my' });
    const presetTab = container.querySelectorAll('[role="tab"]')[0];
    act(() => {
      presetTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('preset');
  });

  // ─── T-05 ───────────────────────────────────────────────────────────────────

  it('T-05: non-active value highlights the corresponding tab', () => {
    render({ value: 'my' });
    const activeTab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(activeTab?.textContent).toBe('我的模板');
  });
});
