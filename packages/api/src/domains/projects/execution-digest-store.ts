/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F070 Phase 3: ExecutionDigestStore — in-memory store for dispatch execution digests
 */
import type { DispatchExecutionDigest } from '@openjiuwen/relay-shared';
import { generateSortableId } from '../agents/services/stores/ports/MessageStore.js';

export type CreateDigestInput = Omit<DispatchExecutionDigest, 'id'>;

export class ExecutionDigestStore {
  private readonly digests = new Map<string, DispatchExecutionDigest>();

  create(input: CreateDigestInput): DispatchExecutionDigest {
    const digest: DispatchExecutionDigest = {
      ...input,
      id: `ed-${generateSortableId(input.completedAt)}`,
    };
    this.digests.set(digest.id, digest);
    return digest;
  }

  getById(id: string): DispatchExecutionDigest | undefined {
    return this.digests.get(id);
  }

  listByProject(projectPath: string, userId: string): DispatchExecutionDigest[] {
    return [...this.digests.values()]
      .filter((d) => d.projectPath === projectPath && d.userId === userId)
      .sort((a, b) => b.completedAt - a.completedAt);
  }

  listByThread(threadId: string, userId: string): DispatchExecutionDigest[] {
    return [...this.digests.values()]
      .filter((d) => d.threadId === threadId && d.userId === userId)
      .sort((a, b) => b.completedAt - a.completedAt);
  }

  listAll(userId: string): DispatchExecutionDigest[] {
    return [...this.digests.values()].filter((d) => d.userId === userId).sort((a, b) => b.completedAt - a.completedAt);
  }
}
