/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RichTextareaHandle } from '../components/RichTextarea';
import { usePendingChatInsertSync } from '../hooks/usePendingChatInsertSync';

describe('usePendingChatInsertSync', () => {
  let container: HTMLDivElement;
  let root: Root;
  const setPendingChatInsert = vi.fn();
  const onExternalQuickActionInsert = vi.fn();
  const onExternalMentionInsert = vi.fn();
  const onMentionRefsChanged = vi.fn();
  const onMentionRefsCleared = vi.fn();
  const focus = vi.fn();
  const setSelectionRange = vi.fn();
  const applyProgrammaticChange = vi.fn();

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    setPendingChatInsert.mockReset();
    onExternalQuickActionInsert.mockReset();
    onExternalMentionInsert.mockReset();
    onMentionRefsChanged.mockReset();
    onMentionRefsCleared.mockReset();
    focus.mockReset();
    setSelectionRange.mockReset();
    applyProgrammaticChange.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function renderHarness(
    pendingChatInsert: {
      threadId: string;
      text: string;
      replaceTrailingMentionTrigger?: boolean;
      suppressMentionMenu?: boolean;
      mentionRefs?: Array<{ catId: string; mention: string }>;
      inspirationData?: {
        prompt: string;
        skills: [];
        agents: [];
        templateId: string;
      };
    } | null,
    initialInput = '@',
  ) {
    function Harness() {
      const [input, setInput] = useState(initialInput);
      const consumedRef = useRef<typeof pendingChatInsert>(null);
      const textareaRef = useRef<RichTextareaHandle>({
        focus,
        setSelectionRange,
        getSelectionStart: () => input.length,
        getSelectionEnd: () => input.length,
        getElement: () => document.createElement('div'),
        getClientRectAtOffset: () => new DOMRect(),
        applyProgrammaticChange,
      });
      usePendingChatInsertSync({
        pendingChatInsert,
        setPendingChatInsert,
        threadId: 'thread-1',
        quickActionTokenPrefix: '[[quick_action:',
        consumedRef,
        textareaRef,
        setInput,
        onExternalQuickActionInsert,
        onExternalMentionInsert,
        onMentionRefsChanged,
        onMentionRefsCleared,
      });

      return React.createElement('div', { 'data-testid': 'value' }, input);
    }

    act(() => {
      root.render(React.createElement(Harness));
    });
  }

  it('inserts expert mention text without opening the mention menu when suppressed', () => {
    renderHarness({
      threadId: 'thread-1',
      text: '@古诗词创作专家 ',
      replaceTrailingMentionTrigger: true,
      suppressMentionMenu: true,
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(container.querySelector('[data-testid="value"]')?.textContent).toBe('@古诗词创作专家 ');
    expect(onExternalMentionInsert).not.toHaveBeenCalled();
    expect(setPendingChatInsert).toHaveBeenCalledWith(null);
  });

  it('still opens the mention menu for regular programmatic mention inserts', () => {
    renderHarness({
      threadId: 'thread-1',
      text: '@诗词专家 ',
      replaceTrailingMentionTrigger: true,
    });

    act(() => {
      vi.runAllTimers();
    });

    expect(onExternalMentionInsert).toHaveBeenCalledWith('诗词专家', 0);
  });

  it('preserves mention refs for inspiration inserts that start with skill tokens', () => {
    const mentionRefs = [{ catId: 'office', mention: '@office' }];

    renderHarness(
      {
        threadId: 'thread-1',
        text: '[[quick_action:定时任务]] @office [[skill:lidan-writing-framework]]\n请生成一份知识讲解',
        mentionRefs,
        inspirationData: {
          prompt: '请生成一份知识讲解',
          skills: [],
          agents: [],
          templateId: 'tpl-001',
        },
      },
      '',
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(container.querySelector('[data-testid="value"]')?.textContent).toBe(
      '[[quick_action:定时任务]] @office [[skill:lidan-writing-framework]]\n请生成一份知识讲解',
    );
    expect(onMentionRefsChanged).toHaveBeenCalledWith(mentionRefs);
    expect(onMentionRefsCleared).not.toHaveBeenCalled();
    expect(setPendingChatInsert).toHaveBeenCalledWith(null);
  });
});
