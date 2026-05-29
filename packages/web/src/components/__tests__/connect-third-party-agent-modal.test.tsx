/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConnectThirdPartyAgentModal } from '@/components/ConnectThirdPartyAgentModal';

describe('ConnectThirdPartyAgentModal', () => {
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

  async function changeInputValue(input: HTMLInputElement, value: string) {
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
  }

  it('shows an API key visibility toggle after typing in the password field', async () => {
    await act(async () => {
      root.render(<ConnectThirdPartyAgentModal open onClose={() => {}} />);
    });

    const inputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    const apiKeyInput = inputs.find((input) => input.type === 'password') ?? null;
    expect(apiKeyInput).not.toBeNull();
    expect(container.querySelector('[data-testid="connect-third-party-agent-api-key-toggle"]')).toBeNull();

    await changeInputValue(apiKeyInput!, 'sk-third-party');

    const toggle = container.querySelector(
      '[data-testid="connect-third-party-agent-api-key-toggle"]',
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(apiKeyInput?.type).toBe('text');
  });
});
