/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('transformACPUpdate', () => {
  it('marks agent_thought_chunk updates for append-based thinking merge', async () => {
    const { transformACPUpdate } = await import('../dist/domains/agents/services/agents/providers/acp-event-transform.js');

    const messages = transformACPUpdate(
      {
        sessionUpdate: 'agent_thought_chunk',
        content: { text: 'The user' },
      },
      'acp-cat',
    );

    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'system_info');
    const payload = JSON.parse(messages[0].content);
    assert.equal(payload.type, 'thinking');
    assert.equal(payload.mergeStrategy, 'append');
    assert.equal(payload.text, 'The user');
  });
});
