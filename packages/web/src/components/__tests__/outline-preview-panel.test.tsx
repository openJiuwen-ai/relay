/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlinePreviewPanel } from '@/components/outline-preview/OutlinePreviewPanel';
import { useChatStore } from '@/stores/chatStore';
import type { ActiveOutlinePreview, PendingAskUserQuestion } from '@/stores/chat-types';

const DEFAULT_ACTIVE: ActiveOutlinePreview = {
  requestId: 'req-1',
  threadId: 'thread-A',
  initialText: '# 大纲\n## P1: 标题',
  editedText: '# 大纲\n## P1: 标题',
  title: '大纲审阅',
  panelMode: 'preview',
  isConfirmed: false,
  source: 'ask_tool', // Add source
};

const DEFAULT_PENDING: PendingAskUserQuestion = {
  requestId: 'req-1',
  source: 'ask_tool',
  createdAt: Date.now(),
  questions: [
    {
      header: '大纲审阅',
      question: '请确认大纲内容',
      preview: {
        text: '# 大纲\n## P1: 标题',
      },
      options: [
        { id: 'outline_confirm', label: '确认大纲' },
        { id: 'outline_use_edited', label: '使用编辑版本' },
      ],
    },
  ],
};

const mockOnSubmit = vi.fn();

describe('OutlinePreviewPanel', () => {
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
    vi.useFakeTimers();
    mockOnSubmit.mockReset();
    mockOnSubmit.mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useChatStore.setState({
      currentThreadId: 'thread-A',
      activeOutlinePreview: DEFAULT_ACTIVE,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('renders title and content area', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE,
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      expect(container.querySelector('[data-testid="outline-preview-panel"]')).not.toBeNull();
      expect(container.textContent).toContain('大纲审阅');
    });

    it('shows markdown preview in preview mode', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: { ...DEFAULT_ACTIVE, panelMode: 'preview' },
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Should not have textarea
      expect(container.querySelector('[data-testid="outline-preview-panel-textarea"]')).toBeNull();
    });

    it('shows textarea in edit mode', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: { ...DEFAULT_ACTIVE, panelMode: 'edit' },
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      expect(container.querySelector('[data-testid="outline-preview-panel-textarea"]')).not.toBeNull();
    });
  });

  describe('mode switching', () => {
    it('switches to preview mode when clicking preview button', async () => {
      const setOutlinePreviewMode = vi.fn();
      useChatStore.setState({ setOutlinePreviewMode });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: { ...DEFAULT_ACTIVE, panelMode: 'edit' },
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Click preview button (eye icon)
      const previewButton = container.querySelector('button[aria-label="预览模式"]') as HTMLButtonElement;
      await act(async () => {
        previewButton?.click();
      });

      expect(setOutlinePreviewMode).toHaveBeenCalledWith('preview');
    });

    it('switches to edit mode when clicking edit button', async () => {
      const setOutlinePreviewMode = vi.fn();
      useChatStore.setState({ setOutlinePreviewMode });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: { ...DEFAULT_ACTIVE, panelMode: 'preview' },
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Click edit button
      const editButton = container.querySelector('button[aria-label="编辑模式"]') as HTMLButtonElement;
      await act(async () => {
        editButton?.click();
      });

      expect(setOutlinePreviewMode).toHaveBeenCalledWith('edit');
    });
  });

  describe('text editing', () => {
    it('calls updateOutlinePreviewText when textarea changes', async () => {
      const updateOutlinePreviewText = vi.fn();
      useChatStore.setState({ updateOutlinePreviewText });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: { ...DEFAULT_ACTIVE, panelMode: 'edit' },
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const textarea = container.querySelector('[data-testid="outline-preview-panel-textarea"]') as HTMLTextAreaElement;
      await act(async () => {
        if (textarea) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          nativeInputValueSetter?.call(textarea, 'modified text');
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      expect(updateOutlinePreviewText).toHaveBeenCalledWith('modified text');
    });
  });

  describe('confirm flow', () => {
    it('submits outline_confirm when no edits made', async () => {
      const noEditActive = {
        ...DEFAULT_ACTIVE,
        initialText: '# 大纲',
        editedText: '# 大纲', // Same as initial
      };

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: noEditActive,
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-panel-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      await act(async () => {
        vi.advanceTimersByTimeAsync(1200);
      });

      expect(mockOnSubmit).toHaveBeenCalledWith({
        request_id: 'req-1',
        source: 'ask_tool',
        answers: [
          {
            question: '请确认大纲内容',
            selected_options: ['outline_confirm'],
            custom_input: null,
          },
        ],
      });
    });

    it('submits outline_use_edited when edits made', async () => {
      const editedActive = {
        ...DEFAULT_ACTIVE,
        initialText: '# 大纲',
        editedText: '# 修改的大纲', // Different
      };

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: editedActive,
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-panel-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      await act(async () => {
        vi.advanceTimersByTimeAsync(1200);
      });

      expect(mockOnSubmit).toHaveBeenCalledWith({
        request_id: 'req-1',
        source: 'ask_tool',
        answers: [
          {
            question: '请确认大纲内容',
            selected_options: ['outline_use_edited'],
            custom_input: '# 修改的大纲',
          },
        ],
      });
    });

    it('shows disabled "已确认" button after confirm', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE,
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-panel-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      // After confirm, should show disabled "已确认" button
      const disabledButton = container.querySelector('button[disabled]');
      expect(disabledButton?.textContent).toBe('已确认');
    });
  });

  describe('error handling', () => {
    it('shows error when missing pendingQuestion', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE,
            pendingQuestion: null,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Try to confirm - should show error
      const confirmButton = container.querySelector('[data-testid="outline-preview-panel-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      expect(container.querySelector('[data-testid="outline-preview-panel-error"]')).not.toBeNull();
    });

    it('shows error when requestId mismatch', async () => {
      const mismatchedPending: PendingAskUserQuestion = {
        requestId: 'req-different', // Different from active
        source: 'ask_tool',
        createdAt: Date.now(),
        questions: DEFAULT_PENDING.questions,
      };

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE, // requestId: 'req-1'
            pendingQuestion: mismatchedPending,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-panel-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      expect(container.querySelector('[data-testid="outline-preview-panel-error"]')).not.toBeNull();
    });

    it('closes panel when requestId mismatch detected', async () => {
      const closeOutlinePreview = vi.fn();
      useChatStore.setState({ closeOutlinePreview });

      const mismatchedPending: PendingAskUserQuestion = {
        requestId: 'req-different',
        source: 'ask_tool',
        createdAt: Date.now(),
        questions: DEFAULT_PENDING.questions,
      };

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE,
            pendingQuestion: mismatchedPending,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      expect(closeOutlinePreview).toHaveBeenCalled();
    });

    it('closes panel when threadId mismatch detected', async () => {
      const closeOutlinePreview = vi.fn();
      useChatStore.setState({
        currentThreadId: 'thread-B', // Different from active.threadId
        closeOutlinePreview,
      });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE, // threadId: 'thread-A'
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      expect(closeOutlinePreview).toHaveBeenCalled();
    });
  });

  describe('state sync', () => {
    it('sets isConfirmed true after confirm', async () => {
      const setOutlinePreviewConfirmed = vi.fn();
      useChatStore.setState({ setOutlinePreviewConfirmed });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE,
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-panel-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      expect(setOutlinePreviewConfirmed).toHaveBeenCalledWith(true);
    });

    it('closes panel after 1.2s delay', async () => {
      const closeOutlinePreview = vi.fn();
      useChatStore.setState({ closeOutlinePreview });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewPanel, {
            active: DEFAULT_ACTIVE,
            pendingQuestion: DEFAULT_PENDING,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-panel-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      // Not closed immediately
      expect(closeOutlinePreview).not.toHaveBeenCalled();

      // After 1.2s delay
      await act(async () => {
        vi.advanceTimersByTimeAsync(1200);
      });

      expect(closeOutlinePreview).toHaveBeenCalled();
    });
  });
});