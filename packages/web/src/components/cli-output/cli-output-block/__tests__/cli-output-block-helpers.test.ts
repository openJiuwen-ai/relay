/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import type { CliEvent } from '@/stores/chat-types';
import { toolRowOutcomeFlags } from '../cli-output-block-helpers';

const toolUse = (id: string): CliEvent => ({ id, kind: 'tool_use', timestamp: 1, label: 'x' });

describe('toolRowOutcomeFlags', () => {
  it('does not show loading for last tool in block when result exists (streaming)', () => {
    const event = toolUse('u1');
    const flags = toolRowOutcomeFlags('streaming', event, 'ok', true);
    expect(flags.showLoading).toBe(false);
    expect(flags.showCheck).toBe(true);
    expect(flags.showStopped).toBe(false);
  });

  it('shows loading when streaming and no result yet', () => {
    const event = toolUse('u2');
    const flags = toolRowOutcomeFlags('streaming', event, undefined, false);
    expect(flags.showLoading).toBe(true);
    expect(flags.showStopped).toBe(false);
  });

  it('shows stopped when interrupted and no tool result', () => {
    const event = toolUse('u3');
    const flags = toolRowOutcomeFlags('interrupted', event, undefined, false);
    expect(flags.showStopped).toBe(true);
    expect(flags.showLoading).toBe(false);
    expect(flags.showCheck).toBe(false);
  });
});
