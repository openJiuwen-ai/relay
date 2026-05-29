/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { isSameProject } from '../../utils/monorepo-root.js';
import { GovernanceBootstrapService } from './governance-bootstrap.js';
import { GovernanceRegistry } from './governance-registry.js';

export interface PreflightResult {
  ready: boolean;
  reason?: string;
}

export async function checkGovernancePreflight(projectPath: string, officeClawRoot: string): Promise<PreflightResult> {
  if (isSameProject(projectPath, officeClawRoot)) {
    return { ready: true };
  }

  const registry = new GovernanceRegistry(officeClawRoot);
  const entry = await registry.get(projectPath);

  if (!entry) {
    try {
      const service = new GovernanceBootstrapService(officeClawRoot);
      await service.bootstrap(projectPath, { dryRun: false });
    } catch (err) {
      return {
        ready: false,
        reason: `Auto-bootstrap failed for ${projectPath}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { ready: true };
}
