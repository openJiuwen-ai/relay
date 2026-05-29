/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentId } from './ids.js';

// ── Multi-Mention Status ─────────────────────────────────────────────
export type MultiMentionStatus = 'pending' | 'running' | 'partial' | 'done' | 'timeout' | 'failed';

export const MULTI_MENTION_TERMINAL_STATES: ReadonlySet<MultiMentionStatus> = new Set(['done', 'timeout', 'failed']);

export const ALL_MULTI_MENTION_STATUSES: readonly MultiMentionStatus[] = [
  'pending',
  'running',
  'partial',
  'done',
  'timeout',
  'failed',
];

// ── Constants ────────────────────────────────────────────────────────
export const MAX_MULTI_MENTION_TARGETS = 3;
export const DEFAULT_TIMEOUT_MINUTES = 8;
export const MIN_TIMEOUT_MINUTES = 3;
export const MAX_TIMEOUT_MINUTES = 20;

// ── Trigger types (M2) ──────────────────────────────────────────────
export type MultiMentionTriggerType = 'high-impact' | 'cross-domain' | 'uncertain' | 'info-gap' | 'recon';

// ── Request ──────────────────────────────────────────────────────────
export interface MultiMentionRequest {
  readonly id: string;
  readonly threadId: string;
  readonly initiator: AgentId;
  readonly callbackTo: AgentId;
  readonly targets: readonly AgentId[];
  readonly question: string;
  readonly context?: string;
  readonly idempotencyKey?: string;
  readonly timeoutMinutes: number;
  status: MultiMentionStatus;
  readonly createdAt: number;
  // Audit envelope
  readonly triggerType?: MultiMentionTriggerType;
  readonly searchEvidenceRefs?: readonly string[];
  readonly overrideReason?: string;
}

// ── Response (per-agent) ───────────────────────────────────────────────
export type MultiMentionResponseStatus = 'received' | 'timeout' | 'failed';

export interface MultiMentionResponse {
  readonly agentId: AgentId;
  readonly content: string;
  readonly timestamp: number;
  readonly status: MultiMentionResponseStatus;
}

// ── Aggregated result ────────────────────────────────────────────────
export interface MultiMentionResult {
  readonly request: MultiMentionRequest;
  readonly responses: readonly MultiMentionResponse[];
}
