/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { ALL_MULTI_MENTION_STATUSES, MULTI_MENTION_TERMINAL_STATES, type MultiMentionStatus } from '@openjiuwen/relay-shared';

/**
 * Multi-Mention State Machine (F086 M1)
 *
 * ```
 * pending → {running, failed}
 * running → {partial, done, timeout, failed}
 * partial → {done, timeout}
 * done    → ∅ (terminal)
 * timeout → ∅ (terminal)
 * failed  → ∅ (terminal)
 * ```
 */
const VALID_TRANSITIONS: ReadonlyMap<MultiMentionStatus, ReadonlySet<MultiMentionStatus>> = new Map([
  ['pending', new Set<MultiMentionStatus>(['running', 'failed'])],
  ['running', new Set<MultiMentionStatus>(['partial', 'done', 'timeout', 'failed'])],
  ['partial', new Set<MultiMentionStatus>(['done', 'timeout'])],
  ['done', new Set<MultiMentionStatus>()],
  ['timeout', new Set<MultiMentionStatus>()],
  ['failed', new Set<MultiMentionStatus>()],
]);

export function isValidTransition(from: MultiMentionStatus, to: MultiMentionStatus): boolean {
  return VALID_TRANSITIONS.get(from)?.has(to) ?? false;
}

export function getAllowedTransitions(from: MultiMentionStatus): MultiMentionStatus[] {
  return [...(VALID_TRANSITIONS.get(from) ?? [])];
}

export { ALL_MULTI_MENTION_STATUSES as ALL_STATUSES };
export { MULTI_MENTION_TERMINAL_STATES as TERMINAL_STATES };
