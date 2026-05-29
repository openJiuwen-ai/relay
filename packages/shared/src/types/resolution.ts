/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ResolutionPath } from './intent-card.js';

export type ResolutionStatus = 'open' | 'answered' | 'escalated';

export interface ResolutionItem {
  readonly id: string;
  readonly projectId: string;
  readonly cardId: string;
  readonly path: ResolutionPath;
  readonly question: string;
  readonly options: readonly string[];
  readonly recommendation: string;
  readonly status: ResolutionStatus;
  readonly answer: string;
  readonly answeredAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateResolutionInput {
  readonly cardId: string;
  readonly path: ResolutionPath;
  readonly question: string;
  readonly options?: readonly string[];
  readonly recommendation?: string;
}

export interface AnswerResolutionInput {
  readonly answer: string;
}
