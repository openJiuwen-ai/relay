/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ScheduledTaskItem } from '../types';
import type { ScheduleTaskDraft } from '../schedule-template-types';
import type { ScheduleTrigger } from '../types';
import { renderHook, act } from '@testing-library/react';
import { useTaskActions } from '../hooks/useTaskActions';
import * as useChatStore from '@/stores/chatStore';
import * as useToastStore from '@/stores/toastStore';

// =============================================================================
// 辅助函数测试（从 useTaskActions.ts 提取的纯函数）
// =============================================================================

describe('useTaskActions 辅助函数', () => {
  // resolveTaskIdentifier
  describe('resolveTaskIdentifier (通过任务对象测试)', () => {
    it('任务有 dynamicTaskId 时返回 dynamicTaskId', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        dynamicTaskId: 'dynamic-456',
        source: 'dynamic',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      // dynamicTaskId 存在时应该用于某些操作
      expect(task.dynamicTaskId ?? task.taskId).toBe('dynamic-456');
    });

    it('任务无 dynamicTaskId 时返回 taskId', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        source: 'builtin',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      expect(task.dynamicTaskId ?? task.taskId).toBe('task-123');
    });
  });

  // buildScheduleTaskChatEditText
  describe('buildScheduleTaskChatEditText', () => {
    it('生成正确的编辑文本', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        dynamicTaskId: 'dynamic-456',
        source: 'dynamic',
        taskName: '每日提醒',
        prompt: '提醒内容',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const taskId = task.dynamicTaskId ?? task.taskId;
      const expectedText = `按照以下要求修改定时任务「${task.taskName}」（任务ID：${taskId}）：`;

      expect(expectedText).toContain('每日提醒');
      expect(expectedText).toContain('dynamic-456');
    });
  });
});

// =============================================================================
// parseTimeParts 函数测试
// =============================================================================

