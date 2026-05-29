/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';

export type MessageFeedbackVote = 1 | -1;

export type MessageFeedbackState = {
  vote: MessageFeedbackVote;
  reason: string | null;
  timestamp: number;
};

export function useMessageFeedback(threadId: string) {
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, MessageFeedbackState>>({});

  useEffect(() => {
    let cancelled = false;
    setFeedbackByMessageId({});

    async function loadFeedback() {
      try {
        const response = await apiFetch(`/api/feedback/by-thread/${encodeURIComponent(threadId)}`);
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as Record<string, MessageFeedbackState>;
        if (!cancelled) setFeedbackByMessageId(payload);
      } catch {
        if (!cancelled) setFeedbackByMessageId({});
      }
    }

    void loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const submitFeedback = useCallback(async (messageId: string, vote: MessageFeedbackVote, reason?: string) => {
    const response = await apiFetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId,
        vote,
        ...(reason ? { reason } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`Feedback submit failed: HTTP ${response.status}`);
    }
    const payload = (await response.json()) as MessageFeedbackState;
    setFeedbackByMessageId((current) => ({
      ...current,
      [messageId]: {
        vote: payload.vote,
        reason: payload.reason ?? null,
        timestamp: payload.timestamp ?? Date.now(),
      },
    }));
  }, []);

  return { feedbackByMessageId, submitFeedback };
}
