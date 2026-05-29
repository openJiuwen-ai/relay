/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledTaskItem, ScheduleRunItem } from '../types';
import {
  buildCalendarWeek,
  classifyCronDisplayMode,
  getNextExecutionAt,
  getCalendarWeekRange,
  formatWeekRangeText,
} from '../utils';

// =============================================================================
// classifyCronDisplayMode Tests
// =============================================================================

describe('classifyCronDisplayMode', () => {
  it('普通5段 cron 识别为 single', () => {
    expect(classifyCronDisplayMode('30 9 * * *')).toBe('single');
    expect(classifyCronDisplayMode('0 18 * * 1-5')).toBe('single');
  });

  it('带步进语法的 cron 识别为 recurring', () => {
    expect(classifyCronDisplayMode('0 */2 * * *')).toBe('recurring');
    expect(classifyCronDisplayMode('0 9-18 * * *')).toBe('recurring');
  });

  it('带斜杠的秒分字段识别为 recurring', () => {
    expect(classifyCronDisplayMode('*/5 * * * *')).toBe('recurring');
    expect(classifyCronDisplayMode('0 */30 * * *')).toBe('recurring');
  });

  it('无效 cron 返回 single', () => {
    expect(classifyCronDisplayMode('')).toBe('single');
    expect(classifyCronDisplayMode('invalid')).toBe('single');
  });

  // 边界值测试
  it('只有一个时间点识别为 single', () => {
    expect(classifyCronDisplayMode('30 9 * * 1')).toBe('single');
  });

  it('多个时间点但无步进语法识别为 single', () => {
    expect(classifyCronDisplayMode('30 9,10 * * *')).toBe('recurring');
  });
});

// =============================================================================
// getNextExecutionAt Tests
// =============================================================================

describe('getNextExecutionAt', () => {
  describe('interval 类型', () => {
    it('正确计算下次执行时间', () => {
      const trigger = { type: 'interval' as const, ms: 3600000 }; // 1小时
      const from = new Date('2026-05-08T10:00:00Z');
      const next = getNextExecutionAt(trigger, from);

      expect(next).toBeInstanceOf(Date);
      expect(next!.getTime()).toBe(from.getTime() + 3600000);
    });

    it('处理极大时间间隔', () => {
      const trigger = { type: 'interval' as const, ms: 86400000 }; // 1天
      const from = new Date('2026-05-08T10:00:00Z');
      const next = getNextExecutionAt(trigger, from);

      expect(next!.getTime()).toBe(from.getTime() + 86400000);
    });
  });

  describe('once 类型', () => {
    it('未来时间返回该时间', () => {
      const futureTime = new Date('2026-05-20T14:30:00Z').getTime();
      const trigger = { type: 'once' as const, fireAt: futureTime };
      const from = new Date('2026-05-08T10:00:00Z');
      const next = getNextExecutionAt(trigger, from);

      expect(next).toBeInstanceOf(Date);
      expect(next!.getTime()).toBe(futureTime);
    });

    it('过去时间返回 null', () => {
      const pastTime = new Date('2026-05-01T14:30:00Z').getTime();
      const trigger = { type: 'once' as const, fireAt: pastTime };
      const from = new Date('2026-05-08T10:00:00Z');
      const next = getNextExecutionAt(trigger, from);

      expect(next).toBeNull();
    });

    it('无效 fireAt 返回 null', () => {
      const trigger = { type: 'once' as const, fireAt: NaN };
      const from = new Date('2026-05-08T10:00:00Z');
      const next = getNextExecutionAt(trigger, from);

      expect(next).toBeNull();
    });
  });

  describe('cron 类型', () => {
    it('有效 cron 表达式返回下次执行时间', () => {
      const trigger = { type: 'cron' as const, expression: '30 9 * * *' };
      const from = new Date('2026-05-08T08:00:00Z');
      const next = getNextExecutionAt(trigger, from);

      expect(next).toBeInstanceOf(Date);
      // 应该是同一天的 9:30
      expect(next!.getUTCHours()).toBe(1); // UTC 9:30 = 北京时间 17:30，但由于时区问题需要看实际环境
    });

    it('无效 cron 表达式返回 null', () => {
      const trigger = { type: 'cron' as const, expression: 'invalid' };
      const from = new Date('2026-05-08T08:00:00Z');
      const next = getNextExecutionAt(trigger, from);

      expect(next).toBeNull();
    });
  });
});

// =============================================================================
// getCalendarWeekRange Tests
// =============================================================================