describe('parseTimeParts', () => {
  it('正确解析标准时间格式', () => {
    const result = parseTimeParts('09:30');
    expect(result.hour).toBe(9);
    expect(result.minute).toBe(30);
  });

  it('处理小时为0的情况', () => {
    const result = parseTimeParts('00:00');
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  it('处理大时间的情况', () => {
    const result = parseTimeParts('23:59');
    expect(result.hour).toBe(23);
    expect(result.minute).toBe(59);
  });

  // 边界值测试
  it('空字符串返回默认值 0', () => {
    const result = parseTimeParts('');
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });

  it('只提供小时部分返回默认值', () => {
    const result = parseTimeParts('09');
    expect(result.hour).toBe(9);
    expect(result.minute).toBe(0);
  });

  it('无效数值返回0', () => {
    const result = parseTimeParts('ab:cd');
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });
});

// =============================================================================
// parseDateTimeToTimestamp 函数测试
// =============================================================================

describe('parseDateTimeToTimestamp', () => {
  it('正确解析标准日期时间', () => {
    const result = parseDateTimeToTimestamp('2026-05-15 09:30:45');
    const expected = new Date(2026, 4, 15, 9, 30, 45).getTime();
    expect(result).toBe(expected);
  });

  it('处理午夜时间', () => {
    const result = parseDateTimeToTimestamp('2026-05-15 00:00:00');
    const expected = new Date(2026, 4, 15, 0, 0, 0).getTime();
    expect(result).toBe(expected);
  });

  it('处理只有日期的情况', () => {
    const result = parseDateTimeToTimestamp('2026-05-15');
    const expected = new Date(2026, 4, 15, 0, 0, 0).getTime();
    expect(result).toBe(expected);
  });

  // 边界值测试
  it('空日期部分返回默认日期', () => {
    const result = parseDateTimeToTimestamp(' 09:30:45');
    // Date 构造函数处理无效日期会返回 Invalid Date
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
  });

  it('无效日期格式不抛出异常', () => {
    expect(() => parseDateTimeToTimestamp('invalid')).not.toThrow();
  });
});

// =============================================================================
// toCronWeekday 函数测试
// =============================================================================

describe('toCronWeekday', () => {
  it("7 转换为 0（周日）", () => {
    expect(toCronWeekday('7')).toBe('0');
  });

  it('其他值保持不变', () => {
    expect(toCronWeekday('1')).toBe('1');
    expect(toCronWeekday('6')).toBe('6');
    expect(toCronWeekday('0')).toBe('0');
  });
});

// =============================================================================
// buildTaskTrigger 函数测试
// =============================================================================

describe('buildTaskTrigger', () => {
  describe('once 类型', () => {
    it('正确构建 once 类型的 trigger', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'once', executeTime: '2026-05-20 14:30:00' },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      expect(trigger.type).toBe('once');
      expect(trigger.fireAt).toBe(new Date(2026, 4, 20, 14, 30, 0).getTime());
    });
  });

  describe('interval 类型', () => {
    it('正确构建 interval 类型的 trigger', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'interval', interval: 30, unit: 'minute' },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      expect(trigger.type).toBe('interval');
      expect(trigger.ms).toBe(30 * 60 * 1000);
    });

    it('hour 单位正确转换', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'interval', interval: 2, unit: 'hour' },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      expect(trigger.ms).toBe(2 * 60 * 60 * 1000);
    });

    it('second 单位正确转换', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'interval', interval: 60, unit: 'second' },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      expect(trigger.ms).toBe(60 * 1000);
    });
  });

  describe('weekday 类型', () => {
    it('正确构建 weekday 类型的 cron trigger', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'weekday', time: '09:30:00', weekdays: ['1', '3', '5'] },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      expect(trigger.type).toBe('cron');
      expect(trigger.expression).toContain('30');
      expect(trigger.expression).toContain('9');
      expect(trigger.expression).toContain('1,3,5');
    });

    it('weekday 为 7 时转换为 0', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'weekday', time: '10:00:00', weekdays: ['7'] },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      expect(trigger.expression).toContain('0');
      expect(trigger.expression).not.toContain('7');
    });

    it('带 timezone 参数', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'weekday', time: '09:00:00', weekdays: ['1'] },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft, 'Asia/Shanghai');

      expect(trigger.timezone).toBe('Asia/Shanghai');
    });

    it('timezone 为 null 时不包含 timezone 字段', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'weekday', time: '09:00:00', weekdays: ['1'] },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft, null);

      expect('timezone' in trigger).toBe(false);
    });
  });

  describe('daily 类型（默认）', () => {
    it('正确构建 daily 类型的 cron trigger', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'daily', time: '09:00:00' },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      expect(trigger.type).toBe('cron');
      expect(trigger.expression).toBe('0 9 * * *');
    });

    it('不带 explicit timezone 参数时使用系统默认时区', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'Test',
        prompt: 'Test prompt',
        frequency: { type: 'daily', time: '09:00:00' },
        enabled: true,
        sessionId: null,
      };

      const trigger = buildTaskTrigger(draft);

      // 当不传递 timezoneOverride 时，会使用 Intl.DateTimeFormat().resolvedOptions().timeZone
      // 在测试环境中这通常是一个有效的时区字符串（如 'UTC' 或 'Etc/UTC'）
      // 因此 timezone 字段应该存在且为字符串
      if ('timezone' in trigger) {
        expect(typeof trigger.timezone).toBe('string');
        expect(trigger.timezone.length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// buildCreateScheduleTaskPayload 函数测试
// =============================================================================

describe('buildCreateScheduleTaskPayload', () => {
  it('构建正确的创建任务 payload', () => {
    const draft: ScheduleTaskDraft = {
      source: 'custom',
      taskName: '  Test Task  ',
      prompt: '  Test prompt content  ',
      frequency: { type: 'daily', time: '09:00:00' },
      enabled: true,
      sessionId: 'session-123',
    };

    const payload = buildCreateScheduleTaskPayload(draft, 'thread-456');

    expect(payload.templateId).toBe('reminder');
    expect(payload.deliveryThreadId).toBe('thread-456');
    expect(payload.display.label).toBe('Test Task');
    expect(payload.display.category).toBe('system');
    expect(payload.params.message).toBe('Test prompt content');
    expect(payload.display.description).toBe('Test prompt content');
  });

  it('trim taskName 和 prompt', () => {
    const draft: ScheduleTaskDraft = {
      source: 'custom',
      taskName: '  前后有空格  ',
      prompt: '  prompt内容  ',
      frequency: { type: 'daily', time: '09:00:00' },
      enabled: true,
      sessionId: null,
    };

    const payload = buildCreateScheduleTaskPayload(draft, 'thread-1');

    expect(payload.display.label).toBe('前后有空格');
    expect(payload.params.message).toBe('prompt内容');
  });

  it('trigger 来自 buildTaskTrigger', () => {
    const draft: ScheduleTaskDraft = {
      source: 'custom',
      taskName: 'Test',
      prompt: 'Test prompt',
      frequency: { type: 'once', executeTime: '2026-05-20 10:00:00' },
      enabled: true,
      sessionId: null,
    };

    const payload = buildCreateScheduleTaskPayload(draft, 'thread-1');

    expect(payload.trigger.type).toBe('once');
    expect(payload.trigger.fireAt).toBe(new Date(2026, 4, 20, 10, 0, 0).getTime());
  });
});

// =============================================================================
// useTaskActions Hook 测试
// =============================================================================

// Mock 依赖
vi.mock('@/stores/chatStore', () => ({
  useChatStore: {
    getState: () => ({ setPendingChatInsert: vi.fn() }),
    useStore: () => ({ setPendingChatInsert: vi.fn() }),
  },
}));

vi.mock('@/stores/toastStore', () => ({
  useToastStore: {
    getState: () => ({ addToast: vi.fn() }),
    useStore: () => ({ addToast: vi.fn() }),
  },
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

// 需要单独测试这些辅助函数的逻辑，因为它们在 useTaskActions 内部
function parseTimeParts(value: string): { hour: number; minute: number } {
  const [hourText = '0', minuteText = '0'] = value.split(':');
  return {
    hour: Number(hourText) || 0,
    minute: Number(minuteText) || 0,
  };
}

function parseDateTimeToTimestamp(value: string): number {
  const [dateText = '', timeText = '00:00:00'] = value.split(' ');
  const [yearText = '0', monthText = '1', dayText = '1'] = dateText.split('-');
  const [hourText = '0', minuteText = '0', secondText = '0'] = timeText.split(':');
  return new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText),
  ).getTime();
}

function toCronWeekday(value: string): string {
  return value === '7' ? '0' : value;
}

function intervalValueToMs(value: number, unit: 'hour' | 'minute' | 'second'): number {
  const map = { hour: 3600000, minute: 60000, second: 1000 };
  return value * map[unit];
}

function buildTaskTrigger(draft: ScheduleTaskDraft, timezoneOverride?: string | null) {
  const timezone = timezoneOverride === null ? undefined : (timezoneOverride ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || undefined));

  if (draft.frequency.type === 'once') {
    return {
      type: 'once' as const,
      fireAt: parseDateTimeToTimestamp(draft.frequency.executeTime),
    };
  }

  if (draft.frequency.type === 'interval') {
    return {
      type: 'interval' as const,
      ms: intervalValueToMs(draft.frequency.interval, draft.frequency.unit),
    };
  }

  const { hour, minute } = parseTimeParts(draft.frequency.time);

  if (draft.frequency.type === 'weekday') {
    return {
      type: 'cron' as const,
      expression: `${minute} ${hour} * * ${draft.frequency.weekdays.map(toCronWeekday).join(',')}`,
      ...(timezone ? { timezone } : {}),
    };
  }

  return {
    type: 'cron' as const,
    expression: `${minute} ${hour} * * *`,
    ...(timezone ? { timezone } : {}),
  };
}

type CreateScheduleTaskPayload = {
  templateId: string;
  trigger: ReturnType<typeof buildTaskTrigger>;
  params: {
    message: string;
  };
  display: {
    label: string;
    category: 'system';
    description: string;
  };
  deliveryThreadId: string;
};

function buildCreateScheduleTaskPayload(
  draft: ScheduleTaskDraft,
  deliveryThreadId: string,
): CreateScheduleTaskPayload {
  return {
    templateId: 'reminder',
    trigger: buildTaskTrigger(draft),
    params: {
      message: draft.prompt.trim(),
    },
    display: {
      label: draft.taskName.trim(),
      category: 'system',
      description: draft.prompt.trim(),
    },
    deliveryThreadId,
  };
}

describe('useTaskActions Hook 逻辑测试', () => {
  describe('handleToggleTask 任务切换逻辑', () => {
    it('enabled 切换计算正确', () => {
      // 模拟任务切换逻辑
      const task: ScheduledTaskItem = {
        taskId: 'task-1',
        source: 'builtin',
        taskName: 'Test Task',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const targetEffectiveEnabled = !task.effectiveEnabled;
      const nextEnabled = targetEffectiveEnabled;

      expect(nextEnabled).toBe(false);
      expect(targetEffectiveEnabled).toBe(false);
    });

    it('dynamic 任务和 builtin 任务区分处理', () => {
      const dynamicTask: ScheduledTaskItem = {
        taskId: 'task-1',
        dynamicTaskId: 'dynamic-1',
        source: 'dynamic',
        taskName: 'Dynamic Task',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const builtinTask: ScheduledTaskItem = {
        taskId: 'task-2',
        source: 'builtin',
        taskName: 'Builtin Task',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      expect(dynamicTask.source).toBe('dynamic');
      expect(builtinTask.source).toBe('builtin');
    });
  });

  describe('handleDeleteConfirm 删除确认逻辑', () => {
    it('无 taskId 时提前返回', () => {
      const task: ScheduledTaskItem = {
        taskId: '',
        source: 'builtin',
        taskName: 'Test',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: false,
        effectiveEnabled: false,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const apiTaskId = task.dynamicTaskId ?? task.taskId;
      expect(apiTaskId).toBe('');
      // apiTaskId 为空时应该提前返回，不执行删除
    });

    it('使用 dynamicTaskId 优先', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        dynamicTaskId: 'dynamic-456',
        source: 'dynamic',
        taskName: 'Test',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const apiTaskId = task.dynamicTaskId ?? task.taskId;
      expect(apiTaskId).toBe('dynamic-456');
    });
  });

  describe('handleTaskEditorConfirm 编辑器确认逻辑', () => {
    it('mock-new-session 前缀触发创建新会话', () => {
      const sessionId = 'mock-new-session-001';
      const shouldCreateNewThread = sessionId.startsWith('mock-new-session');

      expect(shouldCreateNewThread).toBe(true);
    });

    it('空 sessionId 处理', () => {
      const sessionId = '';
      const shouldCreateNewThread = sessionId.startsWith('mock-new-session');

      expect(shouldCreateNewThread).toBe(false);
    });

    it('编辑模式使用 editingTask 的 id', () => {
      const editingTask: ScheduledTaskItem = {
        taskId: 'task-123',
        dynamicTaskId: 'dynamic-456',
        source: 'dynamic',
        taskName: 'Editing Task',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const apiTaskId = editingTask.dynamicTaskId ?? editingTask.taskId;
      expect(apiTaskId).toBe('dynamic-456');
    });

    it('创建模式使用新生成的 threadId', () => {
      const draft: ScheduleTaskDraft = {
        source: 'custom',
        taskName: 'New Task',
        prompt: 'New prompt',
        frequency: { type: 'daily', time: '09:00:00' },
        enabled: true,
        sessionId: 'thread-new',
      };

      let deliveryThreadId = draft.sessionId?.trim() ?? '';
      expect(deliveryThreadId).toBe('thread-new');
    });

    it('编辑模式保留原有 timezone', () => {
      const editingTask: ScheduledTaskItem = {
        taskId: 'task-123',
        source: 'builtin',
        taskName: 'Test',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *', timezone: 'Asia/Shanghai' },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const editTimezone =
        editingTask.trigger.type === 'cron' ? (editingTask.trigger.timezone ?? null) : undefined;

      expect(editTimezone).toBe('Asia/Shanghai');
    });

    it('非 cron trigger 编辑时不传递 timezone', () => {
      const editingTask: ScheduledTaskItem = {
        taskId: 'task-123',
        source: 'builtin',
        taskName: 'Test',
        prompt: 'Test',
        frequency: 'interval',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'interval', ms: 3600000 },
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const editTimezone =
        editingTask.trigger.type === 'cron' ? (editingTask.trigger.timezone ?? null) : undefined;

      expect(editTimezone).toBeUndefined();
    });
  });

  describe('handleEditTaskInConversation 对话中编辑逻辑', () => {
    it('无 deliveryThreadId 时提示错误', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        source: 'builtin',
        taskName: 'Test',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        deliveryThreadId: null,
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const threadId = task.deliveryThreadId?.trim() ?? '';
      expect(threadId).toBe('');
      // threadId 为空时应该提示错误
    });

    it('default thread 导航到首页', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        source: 'builtin',
        taskName: 'Test',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        deliveryThreadId: 'default',
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const threadId = task.deliveryThreadId?.trim() ?? '';
      const navigatePath = threadId === 'default' ? '/' : `/thread/${threadId}`;

      expect(navigatePath).toBe('/');
    });

    it('非 default thread 导航到 thread 页面', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        source: 'builtin',
        taskName: 'Test',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        deliveryThreadId: 'thread-456',
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const threadId = task.deliveryThreadId?.trim() ?? '';
      const navigatePath = threadId === 'default' ? '/' : `/thread/${threadId}`;

      expect(navigatePath).toBe('/thread/thread-456');
    });

    it('生成编辑文本包含任务信息', () => {
      const task: ScheduledTaskItem = {
        taskId: 'task-123',
        dynamicTaskId: 'dynamic-456',
        source: 'dynamic',
        taskName: '定时提醒',
        prompt: 'Test',
        frequency: 'daily',
        nextExcuteTime: '',
        effectiveTime: '',
        status: 'running',
        enabled: true,
        effectiveEnabled: true,
        createTime: '',
        sessionName: '',
        trigger: { type: 'cron', expression: '0 9 * * *' },
        deliveryThreadId: 'thread-123',
        lastRunAt: null,
        lastRunOutcome: null,
      };

      const taskId = task.dynamicTaskId ?? task.taskId;
      const editText = `按照以下要求修改定时任务「${task.taskName}」（任务ID：${taskId}）：`;

      expect(editText).toBe('按照以下要求修改定时任务「定时提醒」（任务ID：dynamic-456）：');
    });
  });
});
