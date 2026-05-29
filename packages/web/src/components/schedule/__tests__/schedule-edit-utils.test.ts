/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { getScheduleTaskEditability } from '@/components/schedule/utils';
import type { ScheduledTaskItem, ScheduleTrigger } from '@/components/schedule/types';

function makeTask(trigger: ScheduleTrigger): ScheduledTaskItem {
  return {
    taskId: 'task-1',
    source: 'dynamic',
    taskName: '测试任务',
    prompt: '测试提示词',
    frequency: '每天',
    nextExcuteTime: '-',
    effectiveTime: '长期有效',
    status: 'running',
    enabled: true,
    effectiveEnabled: true,
    createTime: '',
    sessionName: 'session',
    trigger,
    lastRunAt: null,
    lastRunOutcome: null,
  };
}

describe('scheduled-task-edit-utils', () => {
  it('maps simple daily cron to editable draft', () => {
    const task = makeTask({ type: 'cron', expression: '45 18 * * *', timezone: 'Asia/Shanghai' });
    const result = getScheduleTaskEditability(task, 'Asia/Shanghai');
    expect(result.editable).toBe(true);
    if (result.editable) {
      expect(result.draft.frequency).toEqual({ type: 'daily', time: '18:45:00' });
    }
  });

  it('maps weekday cron to editable draft', () => {
    const task = makeTask({ type: 'cron', expression: '30 9 * * 1,3,5', timezone: 'Asia/Shanghai' });
    const result = getScheduleTaskEditability(task, 'Asia/Shanghai');
    expect(result.editable).toBe(true);
    if (result.editable) {
      expect(result.draft.frequency).toEqual({ type: 'weekday', time: '09:30:00', weekdays: ['1', '3', '5'] });
    }
  });

  it('maps second, minute, and hour intervals into editable drafts', () => {
    const secondResult = getScheduleTaskEditability(makeTask({ type: 'interval', ms: 10_000 }), 'Asia/Shanghai');
    const minuteResult = getScheduleTaskEditability(makeTask({ type: 'interval', ms: 60_000 }), 'Asia/Shanghai');
    const hourResult = getScheduleTaskEditability(makeTask({ type: 'interval', ms: 3_600_000 }), 'Asia/Shanghai');

    expect(secondResult).toMatchObject({
      editable: true,
      draft: { frequency: { type: 'interval', interval: 10, unit: 'second' } },
    });
    expect(minuteResult).toMatchObject({
      editable: true,
      draft: { frequency: { type: 'interval', interval: 1, unit: 'minute' } },
    });
    expect(hourResult).toMatchObject({
      editable: true,
      draft: { frequency: { type: 'interval', interval: 1, unit: 'hour' } },
    });
  });

  it('rejects complex step cron that editor cannot represent', () => {
    const task = makeTask({ type: 'cron', expression: '*/2 * * * *', timezone: 'Asia/Shanghai' });
    expect(getScheduleTaskEditability(task, 'Asia/Shanghai')).toMatchObject({ editable: false });
  });

  it('rejects cron with timezone different from local', () => {
    const task = makeTask({ type: 'cron', expression: '0 9 * * *', timezone: 'UTC' });
    expect(getScheduleTaskEditability(task, 'Asia/Shanghai')).toMatchObject({ editable: false });
  });

  it('rejects non-zero-second cron and unrepresentable intervals', () => {
    const secondCronTask = makeTask({ type: 'cron', expression: '15 0 9 * * *', timezone: 'Asia/Shanghai' });
    const oddIntervalTask = makeTask({ type: 'interval', ms: 10_500 });

    expect(getScheduleTaskEditability(secondCronTask, 'Asia/Shanghai')).toMatchObject({ editable: false });
    expect(getScheduleTaskEditability(oddIntervalTask, 'Asia/Shanghai')).toMatchObject({ editable: false });
  });
});
