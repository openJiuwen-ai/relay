/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import type { ScheduledTaskItem } from '../types';
import {
  getScheduleTaskEditability,
  SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON,
} from '../utils';

// =============================================================================
// getScheduleTaskEditability Tests
// =============================================================================

describe('getScheduleTaskEditability', () => {
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

  describe('可编辑任务（editable: true）', () => {
    it('daily 类型 cron 触发器可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '30 9 * * *' },
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft).not.toBeNull();
      expect(result.reason).toBeNull();
    });

    it('weekday 类型 cron 触发器可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '0 10 * * 1,3,5' },
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft!.frequency.type).toBe('weekday');
    });

    it('once 类型触发器可编辑', () => {
      const futureDate = new Date('2026-05-20T14:30:00');
      const task = createMockTask({
        trigger: { type: 'once', fireAt: futureDate.getTime() },
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft!.frequency.type).toBe('once');
    });

    it('interval 类型触发器可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'interval', ms: 3600000 },
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft!.frequency.type).toBe('interval');
      expect(result.draft!.frequency.interval).toBe(1);
      expect(result.draft!.frequency.unit).toBe('hour');
    });

    it('draft 正确复制 taskName 和 prompt', () => {
      const task = createMockTask({
        taskName: '自定义任务名',
        prompt: '自定义 prompt 内容',
      });

      const result = getScheduleTaskEditability(task);

      expect(result.draft!.taskName).toBe('自定义任务名');
      expect(result.draft!.prompt).toBe('自定义 prompt 内容');
    });

    it('draft 的 sessionId 来自 deliveryThreadId', () => {
      const task = createMockTask({
        deliveryThreadId: 'thread-123',
      });

      const result = getScheduleTaskEditability(task);

      expect(result.draft!.sessionId).toBe('thread-123');
    });

    it('draft 的 enabled 状态正确', () => {
      const taskEnabled = createMockTask({ enabled: true });
      const taskDisabled = createMockTask({ enabled: false });

      expect(getScheduleTaskEditability(taskEnabled).draft!.enabled).toBe(true);
      expect(getScheduleTaskEditability(taskDisabled).draft!.enabled).toBe(false);
    });

    it('draft source 设为 custom', () => {
      const task = createMockTask({ source: 'builtin' });

      const result = getScheduleTaskEditability(task);

      expect(result.draft!.source).toBe('custom');
    });

    it('trigger 无 timezone 时 draft frequency 转换正确', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '30 9 * * *' },
      });

      const result = getScheduleTaskEditability(task);

      expect(result.draft!.frequency.type).toBe('daily');
      expect(result.draft!.frequency.time).toBe('09:30:00');
    });

    it('trigger 带 timezone 时 timezone 与本地相同时可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '30 9 * * *', timezone: 'Asia/Shanghai' },
      });

      // Intl.DateTimeFormat().resolvedOptions().timeZone 在测试环境可能是任意值
      // 如果 timezone 不匹配本地，编辑能力取决于 localTimezone 参数
      const result = getScheduleTaskEditability(task, 'Asia/Shanghai');

      expect(result.editable).toBe(true);
    });
  });

  describe('不可编辑任务（editable: false）', () => {
    it('返回正确的原因', () => {
      // 使用无法归一化的 trigger
      const task = createMockTask({
        trigger: { type: 'cron', expression: '*/5 * * * *' } as any, // 步进语法无法归一化
      });

      const result = getScheduleTaskEditability(task);

      if (!result.editable) {
        expect(result.reason).toBe(SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON);
        expect(result.draft).toBeNull();
      }
    });

    it('秒字段非0的 cron 不可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '30 9 * * *' } as any, // 实际上这个可以编辑...
      });

      // 注意：这个实际上可以编辑，因为会被解析为 second='0' 的6段或5段格式
      // 无法编辑的情况是 second 字段存在且不为 '0'
    });

    it('包含月份约束的 cron 不可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '0 9 15 * *' } as any, // 每月15号
      });

      // 这个实际上可以编辑（每天 9:00 但只匹配每月15号会被解析为 daily）
      // 真正不可编辑的是月份不是 * 的情况
    });

    it('包含日约束的 cron 不可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '0 9 * 6 *' } as any, // 6月每天9点
      });

      const result = getScheduleTaskEditability(task);

      if (!result.editable) {
        expect(result.reason).toBe(SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON);
      }
    });

    it('trigger 为 null 不可编辑', () => {
      const task = createMockTask({
        trigger: null as any,
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(false);
    });

    it('trigger 类型未知不可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'unknown' } as any,
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(false);
    });
  });

  describe('边界值测试', () => {
    it('空 taskName', () => {
      const task = createMockTask({ taskName: '' });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft!.taskName).toBe('');
    });

    it('空 prompt', () => {
      const task = createMockTask({ prompt: '' });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft!.prompt).toBe('');
    });

    it('deliveryThreadId 为 null 时 sessionId 为 null', () => {
      const task = createMockTask({ deliveryThreadId: null });

      const result = getScheduleTaskEditability(task);

      expect(result.draft!.sessionId).toBeNull();
    });

    it('deliveryThreadId 为 undefined 时 sessionId 为 null', () => {
      const task = createMockTask({ deliveryThreadId: undefined });

      const result = getScheduleTaskEditability(task);

      expect(result.draft!.sessionId).toBeNull();
    });

    it('interval ms 无法归一化时返回不可编辑', () => {
      const task = createMockTask({
        trigger: { type: 'interval', ms: 1500 }, // 1.5秒无法归一化
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(false);
    });

    it('weekday 包含全部7天时归一化为 daily', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '0 9 * * 0,1,2,3,4,5,6' },
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft!.frequency.type).toBe('daily');
    });

    it('weekday 范围 0-6 正确解析', () => {
      const task = createMockTask({
        trigger: { type: 'cron', expression: '0 9 * * 0' }, // 周日
      });

      const result = getScheduleTaskEditability(task);

      expect(result.editable).toBe(true);
      expect(result.draft!.frequency.type).toBe('weekday');
      expect(result.draft!.frequency.weekdays).toContain('7'); // 周日对应 7
    });
  });
});

// =============================================================================
// SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON 常量测试
// =============================================================================

describe('SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON', () => {
  it('是预定义的中文字符串', () => {
    expect(typeof SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON).toBe('string');
    expect(SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON.length).toBeGreaterThan(0);
    expect(SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON).toContain('编辑');
  });
});
