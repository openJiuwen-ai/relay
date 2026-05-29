/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for SessionChainStore.
 * F24: Session Chain + Context Health.
 *
 * Note: office-claw: prefix is auto-added by ioredis keyPrefix.
 * All keys here are bare (without prefix).
 */

export const SessionChainKeys = {
  /** Hash: session record fields */
  detail: (id: string) => `session:${id}`,
  /** Sorted Set: agent+thread session chain (score = seq) */
  chain: (agentId: string, threadId: string) => `session-chain:${agentId}:${threadId}`,
  /** String: agent+thread → active session ID (fast lookup) */
  active: (agentId: string, threadId: string) => `session-active:${agentId}:${threadId}`,
  /** String: CLI session ID → record ID index */
  byCli: (cliSessionId: string) => `session-cli:${cliSessionId}`,
};
