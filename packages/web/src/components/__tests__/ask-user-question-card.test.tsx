/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *  *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskUserQuestionCard } from '@/components/AskUserQuestionCard';
import type { AskUserQuestionItem } from '@/stores/chat-types';

const QUESTIONS: AskUserQuestionItem[] = [
  {
    header: '受众',
    question: '你的核心受众是谁？',
    options: [
      { label: '潜在客户', description: '突出业务价值' },
      { label: '内部团队', description: '沉淀项目经验' },
      { label: '行业同行', description: '展示最佳实践' },
      { label: '其他' },
    ],
  },
  {
    header: '目标',
    question: '这次内容最想突出什么？',
    options: [
      { label: '增长结果', description: '突出结果和影响' },
      { label: '设计过程', description: '突出研究和迭代' },
    ],
  },
];

describe('AskUserQuestionCard', () => {
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

  it('renders the current question, page indicator, and layout constraints', async () => {
    await act(async () => {
      root.render(
        React.createElement(AskUserQuestionCard, {
          requestId: 'req-1',
          source: 'ask_tool',
          questions: QUESTIONS,
          onSubmit: vi.fn(),
          onCancel: vi.fn(),
        }),
      );
    });

    const heading = container.querySelector('h2');
    expect(heading?.textContent).toBe('你的核心受众是谁？');
    expect(container.querySelector('[data-testid="ask-user-question-card-page-indicator"]')?.textContent).toBe('1 / 2');
    expect(container.querySelector('[data-testid="ask-user-question-card-root"]')?.className).toContain('w-[560px]');
    expect(container.querySelector('[data-testid="ask-user-question-card-root"]')?.className).toContain('max-h-[318px]');
    expect(container.querySelector('[data-testid="ask-user-question-card-options"]')?.className).toContain('overflow-y-auto');
  });

  it('selects one option for the active question and highlights the chosen option', async () => {
    await act(async () => {
      root.render(
        React.createElement(AskUserQuestionCard, {
          requestId: 'req-1',
          questions: QUESTIONS,
          onSubmit: vi.fn(),
        }),
      );
    });

    const option = container.querySelector(
      '[data-testid="ask-user-question-card-option-潜在客户"]',
    ) as HTMLButtonElement | null;
    expect(option).not.toBeNull();

    await act(async () => {
      option?.click();
    });

    expect(option?.className).toContain('border-[var(--connector-tab-border-selected)]');
  });

  it('supports controlled pagination and disables navigation at the boundaries', async () => {
    const onPageChange = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AskUserQuestionCard, {
          requestId: 'req-1',
          questions: QUESTIONS,
          currentPage: 1,
          onPageChange,
          onSubmit: vi.fn(),
        }),
      );
    });

    expect(container.textContent).toContain('这次内容最想突出什么？');
    expect(container.querySelector('[data-testid="ask-user-question-card-page-indicator"]')?.textContent).toBe('2 / 2');

    const prevButton = container.querySelector(
      '[data-testid="ask-user-question-card-prev"]',
    ) as HTMLButtonElement | null;
    const nextButton = container.querySelector(
      '[data-testid="ask-user-question-card-next"]',
    ) as HTMLButtonElement | null;

    expect(prevButton?.disabled).toBe(false);
    expect(nextButton?.disabled).toBe(true);

    await act(async () => {
      prevButton?.click();
    });

    expect(onPageChange).toHaveBeenCalledWith(0);
  });

  it('submits single-select answers in ask_user_question format on the final page', async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AskUserQuestionCard, {
          requestId: 'req-42',
          source: 'ask_tool',
          questions: QUESTIONS,
          onSubmit,
        }),
      );
    });

    const firstOption = container.querySelector(
      '[data-testid="ask-user-question-card-option-潜在客户"]',
    ) as HTMLButtonElement | null;
    const primaryButton = () => container.querySelector('button.ui-button-primary') as HTMLButtonElement | null;

    await act(async () => {
      firstOption?.click();
    });

    await act(async () => {
      primaryButton()?.click();
    });

    const secondOption = container.querySelector(
      '[data-testid="ask-user-question-card-option-增长结果"]',
    ) as HTMLButtonElement | null;

    await act(async () => {
      secondOption?.click();
    });

    await act(async () => {
      primaryButton()?.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      request_id: 'req-42',
      source: 'ask_tool',
      answers: [
        {
          question: '你的核心受众是谁？',
          selected_options: ['潜在客户'],
          custom_input: null,
        },
        {
          question: '这次内容最想突出什么？',
          selected_options: ['增长结果'],
          custom_input: null,
        },
      ],
    });
  });

  it('allows unanswered questions and submits empty selected_options', async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AskUserQuestionCard, {
          requestId: 'req-empty',
          questions: QUESTIONS,
          onSubmit,
        }),
      );
    });

    const primaryButton = () => container.querySelector('button.ui-button-primary') as HTMLButtonElement | null;

    await act(async () => {
      primaryButton()?.click();
    });

    await act(async () => {
      primaryButton()?.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      request_id: 'req-empty',
      source: undefined,
      answers: [
        {
          question: '你的核心受众是谁？',
          selected_options: [],
          custom_input: null,
        },
        {
          question: '这次内容最想突出什么？',
          selected_options: [],
          custom_input: null,
        },
      ],
    });
  });

  it('shows an other input and submits custom_input when selecting 其他', async () => {
    const onSubmit = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(AskUserQuestionCard, {
          requestId: 'req-other',
          source: 'ask_tool',
          questions: QUESTIONS,
          onSubmit,
        }),
      );
    });

    const otherOption = container.querySelector(
      '[data-testid="ask-user-question-card-option-其他"]',
    ) as HTMLButtonElement | null;
    expect(otherOption).not.toBeNull();

    await act(async () => {
      otherOption?.click();
    });

    const otherInput = container.querySelector(
      '[data-testid="ask-user-question-card-other-input"]',
    ) as HTMLInputElement | null;
    expect(otherInput).not.toBeNull();
    expect(otherInput?.className).toContain('ui-input');

    await act(async () => {
      if (otherInput) {
        otherInput.value = '鑷畾涔夌瓟妗?';
        otherInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    const primaryButton = () => container.querySelector('button.ui-button-primary') as HTMLButtonElement | null;

    await act(async () => {
      primaryButton()?.click();
    });

    await act(async () => {
      primaryButton()?.click();
    });

    expect(onSubmit).toHaveBeenCalledWith({
      request_id: 'req-other',
      source: 'ask_tool',
      answers: [
        {
          question: '浣犵殑鏍稿績鍙椾紬鏄皝锛?',
          selected_options: ['其他'],
          custom_input: '鑷畾涔夌瓟妗?',
        },
        {
          question: '杩欐鍐呭鏈€鎯崇獊鍑轰粈涔堬紵',
          selected_options: [],
          custom_input: null,
        },
      ],
    });
  });
});
