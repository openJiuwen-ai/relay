/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { UpdateWorkflowSopInput, WorkflowSop } from '@openjiuwen/relay-shared';

// Canonical types live in @openjiuwen/relay-api-server-contracts/storage.
// Re-exported here for backwards compatibility with existing consumers.
export type { IWorkflowSopStore } from '@openjiuwen/relay-api-server-contracts/storage';
export { VersionConflictError } from '@openjiuwen/relay-api-server-contracts/storage';

import type { IWorkflowSopStore } from '@openjiuwen/relay-api-server-contracts/storage';
import { VersionConflictError } from '@openjiuwen/relay-api-server-contracts/storage';

export class WorkflowSopStore implements IWorkflowSopStore {
  private data = new Map<string, WorkflowSop>();

  async get(backlogItemId: string): Promise<WorkflowSop | null> {
    return this.data.get(backlogItemId) ?? null;
  }

  async upsert(
    backlogItemId: string,
    featureId: string,
    input: UpdateWorkflowSopInput,
    updatedBy: string,
  ): Promise<WorkflowSop> {
    const existing = this.data.get(backlogItemId);

    if (input.expectedVersion !== undefined && existing && existing.version !== input.expectedVersion) {
      throw new VersionConflictError(existing);
    }

    const defaultChecks = {
      remoteMainSynced: 'unknown',
      qualityGatePassed: 'unknown',
      reviewApproved: 'unknown',
      visionGuardDone: 'unknown',
    } as const;
    const defaultCapsule = { goal: '', done: [], currentFocus: '' };
    const sop: WorkflowSop = {
      backlogItemId,
      featureId,
      stage: input.stage ?? existing?.stage ?? 'kickoff',
      batonHolder: input.batonHolder ?? existing?.batonHolder ?? updatedBy,
      nextSkill: input.nextSkill !== undefined ? input.nextSkill : (existing?.nextSkill ?? null),
      resumeCapsule: { ...(existing?.resumeCapsule ?? defaultCapsule), ...input.resumeCapsule },
      checks: { ...(existing?.checks ?? defaultChecks), ...input.checks },
      version: (existing?.version ?? 0) + 1,
      updatedAt: Date.now(),
      updatedBy,
    };
    this.data.set(backlogItemId, sop);
    return sop;
  }

  async delete(backlogItemId: string): Promise<boolean> {
    return this.data.delete(backlogItemId);
  }
}
