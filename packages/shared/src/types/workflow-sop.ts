/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

// F073 P1: Mission Hub 告示牌 — WorkflowSop types
// 告示牌哲学：存信息，不控制流程。智能体看了自己决定行动。

export type SopStage = 'kickoff' | 'impl' | 'quality_gate' | 'review' | 'merge' | 'completion';

export type CheckStatus = 'attested' | 'verified' | 'unknown';

export interface ResumeCapsule {
  readonly goal: string;
  readonly done: readonly string[];
  readonly currentFocus: string;
}

export interface SopChecks {
  readonly remoteMainSynced: CheckStatus;
  readonly qualityGatePassed: CheckStatus;
  readonly reviewApproved: CheckStatus;
  readonly visionGuardDone: CheckStatus;
}

export interface WorkflowSop {
  readonly featureId: string;
  readonly backlogItemId: string;
  readonly stage: SopStage;
  readonly batonHolder: string;
  readonly nextSkill: string | null;
  readonly resumeCapsule: ResumeCapsule;
  readonly checks: SopChecks;
  readonly version: number;
  readonly updatedAt: number;
  readonly updatedBy: string;
}

export interface UpdateWorkflowSopInput {
  readonly stage?: SopStage;
  readonly batonHolder?: string;
  readonly nextSkill?: string | null;
  readonly resumeCapsule?: Partial<ResumeCapsule>;
  readonly checks?: Partial<SopChecks>;
  readonly expectedVersion?: number;
}