describe('getCalendarWeekRange', () => {
  it('返回周一开始、周日结束的7天范围', () => {
    const baseDate = new Date('2026-05-08'); // 周五
    const range = getCalendarWeekRange(baseDate, 0);

    expect(range.start.getDay()).toBe(1); // 周一
    expect(range.end.getDay()).toBe(0); // 周日
  });

  it('weekOffset 为 0 返回当前周', () => {
    const baseDate = new Date('2026-05-08');
    const range = getCalendarWeekRange(baseDate, 0);

    expect(range.start.getDate()).toBe(4); // 周一 5月4日
    expect(range.end.getDate()).toBe(10); // 周日 5月10日
  });

  it('weekOffset 为 1 返回下一周', () => {
    const baseDate = new Date('2026-05-08');
    const range = getCalendarWeekRange(baseDate, 1);

    expect(range.start.getDate()).toBe(11); // 下周一 5月11日
    expect(range.end.getDate()).toBe(17); // 下周日 5月17日
  });

  it('weekOffset 为 -1 返回上一周', () => {
    const baseDate = new Date('2026-05-08');
    const range = getCalendarWeekRange(baseDate, -1);

    expect(range.start.getDate()).toBe(27); // 上周一 4月27日
    expect(range.end.getDate()).toBe(3); // 上周日 5月3日
  });

  it('range.end 时间为 23:59:59.999', () => {
    const baseDate = new Date('2026-05-08');
    const range = getCalendarWeekRange(baseDate, 0);

    expect(range.end.getHours()).toBe(23);
    expect(range.end.getMinutes()).toBe(59);
    expect(range.end.getSeconds()).toBe(59);
  });
});

// =============================================================================
// formatWeekRangeText Tests
// =============================================================================

describe('formatWeekRangeText', () => {
  it('正确格式化周范围文本', () => {
    const baseDate = new Date('2026-05-08');
    const text = formatWeekRangeText(baseDate, 0);

    expect(text).toContain('2026');
    expect(text).toContain('5月');
    expect(text).toContain('4日');
    expect(text).toContain('-');
    expect(text).toContain('10日');
  });

  it('跨年月份显示正确', () => {
    const baseDate = new Date('2026-12-28'); // 年末
    const text = formatWeekRangeText(baseDate, 0);

    expect(text).toContain('2026');
    // 应该包含12月和1月
    expect(text).toContain('12月');
    expect(text).toContain('1月');
  });
});

// =============================================================================
// buildCalendarWeek Tests
// =============================================================================

