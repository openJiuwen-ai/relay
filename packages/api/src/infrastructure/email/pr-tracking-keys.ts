/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for PR tracking storage.
 * All keys share the office-claw: prefix set by the Redis client.
 *
 * Data model:
 *   Hash  pr-tracking:{repo}#{prNumber}  → entry fields
 *   ZSet  pr-tracking:all                → all entries (score=registeredAt)
 */

export const PrTrackingKeys = {
  /** Hash with entry details: pr-tracking:{repo}#{prNumber} */
  detail: (repoFullName: string, prNumber: number) => `pr-tracking:${repoFullName}#${prNumber}`,

  /** Global sorted set for listAll: pr-tracking:all */
  all: () => 'pr-tracking:all',
} as const;
