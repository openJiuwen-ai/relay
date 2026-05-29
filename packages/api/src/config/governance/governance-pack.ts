/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { createHash } from 'node:crypto';

// F142: bumped to 2.0.0 — provider files (CLAUDE.md managed blocks, skills/hooks symlinks) no longer generated
export const GOVERNANCE_PACK_VERSION = '2.0.0';

export function computePackChecksum(): string {
  return createHash('sha256').update(GOVERNANCE_PACK_VERSION).digest('hex').slice(0, 12);
}
