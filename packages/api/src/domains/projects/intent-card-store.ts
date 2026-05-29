/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F076: IntentCardStore — in-memory store for Intent Cards + triage logic
 */
import type {
  CreateIntentCardInput,
  IntentCard,
  ResolutionPath,
  SourceTag,
  TriageBucket,
  TriageIntentCardInput,
  TriageResult,
} from '@openjiuwen/relay-shared';
import { generateSortableId } from '../agents/services/stores/ports/MessageStore.js';

export function computeBucket(
  scores: TriageIntentCardInput,
  sourceTag: SourceTag,
): { bucket: TriageBucket; resolutionPath: ResolutionPath } {
  // Hard gate: A-tagged cards cannot enter build_now
  if (sourceTag === 'A') {
    return { bucket: 'validate_first', resolutionPath: 'evidence' };
  }

  const { clarity, groundedness, necessity, coupling, sizeBand } = scores;

  if (clarity >= 2 && groundedness >= 2 && necessity >= 2 && coupling <= 2 && (sizeBand === 'S' || sizeBand === 'M')) {
    return { bucket: 'build_now', resolutionPath: null };
  }

  if (necessity >= 2 && clarity < 2) {
    return { bucket: 'clarify_first', resolutionPath: 'confirmation' };
  }

  if (clarity >= 2 && groundedness < 2) {
    return { bucket: 'validate_first', resolutionPath: 'evidence' };
  }

  if (clarity >= 2 && groundedness >= 2 && necessity < 2) {
    return { bucket: 'challenge', resolutionPath: 'escalation' };
  }

  return { bucket: 'later', resolutionPath: null };
}

export class IntentCardStore {
  private readonly cards = new Map<string, IntentCard>();

  create(input: CreateIntentCardInput): IntentCard {
    const now = Date.now();
    const card: IntentCard = {
      id: `ic-${generateSortableId(now)}`,
      projectId: input.projectId,
      actor: input.actor,
      contextTrigger: input.contextTrigger,
      goal: input.goal,
      objectState: input.objectState,
      successSignal: input.successSignal,
      nonGoal: input.nonGoal,
      sourceTag: input.sourceTag,
      sourceDetail: input.sourceDetail,
      decisionOwner: input.decisionOwner,
      confidence: input.confidence,
      dependencyTags: input.dependencyTags ? [...input.dependencyTags] : [],
      riskSignals: input.riskSignals ? [...input.riskSignals] : [],
      triage: null,
      originalText: input.originalText,
      createdAt: now,
      updatedAt: now,
    };
    this.cards.set(card.id, card);
    return card;
  }

  listByProject(projectId: string, bucket?: TriageBucket): IntentCard[] {
    return [...this.cards.values()]
      .filter((c) => c.projectId === projectId)
      .filter((c) => (bucket ? c.triage?.bucket === bucket : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  getById(id: string): IntentCard | null {
    return this.cards.get(id) ?? null;
  }

  update(
    id: string,
    patch: Partial<
      Pick<
        IntentCard,
        | 'actor'
        | 'contextTrigger'
        | 'goal'
        | 'objectState'
        | 'successSignal'
        | 'nonGoal'
        | 'sourceTag'
        | 'sourceDetail'
        | 'decisionOwner'
        | 'confidence'
        | 'dependencyTags'
        | 'riskSignals'
        | 'originalText'
      >
    >,
  ): IntentCard | null {
    const existing = this.cards.get(id);
    if (!existing) return null;
    const updated: IntentCard = { ...existing, ...patch, updatedAt: Date.now() };
    this.cards.set(id, updated);
    return updated;
  }

  triage(id: string, scores: TriageIntentCardInput): IntentCard | null {
    const existing = this.cards.get(id);
    if (!existing) return null;

    const { bucket, resolutionPath } = computeBucket(scores, existing.sourceTag);
    const triage: TriageResult = {
      clarity: scores.clarity,
      groundedness: scores.groundedness,
      necessity: scores.necessity,
      coupling: scores.coupling,
      sizeBand: scores.sizeBand,
      bucket,
      resolutionPath,
    };

    const updated: IntentCard = { ...existing, triage, updatedAt: Date.now() };
    this.cards.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.cards.delete(id);
  }
}
