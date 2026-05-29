/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type {
  DispatchExecutionDigest,
  ExternalProject,
  IntentCard,
  NeedAuditFrame,
  RefluxPattern,
  ResolutionItem,
  Slice,
} from '@openjiuwen/relay-shared';
import { create } from 'zustand';

interface ExternalProjectState {
  projects: ExternalProject[];
  activeProjectId: string | null;
  intentCards: IntentCard[];
  auditFrame: NeedAuditFrame | null;
  executionDigests: DispatchExecutionDigest[];
  resolutions: ResolutionItem[];
  slices: Slice[];
  refluxPatterns: RefluxPattern[];
  loading: boolean;
  error: string | null;
  setProjects: (projects: ExternalProject[]) => void;
  setActiveProjectId: (id: string | null) => void;
  setIntentCards: (cards: IntentCard[]) => void;
  setAuditFrame: (frame: NeedAuditFrame | null) => void;
  setExecutionDigests: (digests: DispatchExecutionDigest[]) => void;
  setResolutions: (resolutions: ResolutionItem[]) => void;
  setSlices: (slices: Slice[]) => void;
  setRefluxPatterns: (patterns: RefluxPattern[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useExternalProjectStore = create<ExternalProjectState>((set) => ({
  projects: [],
  activeProjectId: null,
  intentCards: [],
  auditFrame: null,
  executionDigests: [],
  resolutions: [],
  slices: [],
  refluxPatterns: [],
  loading: false,
  error: null,
  setProjects: (projects) => set({ projects }),
  setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
  setIntentCards: (intentCards) => set({ intentCards }),
  setAuditFrame: (auditFrame) => set({ auditFrame }),
  setExecutionDigests: (executionDigests) => set({ executionDigests }),
  setResolutions: (resolutions) => set({ resolutions }),
  setSlices: (slices) => set({ slices }),
  setRefluxPatterns: (refluxPatterns) => set({ refluxPatterns }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
