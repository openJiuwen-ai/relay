/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { create } from 'zustand';

export type DownloadStatus = 'idle' | 'downloading' | 'success' | 'error' | 'cancelled' | 'installing';

export interface DownloadProgress {
  status: DownloadStatus;
  progress: number;
  totalBytes: number;
  receivedBytes: number;
  fileName: string;
  filePath: string | null;
  errorMessage: string | null;
  startTime: number | null;
  endTime: number | null;
}

export interface DownloadState {
  taskId: string;
  progress: DownloadProgress;
  isLoading: boolean;
  setTaskId: (taskId: string) => void;
  updateProgress: (progress: DownloadProgress) => void;
  setLoading: (loading: boolean) => void;
  setInstalling: () => void;
  reset: () => void;
}

const initialProgress: DownloadProgress = {
  status: 'idle',
  progress: 0,
  totalBytes: 0,
  receivedBytes: 0,
  fileName: '',
  filePath: null,
  errorMessage: null,
  startTime: null,
  endTime: null,
};

export const useDownloadStore = create<DownloadState>((set) => ({
  taskId: '',
  progress: initialProgress,
  isLoading: false,

  setTaskId: (taskId) => set({ taskId }),

  updateProgress: (progress) => set({ progress, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  setInstalling: () => set({ progress: { ...initialProgress, status: 'installing' } }),

  reset: () =>
    set({
      taskId: '',
      progress: initialProgress,
      isLoading: false,
    }),
}));
