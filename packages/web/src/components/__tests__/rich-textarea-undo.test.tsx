/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

function renderRichTextarea() {
  function TestHarness() {
    const [value, setValue] = useState('');

    return <RichTextarea value={value} onValueChange={(next) => setValue(next)} />;
  }

  act(() => {
    root.render(<TestHarness />);
  });

  return container.querySelector('[role="textbox"]') as HTMLDivElement;
}

function setCaretToEnd(element: HTMLDivElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function typeIntoTextbox(textbox: HTMLDivElement, value: string) {
  textbox.textContent = value;
  setCaretToEnd(textbox);
  textbox.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('RichTextarea undo behavior', () => {
  it('undoes the previous input step on Ctrl+Z', () => {
    const textbox = renderRichTextarea();

    act(() => {
      typeIntoTextbox(textbox, 'hello');
      typeIntoTextbox(textbox, 'hello world');
    });

    expect(textbox.textContent).toBe('hello world');

    act(() => {
      textbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    });

    expect(textbox.textContent).toBe('hello');
  });

  it('undoes and redoes through history input events', () => {
    const textbox = renderRichTextarea();

    act(() => {
      typeIntoTextbox(textbox, 'hello');
      typeIntoTextbox(textbox, 'hello world');
    });

    expect(textbox.textContent).toBe('hello world');

    act(() => {
      const event = new Event('input', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'inputType', { value: 'historyUndo' });
      textbox.dispatchEvent(event);
    });

    expect(textbox.textContent).toBe('hello');

    act(() => {
      const event = new Event('input', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'inputType', { value: 'historyRedo' });
      textbox.dispatchEvent(event);
    });

    expect(textbox.textContent).toBe('hello world');
  });
});
