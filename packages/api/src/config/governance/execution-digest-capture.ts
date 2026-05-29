/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F070 Phase 3a: Capture structured execution digest from dispatch completion.
 *
 * Pure function — no side effects, no store writes.
 * Caller is responsible for persisting via ExecutionDigestStore.
 */
import type { DispatchExecutionDigest, DispatchMissionPack, DoneWhenResult } from '@openjiuwen/relay-shared';

export interface CompletionData {
  readonly summary: string;
  readonly filesChanged: readonly string[];
  readonly blocked: boolean;
  /** True if the invocation stream had errors */
  readonly hadError: boolean;
}

export interface CaptureContext {
  readonly projectPath: string;
  readonly threadId: string;
  readonly agentId: string;
  readonly userId: string;
}

export function captureExecutionDigest(
  missionPack: DispatchMissionPack,
  completion: CompletionData,
  ctx: CaptureContext,
): Omit<DispatchExecutionDigest, 'id'> {
  const status = completion.blocked ? 'blocked' : completion.hadError ? 'partial' : 'completed';

  // Evaluate each doneWhen criterion against the summary (best-effort text match)
  const doneWhenResults: DoneWhenResult[] = missionPack.doneWhen.map((criterion) => {
    // Simple heuristic: if completion was successful and not blocked, mark met.
    // More sophisticated analysis can be layered on top later.
    const met = status === 'completed';
    return {
      criterion,
      met,
      evidence: met
        ? 'Dispatch completed successfully'
        : status === 'blocked'
          ? 'Dispatch was blocked'
          : 'Dispatch completed with errors',
    };
  });

  return {
    userId: ctx.userId,
    projectPath: ctx.projectPath,
    threadId: ctx.threadId,
    agentId: ctx.agentId,
    missionPack,
    completedAt: Date.now(),
    summary: completion.summary || 'No summary available',
    filesChanged: [...completion.filesChanged],
    status,
    doneWhenResults,
    nextSteps: [],
  };
}
