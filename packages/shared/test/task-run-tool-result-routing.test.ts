/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TASK_RUN_UNGROUPED, TaskRunAccumulator } from '../src/task-run-accumulator.ts';

describe('TaskRunAccumulator tool_result routing', () => {
  it('appends tool_result to the segment that holds the matching tool_use after task complete', () => {
    const acc = new TaskRunAccumulator();
    const taskId = 'task-abc';

    acc.onBoundary({
      type: 'system_info',
      taskPhase: 'start',
      taskContext: { id: taskId, title: 'Plan' },
    });
    acc.appendTool(
      { type: 'tool_use', taskContext: { id: taskId }, toolCallId: 'call_1' },
      {
        id: 'call_1',
        type: 'tool_use',
        label: 'agent → todo_create',
        timestamp: 1,
        toolCallId: 'call_1',
      },
    );
    acc.onBoundary({
      type: 'system_info',
      taskPhase: 'complete',
      taskContext: { id: taskId },
    });

    acc.appendTool(
      { type: 'tool_result', toolCallId: 'call_1' },
      {
        id: 'call_1',
        type: 'tool_result',
        label: 'agent ← todo_create',
        detail: 'Successfully created 3 task(s)',
        timestamp: 2,
        toolCallId: 'call_1',
      },
    );

    const extra = acc.toExtra();
    assert.ok(extra);
    const taskSeg = extra.segments.find((s) => s.taskId === taskId);
    assert.ok(taskSeg);
    assert.equal(taskSeg.toolEvents.filter((e) => e.type === 'tool_result').length, 1);
    assert.equal(taskSeg.toolEvents.find((e) => e.type === 'tool_result')?.detail, 'Successfully created 3 task(s)');

    const ungrouped = extra.segments.find((s) => s.taskId === TASK_RUN_UNGROUPED);
    assert.equal(ungrouped?.toolEvents.filter((e) => e.type === 'tool_result').length ?? 0, 0);
  });
});
