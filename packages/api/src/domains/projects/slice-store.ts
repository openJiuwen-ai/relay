/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F076: SliceStore — in-memory store for Stage 4 slice planning
 */
import type { CreateSliceInput, Slice, SliceType, UpdateSliceInput } from '@openjiuwen/relay-shared';
import { generateSortableId } from '../agents/services/stores/ports/MessageStore.js';

export class SliceStore {
  private readonly slices = new Map<string, Slice>();
  /** Tracks next order value per project */
  private readonly orderCounters = new Map<string, number>();

  create(projectId: string, input: CreateSliceInput): Slice {
    const now = Date.now();
    const nextOrder = this.orderCounters.get(projectId) ?? 0;
    this.orderCounters.set(projectId, nextOrder + 1);

    const slice: Slice = {
      id: `sl-${generateSortableId(now)}`,
      projectId,
      name: input.name,
      sliceType: input.sliceType,
      description: input.description,
      cardIds: input.cardIds ? [...input.cardIds] : [],
      actor: input.actor,
      workflow: input.workflow,
      verifiableOutcome: input.verifiableOutcome,
      order: nextOrder,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    };
    this.slices.set(slice.id, slice);
    return slice;
  }

  listByProject(projectId: string): Slice[] {
    return [...this.slices.values()].filter((s) => s.projectId === projectId).sort((a, b) => a.order - b.order);
  }

  getById(id: string): Slice | undefined {
    return this.slices.get(id);
  }

  update(id: string, patch: UpdateSliceInput): Slice | undefined {
    const existing = this.slices.get(id);
    if (!existing) return undefined;
    const updated: Slice = { ...existing, ...patch, updatedAt: Date.now() };
    this.slices.set(id, updated);
    return updated;
  }

  reorder(id1: string, id2: string): boolean {
    const s1 = this.slices.get(id1);
    const s2 = this.slices.get(id2);
    if (!s1 || !s2) return false;

    const order1 = s1.order;
    const order2 = s2.order;
    this.slices.set(id1, { ...s1, order: order2, updatedAt: Date.now() });
    this.slices.set(id2, { ...s2, order: order1, updatedAt: Date.now() });
    return true;
  }

  delete(id: string): boolean {
    return this.slices.delete(id);
  }

  listByType(projectId: string, sliceType: SliceType): Slice[] {
    return this.listByProject(projectId).filter((s) => s.sliceType === sliceType);
  }
}
