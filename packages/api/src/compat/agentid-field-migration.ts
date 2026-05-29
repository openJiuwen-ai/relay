/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * v0.1.x → v0.2.x field migration: catId → agentId
 * Handles backward-compatible deserialization of Redis hashes and config JSON
 * that were persisted with the old field names.
 *
 * Remove after: 0.3.x (all Redis TTL data naturally expired, all config files re-saved)
 */

const FIELD_MAP: ReadonlyArray<[old: string, current: string]> = [
  ['catId', 'agentId'],
  ['ownerCatId', 'ownerAgentId'],
  ['defaultCatId', 'defaultAgentId'],
];

export function migrateAgentIdFields(data: Record<string, unknown>): void {
  for (const [old, current] of FIELD_MAP) {
    if (old in data && !(current in data)) {
      data[current] = data[old];
      delete data[old];
    }
  }
}
