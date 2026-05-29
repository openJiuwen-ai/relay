/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// F102: IKnowledgeResolver — federated search across project + global indices
// Phase B: RRF fusion of project + global stores

import type { EvidenceItem, IEvidenceStore, IKnowledgeResolver, KnowledgeResult, SearchOptions } from './interfaces.js';

interface KnowledgeResolverDeps {
  projectStore: IEvidenceStore;
  globalStore?: IEvidenceStore;
}

export class KnowledgeResolver implements IKnowledgeResolver {
  private readonly projectStore: IEvidenceStore;
  private readonly globalStore: IEvidenceStore | undefined;

  constructor(deps: KnowledgeResolverDeps) {
    this.projectStore = deps.projectStore;
    this.globalStore = deps.globalStore ?? undefined;
  }

  async resolve(query: string, options?: SearchOptions): Promise<KnowledgeResult> {
    const limit = options?.limit ?? 10;
    const sources: KnowledgeResult['sources'] = [];

    // Fan-out: project store (always) + global store (if provided)
    const projectPromise = this.projectStore.search(query, { ...options, limit });
    const globalPromise = this.globalStore
      ? this.globalStore.search(query, { ...options, limit }).catch(() => null)
      : Promise.resolve(null);

    const [projectResults, globalResults] = await Promise.all([projectPromise, globalPromise]);

    sources.push('project');

    if (!globalResults || globalResults.length === 0) {
      // Project-only path (no global store or global returned nothing/errored)
      return {
        results: projectResults.slice(0, limit),
        sources,
        query,
      };
    }

    sources.push('global');

    // RRF fusion: merge + deduplicate + rank
    const fused = rrfFusion(projectResults, globalResults, limit);
    return { results: fused, sources, query };
  }
}

// ── Reciprocal Rank Fusion ──────────────────────────────────────────
// RRF(d) = Σ 1/(k + rank_i(d))  where k=60 (standard constant)

const RRF_K = 60;

function rrfFusion(projectItems: EvidenceItem[], globalItems: EvidenceItem[], limit: number): EvidenceItem[] {
  const scoreMap = new Map<string, { item: EvidenceItem; score: number }>();

  // Score project items (project gets a slight bias via lower ranks)
  for (let i = 0; i < projectItems.length; i++) {
    const item = projectItems[i]!;
    const score = 1 / (RRF_K + i);
    const existing = scoreMap.get(item.anchor);
    if (existing) {
      existing.score += score;
      // Project version wins for item data
    } else {
      scoreMap.set(item.anchor, { item, score });
    }
  }

  // Score global items
  for (let i = 0; i < globalItems.length; i++) {
    const item = globalItems[i]!;
    const score = 1 / (RRF_K + i);
    const existing = scoreMap.get(item.anchor);
    if (existing) {
      existing.score += score;
      // Keep project item data (dedup: project wins)
    } else {
      scoreMap.set(item.anchor, { item, score });
    }
  }

  // Sort by score descending, return top N
  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
