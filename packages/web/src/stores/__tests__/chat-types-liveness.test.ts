/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { assert, describe, it } from 'vitest';
import type { AgentInvocationInfo, AgentStatusType, LivenessWarningSnapshot } from '../chat-types';

describe('F118 AgentStatusType liveness extension', () => {
  it('accepts alive_but_silent status', () => {
    const s: AgentStatusType = 'alive_but_silent';
    assert.equal(s, 'alive_but_silent');
  });

  it('accepts suspected_stall status', () => {
    const s: AgentStatusType = 'suspected_stall';
    assert.equal(s, 'suspected_stall');
  });

  it('LivenessWarningSnapshot holds probe data', () => {
    const snap: LivenessWarningSnapshot = {
      level: 'alive_but_silent',
      state: 'busy-silent',
      silenceDurationMs: 125000,
      cpuTimeMs: 4200,
      processAlive: true,
      receivedAt: Date.now(),
    };
    assert.equal(snap.level, 'alive_but_silent');
    assert.equal(snap.state, 'busy-silent');
    assert.equal(snap.silenceDurationMs, 125000);
  });

  it('AgentInvocationInfo accepts livenessWarning field', () => {
    const info: AgentInvocationInfo = {
      livenessWarning: {
        level: 'suspected_stall',
        state: 'idle-silent',
        silenceDurationMs: 300000,
        processAlive: true,
        receivedAt: Date.now(),
      },
    };
    assert.equal(info.livenessWarning?.level, 'suspected_stall');
  });
});
