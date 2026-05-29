/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export const MAX_SCHEDULE_TASK_LABEL_LENGTH = 64;

export type NormalizedScheduleTaskLabel = { value: string } | { error: string };

export function normalizeScheduleTaskLabel(input: unknown): NormalizedScheduleTaskLabel {
  if (typeof input !== 'string') {
    return { error: 'display.label must be a string' };
  }

  const label = input.trim();
  if (label.length === 0) {
    return { error: 'display.label must be a non-empty string' };
  }

  if (label.length > MAX_SCHEDULE_TASK_LABEL_LENGTH) {
    return { error: `display.label must be at most ${MAX_SCHEDULE_TASK_LABEL_LENGTH} characters` };
  }

  return { value: label };
}
