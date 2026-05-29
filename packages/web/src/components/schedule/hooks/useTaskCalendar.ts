/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useMemo } from 'react';
import { buildCalendarWeek, formatWeekRangeText, getCalendarWeekRange, type CalendarDayColumn } from '../utils';
import type { ScheduleRunItem, ScheduledTaskItem } from '../types';

type UseTaskCalendarOptions = {
  baseDate: Date;
  weekOffset: number;
  tasks: ScheduledTaskItem[];
  runs: ScheduleRunItem[];
};

export function useTaskCalendar({ baseDate, weekOffset, tasks, runs }: UseTaskCalendarOptions) {
  const days = useMemo(
    () => buildCalendarWeek(baseDate, weekOffset, tasks, runs),
    [baseDate, weekOffset, tasks, runs],
  );

  const weekRangeText = useMemo(
    () => formatWeekRangeText(baseDate, weekOffset),
    [baseDate, weekOffset],
  );

  const weekRange = useMemo(
    () => getCalendarWeekRange(baseDate, weekOffset),
    [baseDate, weekOffset],
  );

  return {
    days,
    weekRangeText,
    weekRange,
  };
}
