/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F076: RefluxPatternStore — in-memory store for methodology experience capture
 */
import type { CreateRefluxPatternInput, RefluxCategory, RefluxPattern } from '@openjiuwen/relay-shared';
import { generateSortableId } from '../agents/services/stores/ports/MessageStore.js';

export class RefluxPatternStore {
  private readonly patterns = new Map<string, RefluxPattern>();

  create(projectId: string, input: CreateRefluxPatternInput): RefluxPattern {
    const now = Date.now();
    const pattern: RefluxPattern = {
      id: `rfx-${generateSortableId(now)}`,
      projectId,
      category: input.category,
      title: input.title,
      insight: input.insight,
      evidence: input.evidence,
      createdAt: now,
    };
    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  listByProject(projectId: string): RefluxPattern[] {
    return [...this.patterns.values()]
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  listByCategory(projectId: string, category: RefluxCategory): RefluxPattern[] {
    return this.listByProject(projectId).filter((p) => p.category === category);
  }

  getById(id: string): RefluxPattern | undefined {
    return this.patterns.get(id);
  }

  delete(id: string): boolean {
    return this.patterns.delete(id);
  }
}
