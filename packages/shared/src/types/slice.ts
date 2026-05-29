/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type SliceType = 'learning' | 'value' | 'hardening';
export type SliceStatus = 'planned' | 'in_progress' | 'delivered' | 'validated';

export interface Slice {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly sliceType: SliceType;
  readonly description: string;
  readonly cardIds: readonly string[];
  readonly actor: string;
  readonly workflow: string;
  readonly verifiableOutcome: string;
  readonly order: number;
  readonly status: SliceStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateSliceInput {
  readonly name: string;
  readonly sliceType: SliceType;
  readonly description: string;
  readonly cardIds?: readonly string[];
  readonly actor: string;
  readonly workflow: string;
  readonly verifiableOutcome: string;
}

export interface UpdateSliceInput {
  readonly name?: string;
  readonly description?: string;
  readonly cardIds?: readonly string[];
  readonly actor?: string;
  readonly workflow?: string;
  readonly verifiableOutcome?: string;
  readonly status?: SliceStatus;
}
