/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('reminder template', () => {
  it('persists the same authoritative schedule context that is passed to the cat', async () => {
    const { reminderTemplate } = await import('../dist/infrastructure/scheduler/templates/reminder.js');
    const realNow = Date.now;
    Date.now = () => Date.UTC(2026, 3, 21, 5, 0, 0);

    try {
      const spec = reminderTemplate.createSpec('dyn-drink-water', {
        trigger: { type: 'interval', ms: 15 * 60 * 1000 },
        params: { message: '喝水', targetCatId: 'codex', triggerUserId: 'user-42' },
        deliveryThreadId: 'thread-123',
      });
      const delivered = [];
      const invoked = [];

      await spec.run.execute('喝水', 'thread-thread-123', {
        assignedAgentId: null,
        deliver: async (opts) => {
          delivered.push(opts);
          return 'msg-1';
        },
        invokeTrigger: {
          trigger: (...args) => {
            invoked.push(args);
          },
        },
      });

      assert.equal(delivered.length, 1);
      assert.equal(invoked.length, 1);
      assert.equal(delivered[0].content, invoked[0][3]);
      assert.equal(invoked[0][0], 'thread-123');
      assert.equal(invoked[0][1], 'codex');
      assert.equal(invoked[0][2], 'user-42');
      assert.equal(invoked[0][4], 'msg-1');
      assert.ok(delivered[0].content.includes('[定时任务] 喝水'));
      assert.ok(delivered[0].content.includes('[调度上下文]'));
      assert.ok(delivered[0].content.includes('当前真实时间 ISO：2026-04-21T05:00:00.000Z'));
      assert.ok(delivered[0].content.includes('预计下一次触发时间'));
      assert.match(delivered[0].content, /13:15:00/);
    } finally {
      Date.now = realNow;
    }
  });

  it('labels once reminders as having no next fire time', async () => {
    const { reminderTemplate } = await import('../dist/infrastructure/scheduler/templates/reminder.js');
    const realNow = Date.now;
    Date.now = () => Date.UTC(2026, 3, 21, 5, 0, 0);

    try {
      const spec = reminderTemplate.createSpec('dyn-once', {
        trigger: { type: 'once', fireAt: Date.UTC(2026, 3, 21, 5, 5, 0) },
        params: { message: '站起来活动一下', targetCatId: 'codex', triggerUserId: 'user-42' },
        deliveryThreadId: 'thread-123',
      });
      const delivered = [];

      await spec.run.execute('站起来活动一下', 'thread-thread-123', {
        assignedAgentId: null,
        deliver: async (opts) => {
          delivered.push(opts);
          return 'msg-once';
        },
        invokeTrigger: {
          trigger: () => {},
        },
      });

      assert.equal(delivered.length, 1);
      assert.ok(delivered[0].content.includes('预计下一次触发时间：无（一次性任务）'));
    } finally {
      Date.now = realNow;
    }
  });
});
