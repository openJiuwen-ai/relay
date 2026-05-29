/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskUserQuestionAnswer, PendingAskUserQuestion } from '@/stores/chat-types';
import { apiFetch } from '@/utils/api-client';
import { useAskUserQuestion } from '@/hooks/useAskUserQuestion';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

const QUESTION_A: PendingAskUserQuestion = {
  requestId: 'ask-1',
  source: 'ask_tool',
  questions: [
    {
      header: '受众',
      question: '你的核心受众是谁？',
      options: [{ label: '潜在客户' }, { label: '内部团队' }],
    },
  ],
  agentId: 'codex',
  createdAt: 1,
};

const QUESTION_B: PendingAskUserQuestion = {
  requestId: 'ask-2',
  source: 'ask_tool',
  questions: [
    {
      header: '目标',
      question: '这次内容最想突出什么？',
      options: [{ label: '增长结果' }, { label: '设计过程' }],
    },
  ],
  agentId: 'codex',
  createdAt: 2,
};

function buildAnswers(question: PendingAskUserQuestion): AskUserQuestionAnswer[] {
  return [
    {
      question: question.questions[0]?.question ?? '',
      selected_options: ['潜在客户'],
      custom_input: null,
    },
  ];
}

type HookSnapshot = ReturnType<typeof useAskUserQuestion>;

function flushPromises() {
  return Promise.resolve();
}

describe('useAskUserQuestion', () => {
  let container: HTMLDivElement;
  let root: Root;
  let snapshot: HookSnapshot | null = null;
  const apiFetchMock = vi.mocked(apiFetch);

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
    snapshot = null;
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.startsWith('/api/ask-user-question/pending')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ pending: [QUESTION_A, QUESTION_B] }),
        } as Response);
      }
      if (url === '/api/ask-user-question/respond' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok' }),
        } as Response);
      }
      throw new Error(`unexpected apiFetch call: ${String(url)}`);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    snapshot = null;
  });

  function HookHost({ threadId }: { threadId: string }) {
    snapshot = useAskUserQuestion(threadId);
    return null;
  }

  it('keeps the full pending queue and exposes the first question as current', async () => {
    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-ask' }));
      await flushPromises();
    });

    expect(snapshot?.pendingQuestion?.requestId).toBe('ask-1');
    expect(snapshot?.pendingQuestions.map((item) => item.requestId)).toEqual(['ask-1', 'ask-2']);

    act(() => {
      snapshot?.handleQuestionRequest({
        ...QUESTION_B,
        requestId: 'ask-3',
        createdAt: 3,
      });
    });

    expect(snapshot?.pendingQuestion?.requestId).toBe('ask-1');
    expect(snapshot?.pendingQuestions.map((item) => item.requestId)).toEqual(['ask-1', 'ask-2', 'ask-3']);
  });

  it('removes the answered question and advances to the next pending item', async () => {
    await act(async () => {
      root.render(React.createElement(HookHost, { threadId: 'thread-ask' }));
      await flushPromises();
    });

    await act(async () => {
      await snapshot?.submitAnswer({
        request_id: QUESTION_A.requestId,
        source: QUESTION_A.source,
        answers: buildAnswers(QUESTION_A),
      });
    });

    expect(snapshot?.pendingQuestion?.requestId).toBe('ask-2');
    expect(snapshot?.pendingQuestions.map((item) => item.requestId)).toEqual(['ask-2']);

    act(() => {
      snapshot?.handleQuestionResponse({ requestId: 'ask-2' });
    });

    expect(snapshot?.pendingQuestion).toBeNull();
    expect(snapshot?.pendingQuestions).toEqual([]);
  });
});
