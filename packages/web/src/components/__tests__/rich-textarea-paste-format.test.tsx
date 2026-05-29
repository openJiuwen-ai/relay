/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RichTextarea } from '@/components/chat-input/components/RichTextarea';

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderRichTextarea(onValueChange: (next: string) => void) {
  function TestHarness() {
    const [value, setValue] = useState('');

    return (
      <RichTextarea
        value={value}
        placeholder="paste"
        onValueChange={(next) => {
          setValue(next);
          onValueChange(next);
        }}
      />
    );
  }

  act(() => {
    root.render(<TestHarness />);
  });

  return container.querySelector('[role="textbox"]') as HTMLDivElement;
}

describe('RichTextarea paste formatting', () => {
  it('preserves newlines and indentation when pasting plain text', () => {
    const onValueChange = vi.fn();
    const textbox = renderRichTextarea(onValueChange);
    const pasted = '    def hello():\r\n        print("hi")\r\n';

    act(() => {
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', {
        value: {
          getData: (type: string) => (type === 'text/plain' ? pasted : ''),
        },
      });
      textbox.dispatchEvent(event);
    });

    expect(onValueChange).toHaveBeenCalled();
    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('    def hello():\n        print("hi")\n');
    expect(container.textContent).toContain('    def hello():');
    expect(container.textContent).toContain('        print("hi")');
  });
});

