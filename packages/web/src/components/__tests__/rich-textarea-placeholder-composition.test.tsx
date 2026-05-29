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

    return (
      <RichTextarea
        value={value}
        placeholder="描述你想研究的主题或@助手协助工作"
        onValueChange={(next) => {
          setValue(next);
        }}
      />
    );
  }

  act(() => {
    root.render(<TestHarness />);
  });

  return container.querySelector('[role="textbox"]') as HTMLDivElement;
}

describe('RichTextarea placeholder during composition', () => {
  it('hides placeholder while IME composition is active', () => {
    const textbox = renderRichTextarea();

    expect(container.textContent).toContain('描述你想研究的主题或@助手协助工作');

    act(() => {
      textbox.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('描述你想研究的主题或@助手协助工作');
  });

  it('keeps placeholder hidden after composition commits text', () => {
    const textbox = renderRichTextarea();

    act(() => {
      textbox.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      textbox.textContent = '你';
      textbox.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }));
    });

    expect(container.textContent).toContain('你');
    expect(container.textContent).not.toContain('描述你想研究的主题或@助手协助工作');
  });
});
