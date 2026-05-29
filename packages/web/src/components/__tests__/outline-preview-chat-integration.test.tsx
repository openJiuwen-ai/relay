/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlinePreviewSecondaryPane, useOutlinePreviewActive } from '@/components/outline-preview/outline-preview-chat-integration';
import { useChatStore } from '@/stores/chatStore';
import { useAskUserQuestion } from '@/hooks/useAskUserQuestion';

// Mock useAskUserQuestion hook
vi.mock('@/hooks/useAskUserQuestion', () => ({
  useAskUserQuestion: vi.fn(),
}));

const mockUseAskUserQuestion = vi.mocked(useAskUserQuestion);

describe('OutlinePreviewSecondaryPane', () => {
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
    mockUseAskUserQuestion.mockReturnValue({
      pendingQuestion: null,
      pendingQuestions: [],
      submitAnswer: vi.fn(),
      fetchPending: vi.fn(),
      handleQuestionRequest: vi.fn(),
      handleQuestionResponse: vi.fn(),
    });
    useChatStore.setState({
      currentThreadId: 'thread-A',
      activeOutlinePreview: null,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('returns null when no activeOutlinePreview', async () => {
    useChatStore.setState({ activeOutlinePreview: null });

    await act(async () => {
      root.render(
        React.createElement(OutlinePreviewSecondaryPane, {
          onResize: vi.fn(),
          onReset: vi.fn(),
        }),
      );
    });

    expect(container.innerHTML).toBe('');
  });

  it('renders OutlinePreviewPanel when activeOutlinePreview exists', async () => {
    mockUseAskUserQuestion.mockReturnValue({
      pendingQuestion: {
        requestId: 'req-1',
        source: 'ask_tool',
        createdAt: Date.now(),
        questions: [
          {
            header: '大纲审阅',
            question: '请确认大纲',
            preview: { text: '# Outline' },
            options: [{ id: 'outline_confirm', label: '确认' }],
          },
        ],
      },
      pendingQuestions: [],
      submitAnswer: vi.fn(),
      fetchPending: vi.fn(),
      handleQuestionRequest: vi.fn(),
      handleQuestionResponse: vi.fn(),
    });

    useChatStore.setState({
      activeOutlinePreview: {
        requestId: 'req-1',
        threadId: 'thread-A',
        initialText: '# Outline',
        editedText: '# Outline',
        title: '大纲审阅',
        panelMode: 'preview',
        isConfirmed: false,
      },
    });

    await act(async () => {
      root.render(
        React.createElement(OutlinePreviewSecondaryPane, {
          onResize: vi.fn(),
          onReset: vi.fn(),
        }),
      );
    });

    expect(container.querySelector('[data-testid="outline-preview-panel"]')).not.toBeNull();
  });

  it('renders resizer when not compact layout', async () => {
    mockUseAskUserQuestion.mockReturnValue({
      pendingQuestion: {
        requestId: 'req-1',
        createdAt: Date.now(),
        questions: [],
      },
      pendingQuestions: [],
      submitAnswer: vi.fn(),
      fetchPending: vi.fn(),
      handleQuestionRequest: vi.fn(),
      handleQuestionResponse: vi.fn(),
    });

    useChatStore.setState({
      activeOutlinePreview: {
        requestId: 'req-1',
        threadId: 'thread-A',
        initialText: '# Outline',
        editedText: '# Outline',
        title: '大纲审阅',
        panelMode: 'preview',
        isConfirmed: false,
      },
    });

    await act(async () => {
      root.render(
        React.createElement(OutlinePreviewSecondaryPane, {
          isCompactPreviewLayout: false,
          previewPaneWidth: 400,
          onResize: vi.fn(),
          onReset: vi.fn(),
        }),
      );
    });

    expect(container.querySelector('[data-testid="outline-preview-pane-resizer"]')).not.toBeNull();
  });

  it('does not render resizer in compact layout', async () => {
    mockUseAskUserQuestion.mockReturnValue({
      pendingQuestion: {
        requestId: 'req-1',
        createdAt: Date.now(),
        questions: [],
      },
      pendingQuestions: [],
      submitAnswer: vi.fn(),
      fetchPending: vi.fn(),
      handleQuestionRequest: vi.fn(),
      handleQuestionResponse: vi.fn(),
    });

    useChatStore.setState({
      activeOutlinePreview: {
        requestId: 'req-1',
        threadId: 'thread-A',
        initialText: '# Outline',
        editedText: '# Outline',
        title: '大纲审阅',
        panelMode: 'preview',
        isConfirmed: false,
      },
    });

    await act(async () => {
      root.render(
        React.createElement(OutlinePreviewSecondaryPane, {
          isCompactPreviewLayout: true,
          onResize: vi.fn(),
          onReset: vi.fn(),
        }),
      );
    });

    expect(container.querySelector('[data-testid="outline-preview-pane-resizer"]')).toBeNull();
  });
});

describe('useOutlinePreviewActive', () => {
  it('returns true when rightPanelMode is outlinePreview and activeOutlinePreview exists', () => {
    useChatStore.setState({
      rightPanelMode: 'outlinePreview',
      activeOutlinePreview: {
        requestId: 'req-1',
        threadId: 'thread-A',
        initialText: '# Outline',
        editedText: '# Outline',
        title: '大纲审阅',
        panelMode: 'preview',
        isConfirmed: false,
      },
    });

    // Call the hook by rendering a component that uses it
    const TestComponent = () => {
      const isActive = useOutlinePreviewActive();
      return React.createElement('div', null, isActive ? 'active' : 'inactive');
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(TestComponent));
    });

    expect(container.textContent).toBe('active');
    root.unmount();
    container.remove();
  });

  it('returns false when rightPanelMode is not outlinePreview', () => {
    useChatStore.setState({
      rightPanelMode: 'status',
      activeOutlinePreview: {
        requestId: 'req-1',
        threadId: 'thread-A',
        initialText: '# Outline',
        editedText: '# Outline',
        title: '大纲审阅',
        panelMode: 'preview',
        isConfirmed: false,
      },
    });

    const TestComponent = () => {
      const isActive = useOutlinePreviewActive();
      return React.createElement('div', null, isActive ? 'active' : 'inactive');
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(TestComponent));
    });

    expect(container.textContent).toBe('inactive');
    root.unmount();
    container.remove();
  });

  it('returns false when activeOutlinePreview is null', () => {
    useChatStore.setState({
      rightPanelMode: 'outlinePreview',
      activeOutlinePreview: null,
    });

    const TestComponent = () => {
      const isActive = useOutlinePreviewActive();
      return React.createElement('div', null, isActive ? 'active' : 'inactive');
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(TestComponent));
    });

    expect(container.textContent).toBe('inactive');
    root.unmount();
    container.remove();
  });
});