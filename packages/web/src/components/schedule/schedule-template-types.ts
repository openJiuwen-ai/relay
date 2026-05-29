/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type ScheduleIntervalUnit = 'hour' | 'minute' | 'second';

export type ScheduleFrequency =
  | { type: 'daily'; time: string }
  | { type: 'interval'; interval: number; unit: ScheduleIntervalUnit }
  | { type: 'once'; executeTime: string }
  | { type: 'weekday'; time: string; weekdays: string[] };

export interface ScheduleEffectiveTime {
  startTime: string;
  endTime: string;
}

export interface ScheduleTaskDraft {
  source: 'template' | 'custom';
  templateId?: string;
  taskName: string;
  prompt: string;
  frequency: ScheduleFrequency;
  enabled: boolean;
  effectiveTime?: ScheduleEffectiveTime;
  sessionId?: string | null;
}

export interface ScheduleTemplateDefinition {
  id: string;
  title: string;
  description: string;
  draft: Omit<ScheduleTaskDraft, 'source' | 'templateId'>;
}
