/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F33 Phase 3: Redis key patterns for session strategy runtime overrides.
 * All keys share the office-claw: prefix set by the Redis client.
 */

export const SessionStrategyKeys = {
  /** Per-variant strategy override: session-strategy:override:{agentId} */
  override: (agentId: string) => `session-strategy:override:${agentId}`,
} as const;
