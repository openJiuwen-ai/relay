/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b P4d: Resolve breedId for a agentName.
 * Tries officeClawRegistry first (dynamic, includes variants), falls back to
 * static OFFICE_CLAW_CONFIGS (always available, no async dependency).
 */
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@openjiuwen/relay-shared';

export function resolveBreedId(agentName: string): string | undefined {
  const entry = officeClawRegistry.tryGet(agentName);
  if (entry?.config.breedId) return entry.config.breedId;
  return OFFICE_CLAW_CONFIGS[agentName]?.breedId;
}
