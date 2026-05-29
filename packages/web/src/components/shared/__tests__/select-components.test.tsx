/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Select } from '../Select';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.querySelectorAll('[data-testid="select-popup"]').forEach((node) => node.remove());
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

function render(element: React.ReactElement) {
  act(() => {
    root.render(element);
  });
}

describe('Select', () => {
  const options = [
    { value: 'all', label: '全部类型' },
    { value: 'word', label: '文档' },
    { value: 'image', label: '图片', disabled: true },
  ];

  it('renders the selected option label in an antd-like combobox trigger', () => {
    render(
      <Select
        aria-label="类型筛选"
        value="all"
        options={options}
        onChange={vi.fn()}
      />,
    );

    const trigger = container.querySelector('[role="combobox"]') as HTMLButtonElement | null;

    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain('全部类型');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('select')).toBeNull();
  });

  it('opens the listbox and calls onChange with the selected option', () => {
    const onChange = vi.fn();
    render(
      <Select
        aria-label="类型筛选"
        value="all"
        options={options}
        onChange={onChange}
      />,
    );

    const trigger = container.querySelector('[role="combobox"]') as HTMLButtonElement;
    act(() => {
      trigger.click();
    });

    const listbox = document.body.querySelector('[role="listbox"]');
    const wordOption = Array.from(document.body.querySelectorAll('[role="option"]')).find(
      (option) => option.textContent === '文档',
    ) as HTMLButtonElement | undefined;

    expect(listbox).not.toBeNull();
    expect(wordOption?.getAttribute('aria-selected')).toBe('false');

    act(() => {
      wordOption?.click();
    });

    expect(onChange).toHaveBeenCalledWith('word', options[1]);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it('uses blue text for the selected option and keeps hover background only on unselected options', () => {
    render(
      <Select
        aria-label="类型筛选"
        value="word"
        options={options}
        onChange={vi.fn()}
      />,
    );

    act(() => {
      (container.querySelector('[role="combobox"]') as HTMLButtonElement).click();
    });

    const renderedOptions = Array.from(document.body.querySelectorAll('[role="option"]')) as HTMLButtonElement[];
    const unselectedOption = renderedOptions.find((option) => option.textContent === '全部类型');
    const selectedOption = renderedOptions.find((option) => option.textContent === '文档');

    expect(unselectedOption?.className).toContain('hover:bg-[#F5F5F5]');
    expect(selectedOption?.className).toContain('text-[#1476FF]');
    expect(selectedOption?.className).not.toContain('hover:bg-[#F5F5F5]');
    expect(selectedOption?.className).not.toContain('bg-[#F5F5F5]');
  });

  it('ignores disabled options', () => {
    const onChange = vi.fn();
    render(
      <Select
        aria-label="类型筛选"
        value="all"
        options={options}
        onChange={onChange}
      />,
    );

    act(() => {
      (container.querySelector('[role="combobox"]') as HTMLButtonElement).click();
    });

    const disabledOption = Array.from(document.body.querySelectorAll('[role="option"]')).find(
      (option) => option.textContent === '图片',
    ) as HTMLButtonElement | undefined;

    expect(disabledOption?.disabled).toBe(true);

    act(() => {
      disabledOption?.click();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('supports keyboard selection', () => {
    const onChange = vi.fn();
    render(
      <Select
        aria-label="类型筛选"
        value="all"
        options={options}
        onChange={onChange}
      />,
    );

    const trigger = container.querySelector('[role="combobox"]') as HTMLButtonElement;
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith('word', options[1]);
  });
});
