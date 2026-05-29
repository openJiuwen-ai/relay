/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type ScheduleTrigger =
  | { type: 'interval'; ms: number }
  | { type: 'cron'; expression: string; timezone?: string }
  | { type: 'once'; fireAt: number };

export type ScheduleRunOutcome =
  | 'SKIP_NO_SIGNAL'
  | 'SKIP_DISABLED'
  | 'SKIP_OVERLAP'
  | 'SKIP_GLOBAL_PAUSE'
  | 'SKIP_TASK_OVERRIDE'
  | 'SKIP_SELF_ECHO'
  | 'SKIP_MISSED_WINDOW'
  | 'RUN_DELIVERED'
  | 'RUN_FAILED'
  | (string & {});

export type ScheduleRunTaskSnapshot = {
  id: string;
  source: 'builtin' | 'dynamic';
  templateId: string | null;
  label: string | null;
  category: string | null;
  description: string | null;
  enabled: boolean | null;
  effectiveEnabled: boolean | null;
  trigger: ScheduleTrigger | null;
  deliveryThreadId: string | null;
  threadTitle: string | null;
};

export type ScheduleRunItem = {
  id: number;
  taskId: string;
  subjectKey: string;
  threadId: string | null;
  outcome: ScheduleRunOutcome;
  signalSummary: string | null;
  durationMs: number;
  startedAt: string;
  assignedAgentId: string | null;
  errorSummary: string | null;
  task: ScheduleRunTaskSnapshot | null;
};

export type ScheduledTaskItem = {
  taskId: string;
  dynamicTaskId?: string;
  source: 'builtin' | 'dynamic';
  deliveryThreadId?: string | null;
  taskName: string;
  prompt: string;
  frequency: string;
  nextExcuteTime: string;
  effectiveTime: string;
  status: string;
  enabled: boolean;
  effectiveEnabled: boolean;
  createTime: string;
  sessionName: string;
  trigger: ScheduleTrigger;
  lastRunAt: string | null;
  lastRunOutcome: string | null;
};
