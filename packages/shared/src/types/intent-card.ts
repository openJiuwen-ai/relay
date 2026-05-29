/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F076: Intent Card + Need Audit types
 * 需求翻译官 — Intent Card v2 + Triage + Audit Frame
 */

export type SourceTag = 'Q' | 'O' | 'D' | 'R' | 'A';

export type TriageBucket = 'build_now' | 'clarify_first' | 'validate_first' | 'challenge' | 'later';

export type SizeBand = 'S' | 'M' | 'L' | 'XL';

export type ResolutionPath = 'confirmation' | 'evidence' | 'artifact' | 'prototype' | 'escalation' | null;

export type RiskSignal =
  | 'hollow_verbs'
  | 'missing_actors'
  | 'unknown_data_source'
  | 'missing_success_signal'
  | 'missing_edge_cases'
  | 'hidden_dependencies'
  | 'ai_fake_specificity'
  | 'scope_creep';

export interface TriageResult {
  readonly clarity: 1 | 2 | 3;
  readonly groundedness: 1 | 2 | 3;
  readonly necessity: 1 | 2 | 3;
  readonly coupling: 1 | 2 | 3;
  readonly sizeBand: SizeBand;
  readonly bucket: TriageBucket;
  readonly resolutionPath: ResolutionPath;
}

export interface IntentCard {
  readonly id: string;
  readonly projectId: string;

  // Core slots (6)
  readonly actor: string;
  readonly contextTrigger: string;
  readonly goal: string;
  readonly objectState: string;
  readonly successSignal: string;
  readonly nonGoal: string;

  // Metadata
  readonly sourceTag: SourceTag;
  readonly sourceDetail: string;
  readonly decisionOwner: string;
  readonly confidence: 1 | 2 | 3;
  readonly dependencyTags: readonly string[];
  readonly riskSignals: readonly RiskSignal[];

  // Triage result (null before Stage 2)
  readonly triage: TriageResult | null;

  // Original text from PRD
  readonly originalText: string;

  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateIntentCardInput {
  readonly projectId: string;
  readonly actor: string;
  readonly contextTrigger: string;
  readonly goal: string;
  readonly objectState: string;
  readonly successSignal: string;
  readonly nonGoal: string;
  readonly sourceTag: SourceTag;
  readonly sourceDetail: string;
  readonly decisionOwner: string;
  readonly confidence: 1 | 2 | 3;
  readonly dependencyTags?: readonly string[];
  readonly riskSignals?: readonly RiskSignal[];
  readonly originalText: string;
}

export interface TriageIntentCardInput {
  readonly clarity: 1 | 2 | 3;
  readonly groundedness: 1 | 2 | 3;
  readonly necessity: 1 | 2 | 3;
  readonly coupling: 1 | 2 | 3;
  readonly sizeBand: SizeBand;
}

export interface NeedAuditFrame {
  readonly id: string;
  readonly projectId: string;
  readonly sponsor: string;
  readonly motivation: string;
  readonly successMetric: string;
  readonly constraints: string;
  readonly currentWorkflow: string;
  readonly provenanceMap: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CreateNeedAuditFrameInput {
  readonly sponsor: string;
  readonly motivation: string;
  readonly successMetric: string;
  readonly constraints: string;
  readonly currentWorkflow: string;
  readonly provenanceMap: string;
}

export interface RiskDetectionResult {
  readonly signal: RiskSignal;
  readonly severity: 'critical' | 'high' | 'medium';
  readonly evidence: string;
  readonly autoDetected: boolean;
}
