/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCalendarWeek, classifyCronDisplayMode, getNextExecutionAt, getCalendarWeekRange, formatWeekRangeText } from '@/components/schedule/utils';
import type { ScheduleRunItem, ScheduledTaskItem } from '@/components/schedule/types';

function makeTask(overrides: Partial<ScheduledTaskItem>): ScheduledTaskItem {
  return {
    taskId: 'task-1',
    source: 'dynamic',
    taskName: '任务',
    prompt: '描述',
    frequency: '',
    nextExcuteTime: '-',
    effectiveTime: '长期有效',
    status: 'running',
    enabled: true,
    effectiveEnabled: true,
    createTime: '',
    sessionName: '-',
    trigger: { type: 'interval', ms: 60_000 },
    lastRunAt: null,
    lastRunOutcome: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<ScheduleRunItem>): ScheduleRunItem {
  return {
    id: 1,
    taskId: 'task-1',
    subjectKey: 'thread-thread-1',
    threadId: 'thread-1',
    outcome: 'RUN_DELIVERED',
    signalSummary: null,
    durationMs: 100,
    startedAt: '2026-04-20T09:00:00+08:00',
    assignedAgentId: null,
    errorSummary: null,
    task: null,
    ...overrides,
  };
}

describe('scheduled-tasks-calendar-utils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('classifies cron by number of runs per day', () => {
    expect(classifyCronDisplayMode('0 */5 * * * *')).toBe('recurring');
    expect(classifyCronDisplayMode('*/10 0 9 * * *')).toBe('recurring');
    expect(classifyCronDisplayMode('0 0 9 * * *')).toBe('single');
    expect(classifyCronDisplayMode('0 9,18 * * *')).toBe('recurring');
  });

  it('computes next execution timestamp for non-interval ordering', () => {
    const now = new Date('2026-04-27T10:00:00+08:00');
    const nextDaily = getNextExecutionAt({ type: 'cron', expression: '0 45 18 * * *', timezone: 'Asia/Shanghai' }, now);
    const nextOnce = getNextExecutionAt({ type: 'once', fireAt: new Date('2026-04-28T14:20:00+08:00').getTime() }, now);

    expect(nextDaily).not.toBeNull();
    expect(nextOnce).not.toBeNull();
    expect(nextDaily!.getTime()).toBeLessThan(nextOnce!.getTime());
  });

  it('does not render planned cards on past days without run data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [makeTask({ trigger: { type: 'interval', ms: 3_600_000 } })];
    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, []);

    expect(days[0]?.occurrences).toHaveLength(0);
    expect(days[1]?.occurrences).toHaveLength(0);
    expect(days[2]?.occurrences).toHaveLength(1);
    expect(days[2]?.occurrences[0]?.state).toBe('pending');
  });

  it('maps delivered and failed runs on past days from API data', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-23T10:00:00+08:00'));
    const tasks = [makeTask({ trigger: { type: 'interval', ms: 3_600_000 } })];
    const runs = [
      makeRun({
        id: 11,
        startedAt: '2026-04-21T09:10:00+08:00',
        outcome: 'RUN_DELIVERED',
      }),
      makeRun({
        id: 12,
        startedAt: '2026-04-22T09:10:00+08:00',
        outcome: 'RUN_FAILED',
      }),
    ];
    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, runs);

    expect(days[1]?.occurrences[0]?.state).toBe('completed');
    expect(days[2]?.occurrences[0]?.state).toBe('failed');
  });

  it('maps SKIP outcomes to skipped', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [makeTask({ trigger: { type: 'interval', ms: 3_600_000 } })];
    const runs = [
      makeRun({
        id: 21,
        startedAt: '2026-04-21T09:10:00+08:00',
        outcome: 'SKIP_OVERLAP',
      }),
    ];
    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, runs);

    expect(days[1]?.occurrences).toHaveLength(1);
    expect(days[1]?.occurrences[0]?.state).toBe('skipped');
  });

  it('groups recurring runs into one daily card and uses latest run outcome', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [makeTask({ trigger: { type: 'interval', ms: 3_600_000 } })];
    const runs = [
      makeRun({
        id: 31,
        startedAt: '2026-04-20T09:10:00+08:00',
        outcome: 'RUN_DELIVERED',
      }),
      makeRun({
        id: 32,
        startedAt: '2026-04-20T11:10:00+08:00',
        outcome: 'RUN_FAILED',
      }),
    ];
    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, runs);
    const monday = days[0];

    expect(monday?.occurrences).toHaveLength(1);
    expect(monday?.occurrences[0]?.mode).toBe('recurring');
    expect(monday?.occurrences[0]?.state).toBe('failed');
    expect(monday?.occurrences[0]?.runCount).toBe(2);
    expect(monday?.occurrences[0]?.latestRunOutcome).toBe('RUN_FAILED');
  });

  it('keeps today and future planned recurring cards when no run exists yet', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [
      makeTask({
        taskId: 'cron-daily-two',
        trigger: { type: 'cron', expression: '0 9,18 * * *' },
      }),
    ];
    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, []);

    expect(days[0]?.occurrences).toHaveLength(0);
    expect(days[2]?.occurrences[0]?.mode).toBe('recurring');
    expect(days[2]?.occurrences[0]?.state).toBe('pending');
    expect(days[3]?.occurrences[0]?.state).toBe('pending');
  });

  it('uses today once-run failed outcome instead of inferring completed by time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [
      makeTask({
        taskId: 'once-failed',
        trigger: { type: 'once', fireAt: new Date('2026-04-22T09:00:00+08:00').getTime() },
      }),
    ];
    const runs = [
      makeRun({
        id: 51,
        taskId: 'once-failed',
        startedAt: '2026-04-22T09:02:00+08:00',
        outcome: 'RUN_FAILED',
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, runs);
    expect(days[2]?.occurrences).toHaveLength(1);
    expect(days[2]?.occurrences[0]?.state).toBe('failed');
    expect(days[2]?.occurrences[0]?.latestRunOutcome).toBe('RUN_FAILED');
  });

  it('uses today single-cron skip outcome instead of inferring completed by time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [
      makeTask({
        taskId: 'cron-single-skip',
        trigger: { type: 'cron', expression: '0 0 9 * * *' },
      }),
    ];
    const runs = [
      makeRun({
        id: 52,
        taskId: 'cron-single-skip',
        startedAt: '2026-04-22T09:03:00+08:00',
        outcome: 'SKIP_OVERLAP',
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, runs);
    expect(days[2]?.occurrences).toHaveLength(1);
    expect(days[2]?.occurrences[0]?.state).toBe('skipped');
    expect(days[2]?.occurrences[0]?.latestRunOutcome).toBe('SKIP_OVERLAP');
  });

  it('does not render today single-cron occurrence when scheduled time already passed and no run exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [
      makeTask({
        taskId: 'cron-single-today-split',
        trigger: { type: 'cron', expression: '0 0 9 * * *' },
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, []);
    expect(days[2]?.occurrences).toHaveLength(0);
  });

  it('does not render today once occurrence when fire time already passed and no run exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [
      makeTask({
        taskId: 'once-past-no-run',
        trigger: { type: 'once', fireAt: new Date('2026-04-22T09:00:00+08:00').getTime() },
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, []);
    expect(days[2]?.occurrences).toHaveLength(0);
  });

  it('renders today once occurrence from API run even when fire time already passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const tasks = [
      makeTask({
        taskId: 'once-past-completed',
        trigger: { type: 'once', fireAt: new Date('2026-04-22T09:00:00+08:00').getTime() },
      }),
    ];
    const runs = [
      makeRun({
        id: 53,
        taskId: 'once-past-completed',
        startedAt: '2026-04-22T09:02:00+08:00',
        outcome: 'RUN_DELIVERED',
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, runs);
    expect(days[2]?.occurrences).toHaveLength(1);
    expect(days[2]?.occurrences[0]?.state).toBe('completed');
    expect(days[2]?.occurrences[0]?.latestRunOutcome).toBe('RUN_DELIVERED');
  });

  it('keeps today recurring card pending after last slot when no run exists', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T23:30:00+08:00'));
    const tasks = [
      makeTask({
        taskId: 'cron-recurring-past-last-slot',
        trigger: { type: 'cron', expression: '0 0 9,18 * * *' },
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, tasks, []);
    expect(days[2]?.occurrences).toHaveLength(1);
    expect(days[2]?.occurrences[0]?.mode).toBe('recurring');
    expect(days[2]?.occurrences[0]?.state).toBe('pending');
  });

  it('renders run-only historical cards for deleted tasks using snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const runs = [
      makeRun({
        id: 41,
        taskId: 'deleted-task',
        startedAt: '2026-04-21T09:10:00+08:00',
        outcome: 'RUN_DELIVERED',
        task: {
          id: 'deleted-task',
          source: 'dynamic',
          templateId: 'reminder',
          label: '已删除任务',
          category: 'thread',
          description: 'desc',
          enabled: true,
          effectiveEnabled: true,
          trigger: { type: 'interval', ms: 3_600_000 },
          deliveryThreadId: 'thread-1',
          threadTitle: '会话',
        },
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, [], runs);
    expect(days[1]?.occurrences).toHaveLength(1);
    expect(days[1]?.occurrences[0]?.taskName).toBe('已删除任务');
    expect(days[1]?.occurrences[0]?.state).toBe('completed');
  });

  it('groups run-only historical cards for deleted recurring tasks without snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-22T10:00:00+08:00'));
    const runs = [
      makeRun({
        id: 61,
        taskId: 'deleted-recurring-no-snapshot',
        startedAt: '2026-04-21T09:01:00+08:00',
        outcome: 'RUN_DELIVERED',
        task: null,
      }),
      makeRun({
        id: 62,
        taskId: 'deleted-recurring-no-snapshot',
        startedAt: '2026-04-21T09:03:00+08:00',
        outcome: 'RUN_DELIVERED',
        task: null,
      }),
      makeRun({
        id: 63,
        taskId: 'deleted-recurring-no-snapshot',
        startedAt: '2026-04-21T09:05:00+08:00',
        outcome: 'RUN_FAILED',
        task: null,
      }),
    ];

    const days = buildCalendarWeek(new Date('2026-04-20T10:00:00+08:00'), 0, [], runs);
    expect(days[1]?.occurrences).toHaveLength(1);
    expect(days[1]?.occurrences[0]?.taskName).toBe('deleted-recurring-no-snapshot');
    expect(days[1]?.occurrences[0]?.mode).toBe('recurring');
    expect(days[1]?.occurrences[0]?.runCount).toBe(3);
    expect(days[1]?.occurrences[0]?.latestRunOutcome).toBe('RUN_FAILED');
  });
});
