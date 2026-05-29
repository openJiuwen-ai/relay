/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskRunnerV2 } from '../dist/infrastructure/scheduler/TaskRunnerV2.js';

function createRunner() {
  const ledger = {
    query: () => [],
    stats: () => ({ total: 0, delivered: 0, failed: 0, skipped: 0 }),
    record: () => {},
  };
  return new TaskRunnerV2({
    logger: { info: () => {}, error: () => {} },
    ledger,
  });
}

function createDynamicTask(taskId, onExecute) {
  return {
    id: taskId,
    profile: 'awareness',
    trigger: { type: 'interval', ms: 60_000 },
    admission: {
      async gate() {
        return { run: true, workItems: [{ signal: 'ping', subjectKey: 'thread-test-thread' }] };
      },
    },
    run: {
      overlap: 'skip',
      timeoutMs: 1000,
      async execute() {
        onExecute();
      },
    },
    state: { runLedger: 'sqlite' },
    outcome: { whenNoSignal: 'drop' },
    enabled: () => true,
  };
}

describe('TaskRunnerV2 dynamic enable/disable', () => {
  it('keeps disabled dynamic task in summaries', () => {
    const runner = createRunner();
    runner.registerDynamic(createDynamicTask('dyn-keep-visible', () => {}), 'dyn-keep-visible', true);

    assert.equal(runner.getTaskSummaries().length, 1);
    assert.equal(runner.getTaskSummaries()[0].enabled, true);

    const updated = runner.setDynamicEnabled('dyn-keep-visible', false);
    assert.equal(updated, true);

    const summaries = runner.getTaskSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].id, 'dyn-keep-visible');
    assert.equal(summaries[0].enabled, false);
  });

  it('skips execution while disabled and resumes after re-enable', async () => {
    const runner = createRunner();
    let executeCount = 0;
    runner.registerDynamic(
      createDynamicTask('dyn-toggle-execution', () => {
        executeCount += 1;
      }),
      'dyn-toggle-execution',
      true,
    );

    runner.setDynamicEnabled('dyn-toggle-execution', false);
    await runner.triggerNow('dyn-toggle-execution');
    assert.equal(executeCount, 0);

    runner.setDynamicEnabled('dyn-toggle-execution', true);
    await runner.triggerNow('dyn-toggle-execution');
    assert.equal(executeCount, 1);
  });
});

