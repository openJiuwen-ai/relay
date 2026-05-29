/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * InvocationStatus State Machine — F25 explicit transition spec.
 *
 * Previously implicit in CAS guards and route handlers.
 * Now a single source of truth for legal status transitions.
 *
 * ADR-008 D1: InvocationRecord lifecycle.
 */

/**
 * Status type re-declared here to avoid circular dependency with InvocationRecordStore.
 * Structurally identical to InvocationStatus in InvocationRecordStore.ts.
 */
type InvocationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

/**
 * Legal state transitions, derived from production call sites:
 *
 * queued  → running   (normal execution start)
 * queued  → failed    (pre-start failure: e.g. running update throws)
 * queued  → canceled  (delete race: message deleted before agent starts)
 * running → succeeded (normal completion)
 * running → failed    (error / persistence failure)
 * running → canceled  (user cancels during execution)
 * failed  → running   (retry: CAS-protected re-claim)
 * failed  → canceled  (delete race on retry)
 */
const VALID_TRANSITIONS: ReadonlyMap<InvocationStatus, ReadonlySet<InvocationStatus>> = new Map([
  ['queued', new Set<InvocationStatus>(['running', 'failed', 'canceled'])],
  ['running', new Set<InvocationStatus>(['succeeded', 'failed', 'canceled'])],
  ['failed', new Set<InvocationStatus>(['running', 'canceled'])],
  ['succeeded', new Set<InvocationStatus>()],
  ['canceled', new Set<InvocationStatus>()],
]);

/** Terminal states — no outbound transitions allowed. */
export const TERMINAL_STATES: ReadonlySet<InvocationStatus> = new Set(['succeeded', 'canceled']);

/** All valid InvocationStatus values. */
export const ALL_STATUSES: readonly InvocationStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
] as const;

/**
 * Check whether a status transition is legal.
 * Pure function, no side effects.
 */
export function isValidTransition(from: InvocationStatus, to: InvocationStatus): boolean {
  const allowed = VALID_TRANSITIONS.get(from);
  if (!allowed) return false;
  return allowed.has(to);
}

/**
 * Get allowed target states for a given status.
 * Useful for testing and error messages.
 */
export function getAllowedTransitions(from: InvocationStatus): readonly InvocationStatus[] {
  const allowed = VALID_TRANSITIONS.get(from);
  if (!allowed) return [];
  return [...allowed];
}
