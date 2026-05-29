/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Explicit per-thread key-value memory store types.
 * Part of F3-lite feature for Phase 4.0.
 */

import type { AgentId } from './ids.js';

/**
 * A single memory entry stored per-thread.
 */
export interface MemoryEntry {
  readonly key: string;
  readonly value: string;
  readonly threadId: string;
  readonly updatedBy: AgentId | 'user';
  readonly updatedAt: number;
}

/**
 * Input for creating/updating a memory entry.
 */
export interface MemoryInput {
  readonly threadId: string;
  readonly key: string;
  readonly value: string;
  readonly updatedBy: AgentId | 'user';
}
