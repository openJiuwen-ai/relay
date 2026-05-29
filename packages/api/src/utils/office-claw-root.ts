/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { resolve } from 'node:path';
import { resolveActiveProjectRoot } from './active-project-root.js';

export function resolveOfficeClawHostRoot(start = process.cwd()): string {
  const configured = process.env.OFFICE_CLAW_CONFIG_ROOT?.trim();
  if (configured) {
    return resolve(configured);
  }
  return resolveActiveProjectRoot(start);
}
