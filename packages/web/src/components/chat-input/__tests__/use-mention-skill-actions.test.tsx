/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMentionSkillActions } from '../hooks/useMentionSkillActions';

describe('useMentionSkillActions structured mention refs', () => {
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

  it('inserts the route mention text and emits the selected catId', async () => {
    const onInserted = vi.fn();

    function Harness() {
      const [input, setInput] = useState('@');
      const insertedRef = useRef(false);
      const textareaRef = useRef({
        getSelectionStart: () => 1,
        getSelectionEnd: () => 1,
        focus: vi.fn(),
        setSelectionRange: vi.fn(),
      });
      const menuRef = useRef<HTMLDivElement>(null);
      const {
        insertMention,
      } = useMentionSkillActions({
        showMentions: false,
        mentionStart: 0,
        mentionEnd: 1,
        input,
        textareaRef: textareaRef as never,
        menuRef,
        skillInsertAnchorRef: useRef<{ start: number; end: number } | null>(null),
        setInput,
        setShowMentions: vi.fn(),
        setShowSkillMenu: vi.fn(),
        setMentionStart: vi.fn(),
        setMentionEnd: vi.fn(),
        setMentionMenuStyle: vi.fn(),
        clearMentionFilter: vi.fn(),
        clearSkillFilter: vi.fn(),
        onMentionRefInserted: onInserted,
      });

      useEffect(() => {
        if (insertedRef.current) return;
        insertedRef.current = true;
        insertMention({
          id: 'expert-poetry',
          label: '@古诗词创作专家',
          desc: 'test',
          insert: '@诗词专家 ',
          color: '#ff00ff',
          avatar: '',
        });
      }, [insertMention]);

      return React.createElement('div', { 'data-testid': 'value' }, input);
    }

    await act(async () => {
      root.render(React.createElement(Harness));
    });

    expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('@诗词专家 ');
    expect(onInserted).toHaveBeenCalledWith({ catId: 'expert-poetry', mention: '@诗词专家' });
  });
});
