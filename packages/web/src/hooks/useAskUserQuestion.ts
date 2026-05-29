/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AskUserQuestionAnswer, PendingAskUserQuestion } from '@/stores/chat-types';
import { apiFetch } from '@/utils/api-client';

type AskUserQuestionSocketPayload = PendingAskUserQuestion;

export function useAskUserQuestion(threadId: string) {
  const [pendingQuestions, setPendingQuestions] = useState<PendingAskUserQuestion[]>([]);

  const fetchPending = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/ask-user-question/pending?threadId=${encodeURIComponent(threadId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { pending?: PendingAskUserQuestion[] };
      setPendingQuestions(data.pending ?? []);
    } catch {
      // Best-effort.
    }
  }, [threadId]);

  useEffect(() => {
    void fetchPending();
  }, [fetchPending]);

  const submitAnswer = useCallback(
    async (payload: { request_id: string; source?: string; answers: AskUserQuestionAnswer[] }) => {
      const res = await apiFetch('/api/ask-user-question/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: payload.request_id,
          ...(payload.source ? { source: payload.source } : {}),
          answers: payload.answers,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to submit ask_user_question response: ${res.status}`);
      }
      setPendingQuestions((current) => current.filter((item) => item.requestId !== payload.request_id));
    },
    [],
  );

  const handleQuestionRequest = useCallback((payload: AskUserQuestionSocketPayload) => {
    setPendingQuestions((current) => {
      const exists = current.some((item) => item.requestId === payload.requestId);
      if (exists) {
        return current.map((item) => (item.requestId === payload.requestId ? payload : item));
      }
      return [...current, payload];
    });
  }, []);

  const handleQuestionResponse = useCallback((payload: { requestId: string }) => {
    setPendingQuestions((current) => current.filter((item) => item.requestId !== payload.requestId));
  }, []);

  return {
    pendingQuestion: pendingQuestions[0] ?? null,
    pendingQuestions,
    submitAnswer,
    fetchPending,
    handleQuestionRequest,
    handleQuestionResponse,
  };
}
