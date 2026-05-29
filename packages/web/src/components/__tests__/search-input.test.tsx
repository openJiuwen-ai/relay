/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchInput } from '@/components/shared/SearchInput';

function SearchInputHarness() {
  const [value, setValue] = useState('');
  return (
    <SearchInput
      value={value}
      onChange={(nextValue) => setValue(nextValue)}
      onClear={() => setValue('')}
      placeholder="搜索会话"
      aria-label="搜索会话"
    />
  );
}

describe('SearchInput', () => {
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
    vi.clearAllMocks();
  });

  it('shows the leading search icon and only shows the clear icon when there is input', async () => {
    await act(async () => {
      root.render(React.createElement(SearchInputHarness));
    });

    const searchIcon = container.querySelector('[data-testid="search-input-leading-icon"]');
    expect(searchIcon).not.toBeNull();
    expect(searchIcon?.querySelector('svg')?.getAttribute('class')).toContain('h-4');
    expect(searchIcon?.querySelector('svg')?.getAttribute('class')).toContain('w-4');
    expect(container.querySelector('[data-testid="search-input-clear-button"]')).toBeNull();

    const input = container.querySelector('input[aria-label="搜索会话"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'abc');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const clearButton = container.querySelector('[data-testid="search-input-clear-button"]') as HTMLButtonElement | null;
    expect(clearButton).not.toBeNull();
    expect(clearButton?.querySelector('svg')?.getAttribute('class')).toContain('h-4');
    expect(clearButton?.querySelector('svg')?.getAttribute('class')).toContain('w-4');

    await act(async () => {
      clearButton?.click();
    });

    expect((container.querySelector('input[aria-label="搜索会话"]') as HTMLInputElement | null)?.value).toBe('');
    expect(container.querySelector('[data-testid="search-input-clear-button"]')).toBeNull();
  });
});
