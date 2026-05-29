/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { MemoryEntry, MemoryInput } from '@openjiuwen/relay-shared';

export type { MemoryEntry, MemoryInput };

export const MAX_KEYS_PER_THREAD = 50;

export interface IMemoryStore {
  set(input: MemoryInput): MemoryEntry | Promise<MemoryEntry>;
  get(threadId: string, key: string): MemoryEntry | null | Promise<MemoryEntry | null>;
  list(threadId: string): MemoryEntry[] | Promise<MemoryEntry[]>;
  delete(threadId: string, key: string): boolean | Promise<boolean>;
  deleteThread(threadId: string): number | Promise<number>;
}
