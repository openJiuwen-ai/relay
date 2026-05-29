/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for Authorization stores (rules, pending, audit).
 * All keys share the office-claw: prefix set by the Redis client.
 */

export const AuthRuleKeys = {
  /** Hash with rule details: auth-rule:{id} */
  detail: (id: string) => `auth-rule:${id}`,
  /** SortedSet of all rule IDs by createdAt: auth-rules:all */
  ALL: 'auth-rules:all',
} as const;

export const PendingReqKeys = {
  /** Hash with pending request details: pending-req:{requestId} */
  detail: (id: string) => `pending-req:${id}`,
  /** SortedSet of all pending request IDs by createdAt: pending-reqs:all */
  ALL: 'pending-reqs:all',
  /** SortedSet of waiting request IDs by createdAt: pending-reqs:waiting */
  WAITING: 'pending-reqs:waiting',
} as const;

export const AuthAuditKeys = {
  /** Hash with audit entry details: auth-audit:{id} */
  detail: (id: string) => `auth-audit:${id}`,
  /** SortedSet of all audit entry IDs by createdAt: auth-audit:all */
  ALL: 'auth-audit:all',
} as const;
