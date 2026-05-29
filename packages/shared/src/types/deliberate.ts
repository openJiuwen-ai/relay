/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Deliberate Two-Round Types
 * TypeScript type stubs for future 4-E feature.
 * No runtime code — compile-time verification only.
 */

import type { AgentId } from './ids.js';

/** Phases of a deliberate session */
export type DeliberatePhase = 'r1_parallel' | 'r1_reveal' | 'r2_revise' | 'r2_complete';

/**
 * A deliberate session where multiple cats think independently (R1),
 * then see each other's responses and revise (R2).
 */
export interface DeliberateSession {
  readonly id: string;
  readonly threadId: string;
  readonly participants: readonly AgentId[];
  readonly phase: DeliberatePhase;
  /** R1 responses by agent ID */
  readonly r1Responses: Readonly<Record<string, string>>;
  /** R2 (revised) responses by agent ID */
  readonly r2Responses: Readonly<Record<string, string>>;
  readonly createdAt: number;
}

/**
 * State transitions for deliberate sessions.
 * Models the valid phase transitions.
 */
export type DeliberateTransition =
  | { from: 'r1_parallel'; to: 'r1_reveal'; trigger: 'all_r1_complete' }
  | { from: 'r1_reveal'; to: 'r2_revise'; trigger: 'reveal_broadcast' }
  | { from: 'r2_revise'; to: 'r2_complete'; trigger: 'all_r2_complete' }
  | { from: DeliberatePhase; to: 'r2_complete'; trigger: 'timeout' | 'user_cancel' };

/**
 * Events emitted during deliberate sessions.
 * Can be used with WebSocket broadcast.
 */
export type DeliberateEvent =
  | { type: 'deliberate_start'; sessionId: string; participants: readonly AgentId[] }
  | { type: 'deliberate_r1_complete'; sessionId: string; agentId: AgentId }
  | { type: 'deliberate_reveal'; sessionId: string; responses: Readonly<Record<string, string>> }
  | { type: 'deliberate_r2_complete'; sessionId: string; agentId: AgentId }
  | { type: 'deliberate_done'; sessionId: string };
