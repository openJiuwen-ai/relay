/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PasswordField } from '@/components/shared/PasswordField';

describe('PasswordField', () => {
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
  });

  function renderField() {
    function Harness() {
      const [value, setValue] = useState('');
      return (
        <PasswordField
          id="password"
          name="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          toggleTestId="password-visibility-toggle"
          className="ui-input"
        />
      );
    }

    act(() => {
      root.render(<Harness />);
    });

    return container.querySelector('#password') as HTMLInputElement;
  }

  function renderFieldWithCustomPadding() {
    function Harness() {
      const [value, setValue] = useState('secret');
      return (
        <PasswordField
          id="password-custom"
          name="password-custom"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          toggleTestId="password-visibility-toggle-custom"
          className="ui-input"
          inputPaddingRightClassName="pr-11"
        />
      );
    }

    act(() => {
      root.render(<Harness />);
    });

    return container.querySelector('#password-custom') as HTMLInputElement;
  }

  it('shows a visibility toggle only after the field has content and toggles input type', async () => {
    const input = renderField();

    expect(input.type).toBe('password');
    expect(input.className).toContain('password-field-input');
    expect(container.querySelector('[data-testid="password-visibility-toggle"]')).toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, 'secret');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    const toggle = container.querySelector('[data-testid="password-visibility-toggle"]') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(input.type).toBe('password');
    expect(input.className).toContain('pr-10');
    expect(toggle?.className).toContain('px-3');
    expect(toggle?.className).not.toContain('w-11');

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(input.type).toBe('text');
    expect(toggle?.getAttribute('aria-label')).toBe('隐藏密码');
  });

  it('allows callers to customize the input right padding to match larger icons', () => {
    const input = renderFieldWithCustomPadding();

    expect(input.className).toContain('pr-11');
    expect(input.className).not.toContain('pr-10');
  });
});
