/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type RefluxCategory = 'methodology' | 'risk_pattern' | 'resolution_strategy';

export interface RefluxPattern {
  readonly id: string;
  readonly projectId: string;
  readonly category: RefluxCategory;
  readonly title: string;
  readonly insight: string;
  readonly evidence: string;
  readonly createdAt: number;
}

export interface CreateRefluxPatternInput {
  readonly category: RefluxCategory;
  readonly title: string;
  readonly insight: string;
  readonly evidence: string;
}
