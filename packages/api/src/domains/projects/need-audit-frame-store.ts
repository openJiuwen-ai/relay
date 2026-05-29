/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F076: NeedAuditFrameStore — in-memory store, one frame per project
 */
import type { CreateNeedAuditFrameInput, NeedAuditFrame } from '@openjiuwen/relay-shared';
import { generateSortableId } from '../agents/services/stores/ports/MessageStore.js';

export class NeedAuditFrameStore {
  private readonly frames = new Map<string, NeedAuditFrame>();

  upsert(projectId: string, input: CreateNeedAuditFrameInput): NeedAuditFrame {
    if (!input.sponsor) {
      throw new Error('sponsor is required');
    }
    if (!input.successMetric) {
      throw new Error('successMetric is required');
    }

    const existing = this.getByProject(projectId);
    const now = Date.now();

    if (existing) {
      const updated: NeedAuditFrame = {
        ...existing,
        ...input,
        updatedAt: now,
      };
      this.frames.set(projectId, updated);
      return updated;
    }

    const frame: NeedAuditFrame = {
      id: `frame-${generateSortableId(now)}`,
      projectId,
      sponsor: input.sponsor,
      motivation: input.motivation,
      successMetric: input.successMetric,
      constraints: input.constraints,
      currentWorkflow: input.currentWorkflow,
      provenanceMap: input.provenanceMap,
      createdAt: now,
      updatedAt: now,
    };
    this.frames.set(projectId, frame);
    return frame;
  }

  getByProject(projectId: string): NeedAuditFrame | null {
    return this.frames.get(projectId) ?? null;
  }
}
