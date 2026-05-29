/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutlinePreviewCard } from '@/components/outline-preview/OutlinePreviewCard';
import type { AskUserQuestionItem } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';

const OUTLINE_WITH_PAGES: AskUserQuestionItem[] = [
  {
    header: '大纲审阅',
    question: '请确认大纲内容',
    preview: {
      title: 'PPT大纲',
      text: `# 大纲：介绍华为公司

## 页面大纲

| 页码 | 类型 | 标题 | 研究需求 |
|------|------|------|:--------:|
| 1 | intro | 华为：构建万物互联的智能世界 | ❌ |
| 2 | data | 华为跻身全球科技企业第一梯队 | ✅ |

## 详细要点

### P1: 华为：构建万物互联的智能世界
封面页内容...

### P2: 华为跻身全球科技企业第一梯队
数据内容...
`,
      format: 'markdown',
      editable: true,
    },
    options: [
      { id: 'outline_confirm', label: '确认大纲' },
      { id: 'outline_use_edited', label: '使用编辑版本' },
    ],
  },
];

const OUTLINE_NO_PAGES: AskUserQuestionItem[] = [
  {
    header: '空大纲',
    question: '无页面内容',
    preview: {
      text: '# 空大纲\n\n无内容',
    },
    options: [{ id: 'outline_confirm', label: '确认' }],
  },
];

