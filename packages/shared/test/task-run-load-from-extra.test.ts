/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskRunAccumulator } from '../src/task-run-accumulator.ts';

describe('TaskRunAccumulator.loadFromExtra', () => {
  it('restores segments so subsequent appendTool can route tool_result by toolCallId', () => {
    const acc = new TaskRunAccumulator();
    acc.loadFromExtra({
      v: 1,
      segments: [
        {
          taskId: 'task-1',
          thinking: 'plan',
          toolEvents: [
            { id: 'call_x', type: 'tool_use', label: 'todo_create', timestamp: 1, toolCallId: 'call_x' },
          ],
          text: '',
        },
      ],
    });

    acc.appendTool(
      { type: 'tool_result', toolCallId: 'call_x' },
      {
        id: 'call_x',
        type: 'tool_result',
        label: 'result',
        detail: 'ok',
        timestamp: 2,
        toolCallId: 'call_x',
      },
    );

    const extra = acc.toExtra();
    const seg = extra?.segments.find((s) => s.taskId === 'task-1');
    assert.equal(seg?.toolEvents.length, 2);
    assert.equal(seg?.toolEvents[1]?.detail, 'ok');
  });
});