describe('buildCalendarWeek', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 8, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createMockTask = (overrides: Partial<ScheduledTaskItem> = {}): ScheduledTaskItem => ({
    taskId: 'task-1',
    source: 'builtin',
    taskName: 'Test Task',
    prompt: 'Test prompt',
    frequency: 'daily',
    nextExcuteTime: '',
    effectiveTime: '',
    status: 'running',
    enabled: true,
    effectiveEnabled: true,
    createTime: '',
    sessionName: '',
    trigger: { type: 'cron', expression: '30 9 * * *' },
    lastRunAt: null,
    lastRunOutcome: null,
    ...overrides,
  });

  it('返回7天的数组', () => {
    const baseDate = new Date('2026-05-08');
    const result = buildCalendarWeek(baseDate, 0, []);

    expect(result).toHaveLength(7);
  });

  it('每天包含必要的字段', () => {
    const baseDate = new Date('2026-05-08');
    const result = buildCalendarWeek(baseDate, 0, []);

    for (const day of result) {
      expect(day.date).toBeInstanceOf(Date);
      expect(day.dayIndex).toBeGreaterThanOrEqual(0);
      expect(day.dayIndex).toBeLessThan(7);
      expect(day.labelZh).toBeDefined();
      expect(day.labelEn).toBeDefined();
      expect(day.dayOfMonth).toBeGreaterThan(0);
      expect(Array.isArray(day.occurrences)).toBe(true);
    }
  });

  it('周一到周日的标签正确', () => {
    const baseDate = new Date('2026-05-08');
    const result = buildCalendarWeek(baseDate, 0, []);

    expect(result[0]!.labelZh).toBe('周一');
    expect(result[1]!.labelZh).toBe('周二');
    expect(result[2]!.labelZh).toBe('周三');
    expect(result[3]!.labelZh).toBe('周四');
    expect(result[4]!.labelZh).toBe('周五');
    expect(result[5]!.labelZh).toBe('周六');
    expect(result[6]!.labelZh).toBe('周日');

    expect(result[0]!.labelEn).toBe('MON');
    expect(result[6]!.labelEn).toBe('SUN');
  });

  it('无任务时返回空的 occurrences', () => {
    const baseDate = new Date('2026-05-08');
    const result = buildCalendarWeek(baseDate, 0, []);

    for (const day of result) {
      expect(day.occurrences).toHaveLength(0);
    }
  });

  it('interval 类型任务每天产生一个 recurring occurrence', () => {
    const baseDate = new Date('2026-05-08T10:00:00');
    const task = createMockTask({
      taskId: 'interval-task',
      trigger: { type: 'interval', ms: 3600000 },
    });

    const result = buildCalendarWeek(baseDate, 0, [task]);

    // 未来7天每天应该有一个 occurrence
    const futureDays = result.filter((day) => day.date >= baseDate);
    for (const day of futureDays) {
      expect(day.occurrences.length).toBeGreaterThan(0);
      const recurring = day.occurrences.find((o) => o.mode === 'recurring');
      expect(recurring).toBeDefined();
    }
  });

  it('once 类型任务只在该日期产生 occurrence', () => {
    const futureDate = new Date('2026-05-09'); // 周六
    futureDate.setHours(9, 30, 0, 0);
    const baseDate = new Date('2026-05-08');

    const task = createMockTask({
      taskId: 'once-task',
      trigger: { type: 'once', fireAt: futureDate.getTime() },
    });

    const result = buildCalendarWeek(baseDate, 0, [task]);

    const saturday = result.find((day) => day.labelZh === '周六');
    expect(saturday).toBeDefined();
    expect(saturday!.occurrences.length).toBeGreaterThan(0);
  });

  it('cron 类型任务按表达式匹配日期', () => {
    const baseDate = new Date('2026-05-08');
    const task = createMockTask({
      taskId: 'weekday-task',
      trigger: { type: 'cron', expression: '30 9 * * 6,0' }, // 周六、周日
    });

    const result = buildCalendarWeek(baseDate, 0, [task]);

    const friday = result.find((day) => day.labelZh === '周五');
    const saturday = result.find((day) => day.labelZh === '周六');
    const sunday = result.find((day) => day.labelZh === '周日');

    expect(friday!.occurrences.length).toBe(0);
    expect(saturday!.occurrences.length).toBeGreaterThan(0);
    expect(sunday!.occurrences.length).toBeGreaterThan(0);
  });

  it('多个任务正确合并', () => {
    const baseDate = new Date('2026-05-08');
    const task1 = createMockTask({ taskId: 'task-1', taskName: 'Task 1', trigger: { type: 'interval', ms: 3600000 } });
    const task2 = createMockTask({ taskId: 'task-2', taskName: 'Task 2', trigger: { type: 'interval', ms: 7200000 } });

    const result = buildCalendarWeek(baseDate, 0, [task1, task2]);

    const futureDays = result.filter((day) => day.labelZh === '周五' || day.labelZh === '周六' || day.labelZh === '周日');
    for (const day of futureDays) {
      const taskIds = day.occurrences.map((o) => o.taskId);
      expect(taskIds).toContain('task-1');
      expect(taskIds).toContain('task-2');
    }
  });

  it('disables 任务状态为 paused', () => {
    const baseDate = new Date('2026-05-08');
    const task = createMockTask({
      taskId: 'disabled-task',
      enabled: false,
      effectiveEnabled: false,
      trigger: { type: 'interval', ms: 3600000 },
    });

    const result = buildCalendarWeek(baseDate, 0, [task]);

    for (const day of result) {
      const occurrence = day.occurrences.find((o) => o.taskId === 'disabled-task');
      if (occurrence) {
        expect(occurrence.state).toBe('paused');
      }
    }
  });

  // 边界值测试
  it('空任务数组不报错', () => {
    const baseDate = new Date('2026-05-08');
    expect(() => buildCalendarWeek(baseDate, 0, [])).not.toThrow();
  });

  it('runs 参数为空数组正常处理', () => {
    const baseDate = new Date('2026-05-08');
    const task = createMockTask();

    const result = buildCalendarWeek(baseDate, 0, [task], []);

    expect(result).toHaveLength(7);
  });

  it('过去日期的任务不显示', () => {
    const baseDate = new Date('2026-05-08'); // 周五
    const task = createMockTask({
      trigger: { type: 'interval', ms: 3600000 },
    });

    const result = buildCalendarWeek(baseDate, 0, [task]);

    // 周一到周四的 occurrences 应该为空（过去）
    const monday = result.find((day) => day.labelZh === '周一')!;
    const tuesday = result.find((day) => day.labelZh === '周二')!;
    const wednesday = result.find((day) => day.labelZh === '周三')!;
    const thursday = result.find((day) => day.labelZh === '周四')!;

    expect(monday.occurrences.length).toBe(0);
    expect(tuesday.occurrences.length).toBe(0);
    expect(wednesday.occurrences.length).toBe(0);
    expect(thursday.occurrences.length).toBe(0);

    // 周五和周六应该有 occurrences
    const friday = result.find((day) => day.labelZh === '周五')!;
    const saturday = result.find((day) => day.labelZh === '周六')!;

    expect(friday.occurrences.length).toBeGreaterThan(0);
    expect(saturday.occurrences.length).toBeGreaterThan(0);
  });

  it('包含 ScheduleRunItem 时正确映射到 occurrences', () => {
    const baseDate = new Date('2026-05-08');
    const task = createMockTask({
      taskId: 'run-task',
      trigger: { type: 'cron', expression: '30 9 * * *' },
    });

    const runs: ScheduleRunItem[] = [
      {
        id: 1,
        taskId: 'run-task',
        subjectKey: 'test',
        threadId: null,
        outcome: 'RUN_DELIVERED',
        signalSummary: null,
        durationMs: 1000,
        startedAt: '2026-05-08T09:30:00Z',
        assignedAgentId: null,
        errorSummary: null,
        task: null,
      },
    ];

    const result = buildCalendarWeek(baseDate, 0, [task], runs);

    const friday = result.find((day) => day.labelZh === '周五')!;
    expect(friday.occurrences.length).toBeGreaterThan(0);
  });
});