describe('OutlinePreviewCard', () => {
  let container: HTMLDivElement;
  let root: Root;
  const mockOnSubmit = vi.fn();

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
      activeOutlinePreview: null,
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('renders title and page list when preview has pages', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            source: 'ask_tool',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const heading = container.querySelector('h2');
      expect(heading?.textContent).toBe('PPT大纲');

      const content = container.querySelector('[data-testid="outline-preview-card-content"]');
      expect(content).not.toBeNull();
      expect(content?.textContent).toContain('P1: 华为：构建万物互联的智能世界');
      expect(content?.textContent).toContain('P2: 华为跻身全球科技企业第一梯队');
    });

    it('renders empty state when no pages in preview', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-2',
            questions: OUTLINE_NO_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const heading = container.querySelector('h2');
      expect(heading?.textContent).toBe('空大纲');

      // No page content area
      const content = container.querySelector('[data-testid="outline-preview-card-content"]');
      expect(content).toBeNull();
    });

    it('shows countdown button text while timer running', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmButton?.textContent).toContain('确认');
      expect(confirmButton?.textContent).toContain('s');
    });
  });

  describe('editing', () => {
    it('shows edit button on hover (via CSS class)', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Edit button exists but is hidden by opacity-0 CSS
      const editButtons = container.querySelectorAll('button[title="编辑"]');
      expect(editButtons.length).toBeGreaterThan(0);
    });

    it('enters edit mode when clicking edit button', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Trigger hover to make edit button visible, then click
      const firstLine = container.querySelector('.group');
      const editButton = firstLine?.querySelector('button[title="编辑"]') as HTMLButtonElement;

      await act(async () => {
        editButton?.click();
      });

      // Should show input for editing
      const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.value).toContain('P1:');
    });

    it('cancels edit and restores original text', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Enter edit mode
      const firstLine = container.querySelector('.group');
      const editButton = firstLine?.querySelector('button[title="编辑"]') as HTMLButtonElement;
      await act(async () => {
        editButton?.click();
      });

      // Modify input
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      const originalValue = input?.value;
      await act(async () => {
        if (input) {
          input.value = 'P1: 修改的标题';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Click cancel button
      const cancelButton = container.querySelector('button[title="取消"]') as HTMLButtonElement;
      await act(async () => {
        cancelButton?.click();
      });

      // Should restore original text
      const content = container.querySelector('[data-testid="outline-preview-card-content"]');
      expect(content?.textContent).toContain(originalValue);
    });
  });

  describe('confirm flow', () => {
    it('submits outline_confirm when no edits made', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            source: 'ask_tool',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-card-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
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

    it('submits outline_use_edited with edited text when edits made', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            source: 'ask_tool',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Enter edit mode for first page line
      const pageLines = container.querySelectorAll('[data-testid="outline-preview-card-content"] > div');
      const firstLine = pageLines[0] as HTMLElement;
      const editButton = firstLine?.querySelector('button[title="编辑"]') as HTMLButtonElement;

      await act(async () => {
        editButton?.click();
      });

      // Modify input value
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          nativeInputValueSetter?.call(input, 'P1: 新标题');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Click confirm edit button
      const confirmEditButton = firstLine?.querySelector('button[title="确认"]') as HTMLButtonElement;
      await act(async () => {
        confirmEditButton?.click();
      });

      // Now submit main confirm
      const confirmButton = container.querySelector('[data-testid="outline-preview-card-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      // Should submit with edited text containing new title in table row format
      expect(mockOnSubmit).toHaveBeenCalledWith({
        request_id: 'req-1',
        source: 'ask_tool',
        answers: [
          {
            question: '请确认大纲内容',
            selected_options: ['outline_use_edited'],
            custom_input: expect.stringContaining('| 1 | intro | 新标题 |'),
          },
        ],
      });
    });

    it('shows disabled "已确认" button after confirm', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const confirmButton = container.querySelector('[data-testid="outline-preview-card-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      // Button should now be disabled and show "已确认"
      const updatedButton = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(updatedButton?.textContent).toBe('已确认');
      expect((updatedButton as HTMLButtonElement)?.disabled).toBe(true);
    });
  });

  describe('open panel', () => {
    it('calls openOutlinePreview when clicking "查看详情"', async () => {
      const openOutlinePreview = vi.fn();
      useChatStore.setState({ openOutlinePreview });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            source: 'ask_tool',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const openPanelButton = container.querySelector('[data-testid="outline-preview-card-open-panel"]') as HTMLButtonElement;
      await act(async () => {
        openPanelButton?.click();
      });

      expect(openOutlinePreview).toHaveBeenCalledWith({
        requestId: 'req-1',
        source: 'ask_tool',
        initialText: OUTLINE_WITH_PAGES[0].preview!.text,
        title: 'PPT大纲',
        isConfirmed: false,
      });
    });

    it('stops countdown timer when opening panel', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Advance timer to see countdown
      await act(async () => {
        vi.advanceTimersByTimeAsync(5000);
      });

      const confirmBefore = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmBefore?.textContent).toContain('295s');

      // Open panel (stops timer)
      const openPanelButton = container.querySelector('[data-testid="outline-preview-card-open-panel"]') as HTMLButtonElement;
      await act(async () => {
        openPanelButton?.click();
      });

      // Timer should stop - countdown removed from button
      const confirmAfter = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmAfter?.textContent).toBe('确认');
    });
  });

  describe('auto-confirm', () => {
    it('auto-confirms on 300s timeout', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Advance to 300 seconds
      await act(async () => {
        vi.advanceTimersByTimeAsync(300000);
      });

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      expect(mockOnSubmit).toHaveBeenCalledWith({
        request_id: 'req-1',
        source: undefined,
        answers: [
          {
            question: '请确认大纲内容',
            selected_options: ['outline_confirm'],
            custom_input: null,
          },
        ],
      });
    });

    it('does not auto-confirm again after confirm', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Manual confirm first
      const confirmButton = container.querySelector('[data-testid="outline-preview-card-confirm"]') as HTMLButtonElement;
      await act(async () => {
        confirmButton?.click();
      });

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);

      // Advance past timeout - should not trigger again
      await act(async () => {
        vi.advanceTimersByTimeAsync(300000);
      });

      expect(mockOnSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('state sync', () => {
    it('syncs card edits to store when panel is open', async () => {
      useChatStore.setState({
        activeOutlinePreview: {
          requestId: 'req-1',
          threadId: 'thread-A',
          initialText: OUTLINE_WITH_PAGES[0].preview!.text,
          editedText: OUTLINE_WITH_PAGES[0].preview!.text,
          title: 'PPT大纲',
          panelMode: 'preview',
          isConfirmed: false,
        },
      });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Enter edit mode for first page line
      const pageLines = container.querySelectorAll('[data-testid="outline-preview-card-content"] > div');
      const firstLine = pageLines[0] as HTMLElement;
      const editButton = firstLine?.querySelector('button[title="编辑"]') as HTMLButtonElement;

      await act(async () => {
        editButton?.click();
      });

      // Modify input value
      const input = container.querySelector('input[type="text"]') as HTMLInputElement;
      await act(async () => {
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          nativeInputValueSetter?.call(input, 'P1: 新标题');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      // Click confirm edit button
      const confirmEditButton = firstLine?.querySelector('button[title="确认"]') as HTMLButtonElement;
      await act(async () => {
        confirmEditButton?.click();
      });

      // Store should have been updated with edited text containing new title in table row format
      expect(useChatStore.getState().activeOutlinePreview?.editedText).toContain('| 1 | intro | 新标题 |');
    });

    it('syncs store confirmed state to card', async () => {
      useChatStore.setState({
        activeOutlinePreview: {
          requestId: 'req-1',
          threadId: 'thread-A',
          initialText: OUTLINE_WITH_PAGES[0].preview!.text,
          editedText: OUTLINE_WITH_PAGES[0].preview!.text,
          title: 'PPT大纲',
          panelMode: 'preview',
          isConfirmed: true,
        },
      });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Card should show confirmed state
      const confirmButton = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmButton?.textContent).toBe('已确认');
      expect((confirmButton as HTMLButtonElement)?.disabled).toBe(true);
    });

    it('persists confirmed state after panel closes', async () => {
      // Simulate panel confirming then closing
      useChatStore.setState({
        activeOutlinePreview: {
          requestId: 'req-1',
          threadId: 'thread-A',
          initialText: OUTLINE_WITH_PAGES[0].preview!.text,
          editedText: OUTLINE_WITH_PAGES[0].preview!.text,
          title: 'PPT大纲',
          panelMode: 'preview',
          isConfirmed: true,
        },
      });

      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Card should show confirmed state
      const confirmButton = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmButton?.textContent).toBe('已确认');

      // Now close the panel (set activeOutlinePreview to null)
      await act(async () => {
        useChatStore.setState({ activeOutlinePreview: null });
        vi.advanceTimersByTimeAsync(0);
      });

      // Card should still show confirmed state (localConfirmed was synced)
      const confirmButtonAfter = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmButtonAfter?.textContent).toBe('已确认');
      expect((confirmButtonAfter as HTMLButtonElement)?.disabled).toBe(true);
    });

    it('stops countdown timer when clicking edit button', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Advance timer to see countdown
      await act(async () => {
        vi.advanceTimersByTimeAsync(5000);
      });

      const confirmBefore = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmBefore?.textContent).toContain('295s');

      // Click edit button on first line (should stop timer)
      const firstLine = container.querySelector('.group');
      const editButton = firstLine?.querySelector('button[title="编辑"]') as HTMLButtonElement;
      await act(async () => {
        editButton?.click();
      });

      // Timer should stop - countdown removed from button
      const confirmAfter = container.querySelector('[data-testid="outline-preview-card-confirm"]');
      expect(confirmAfter?.textContent).toBe('确认');
    });

    it('renders outline icon in header', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      const headerIcon = container.querySelector('header img[src="/icons/outline.svg"]');
      expect(headerIcon).not.toBeNull();
      expect(headerIcon?.className).toContain('w-[24px] h-[24px]');
    });

    it('uses new check-line and cross-line icons for edit actions', async () => {
      await act(async () => {
        root.render(
          React.createElement(OutlinePreviewCard, {
            requestId: 'req-1',
            questions: OUTLINE_WITH_PAGES,
            onSubmit: mockOnSubmit,
          }),
        );
      });

      // Enter edit mode
      const firstLine = container.querySelector('.group');
      const editButton = firstLine?.querySelector('button[title="编辑"]') as HTMLButtonElement;
      await act(async () => {
        editButton?.click();
      });

      // Check confirm icon
      const confirmIcon = container.querySelector('button[title="确认"] img');
      expect(confirmIcon?.getAttribute('src')).toBe('/icons/check-line.svg');

      // Check cancel icon
      const cancelIcon = container.querySelector('button[title="取消"] img');
      expect(cancelIcon?.getAttribute('src')).toBe('/icons/cross-line.svg');
    });
  });
});