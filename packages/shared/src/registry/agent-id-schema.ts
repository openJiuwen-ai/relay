/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Dynamic agentId Zod schema — defers validation to request time.
 *
 * Cannot use z.enum() because route modules are imported at startup
 * before the registry is populated. z.string().refine() evaluates
 * the predicate lazily at validation time.
 */

import { z } from 'zod';
import { officeClawRegistry } from './AgentRegistry.js';

/**
 * Zod schema for agentId fields in route schemas.
 * Returns z.string() refined against the live registry.
 */
export function agentIdSchema() {
  return z.string().refine(
    (id) => officeClawRegistry.has(id),
    (id) => ({
      message: `Unknown agent ID: "${id}". Valid: ${officeClawRegistry.getAllIds().join(', ')}`,
    }),
  );
}
