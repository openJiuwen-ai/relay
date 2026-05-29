/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { create } from 'zustand';

type Updater<T> = T | ((prev: T) => T);

function resolveUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (prev: T) => T)(prev) : updater;
}

interface FeedbackPopoverState {
  isFeedbackOpen: boolean;
  isAutoOpenedFeedback: boolean;
  selectedScore: number | null;
  lowScoreSelectedIssues: string[];
  highScoreSelectedIssues: string[];
  lowScoreDetail: string;
  lowScoreOtherIssueDetail: string;
  highScoreOtherIssueDetail: string;
  setFeedbackPopoverState: (next: Pick<FeedbackPopoverState, 'isFeedbackOpen' | 'isAutoOpenedFeedback'>) => void;
  resetFeedbackPopoverState: () => void;
  setSelectedScore: (next: number | null) => void;
  setLowScoreSelectedIssues: (next: Updater<string[]>) => void;
  setHighScoreSelectedIssues: (next: Updater<string[]>) => void;
  setLowScoreDetail: (next: string) => void;
  setLowScoreOtherIssueDetail: (next: string) => void;
  setHighScoreOtherIssueDetail: (next: string) => void;
  resetFeedbackFormState: () => void;
}

export const useFeedbackPopoverStore = create<FeedbackPopoverState>((set) => ({
  isFeedbackOpen: false,
  isAutoOpenedFeedback: false,
  selectedScore: null,
  lowScoreSelectedIssues: [],
  highScoreSelectedIssues: [],
  lowScoreDetail: '',
  lowScoreOtherIssueDetail: '',
  highScoreOtherIssueDetail: '',
  setFeedbackPopoverState: (next) => set(next),
  resetFeedbackPopoverState: () =>
    set({
      isFeedbackOpen: false,
      isAutoOpenedFeedback: false,
    }),
  setSelectedScore: (selectedScore) => set({ selectedScore }),
  setLowScoreSelectedIssues: (next) =>
    set((state) => ({ lowScoreSelectedIssues: resolveUpdater(next, state.lowScoreSelectedIssues) })),
  setHighScoreSelectedIssues: (next) =>
    set((state) => ({ highScoreSelectedIssues: resolveUpdater(next, state.highScoreSelectedIssues) })),
  setLowScoreDetail: (lowScoreDetail) => set({ lowScoreDetail }),
  setLowScoreOtherIssueDetail: (lowScoreOtherIssueDetail) => set({ lowScoreOtherIssueDetail }),
  setHighScoreOtherIssueDetail: (highScoreOtherIssueDetail) => set({ highScoreOtherIssueDetail }),
  resetFeedbackFormState: () =>
    set({
      selectedScore: null,
      lowScoreSelectedIssues: [],
      highScoreSelectedIssues: [],
      lowScoreDetail: '',
      lowScoreOtherIssueDetail: '',
      highScoreOtherIssueDetail: '',
    }),
}));
