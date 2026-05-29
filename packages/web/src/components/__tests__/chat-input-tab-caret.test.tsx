/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatInputKeyboard } from '@/components/chat-input/hooks/useChatInputKeyboard';

const findMatchMock = vi.fn();

vi.mock('@/stores/inputHistoryStore', () => ({
  useInputHistoryStore: {
    getState: () => ({
      findMatch: findMatchMock,
    }),
  },
}));

describe('ChatInput Tab caret placement', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handleKeyDown: ((e: React.KeyboardEvent<HTMLDivElement>) => void) | null = null;
  const applyProgrammaticChange = vi.fn();
  const setSelectionRange = vi.fn();

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    findMatchMock.mockReset();
    applyProgrammaticChange.mockReset();
    setSelectionRange.mockReset();
    handleKeyDown = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderHook(params: Partial<Parameters<typeof useChatInputKeyboard>[0]> = {}) {
    const textareaRef = {
      current: {
        applyProgrammaticChange,
        setSelectionRange,
        getSelectionStart: () => 0,
        getSelectionEnd: () => 0,
      },
    } as unknown as React.RefObject<{
      applyProgrammaticChange: (value: string, selectionStart: number, selectionEnd: number) => void;
      setSelectionRange: (start: number, end: number) => void;
      getSelectionStart: () => number;
      getSelectionEnd: () => number;
    }>;

    function Harness() {
      const { handleKeyDown: nextHandleKeyDown } = useChatInputKeyboard({
        input: 'hel',
        hasActiveInvocation: false,
        activeMenu: null,
        activeOptionsCount: 0,
        selectedIdx: 0,
        setSelectedIdx: vi.fn(),
        filteredAgentOptions: [],
        filteredSkillOptions: [],
        workspaceMenuItems: [],
        textareaRef,
        setInput: vi.fn(),
        closeMenus: vi.fn(),
        clearMentionFilter: vi.fn(),
        clearSkillFilter: vi.fn(),
        setMentionStart: vi.fn(),
        setMentionEnd: vi.fn(),
        insertMention: vi.fn(),
        insertSkill: vi.fn(),
        handleWorkspaceMenuSelect: vi.fn(),
        handleSend: vi.fn(),
        handleQueueSend: vi.fn(),
        setGhostSuggestion: vi.fn(),
        ghostRef: { current: null },
        setShowHistorySearch: vi.fn(),
        pathCompletion: {
          isOpen: false,
          entries: [],
          selectedIdx: 0,
          setSelectedIdx: vi.fn(),
          selectEntry: vi.fn(),
          close: vi.fn(),
        },
        ...params,
      });
      handleKeyDown = nextHandleKeyDown;
      return null;
    }

    act(() => {
      root.render(React.createElement(Harness));
    });
  }

  it('moves cursor to end after path completion Tab accept', () => {
    const selectEntry = vi.fn(() => './src/components/');
    renderHook({
      pathCompletion: {
        isOpen: true,
        entries: [{ label: 'components/', path: '/tmp/components', isDir: true }],
        selectedIdx: 0,
        setSelectedIdx: vi.fn(),
        selectEntry,
        close: vi.fn(),
      },
    });

    act(() => {
      handleKeyDown?.({
        key: 'Tab',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        nativeEvent: { isComposing: false },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLDivElement>);
    });

    expect(applyProgrammaticChange).toHaveBeenCalledWith('./src/components/', './src/components/'.length, './src/components/'.length);
    expect(setSelectionRange).not.toHaveBeenCalled();
  });

  it('moves cursor to end after history ghost Tab accept', () => {
    findMatchMock.mockReturnValue('hello world');
    renderHook();

    act(() => {
      handleKeyDown?.({
        key: 'Tab',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        nativeEvent: { isComposing: false },
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLDivElement>);
    });

    expect(applyProgrammaticChange).toHaveBeenCalledWith('hello world', 'hello world'.length, 'hello world'.length);
  });
});
