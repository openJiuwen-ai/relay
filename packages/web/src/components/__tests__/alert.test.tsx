/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Alert } from '@/components/shared/Alert';

describe('Alert', () => {
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

  it('uses public prompt and warn icons', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Alert, { mode: 'prompt', closable: false }, 'prompt'),
          React.createElement(Alert, { mode: 'warn', closable: false }, 'warn'),
        ),
      );
    });

    const icons = Array.from(container.querySelectorAll('[data-testid="alert-status-icon"] img')) as HTMLImageElement[];
    expect(icons).toHaveLength(2);
    expect(icons[0]?.getAttribute('src')).toBe('/icons/message-prompt.svg');
    expect(icons[1]?.getAttribute('src')).toBe('/icons/message-warn.svg');
  });
});
