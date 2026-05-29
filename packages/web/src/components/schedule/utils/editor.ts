/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ScheduleIntervalUnit, ScheduleEffectiveTime } from '../schedule-template-types';

export const ALL_WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

export const WEEKDAY_OPTIONS = [
  { value: '1', label: '一' },
  { value: '2', label: '二' },
  { value: '3', label: '三' },
  { value: '4', label: '四' },
  { value: '5', label: '五' },
  { value: '6', label: '六' },
  { value: '7', label: '日' },
] as const;

export const INTERVAL_UNIT_OPTIONS: ReadonlyArray<{ value: ScheduleIntervalUnit; label: string }> = [
  { value: 'hour', label: '小时' },
  { value: 'minute', label: '分钟' },
  { value: 'second', label: '秒' },
];

export const EFFECTIVE_PRESET_OPTIONS = [
  { value: 'week', label: '近一周' },
  { value: 'month', label: '近一个月' },
  { value: 'quarter', label: '近三个月' },
  { value: 'year', label: '近一年' },
] as const;

export const NEW_SESSION_ID = 'mock-new-session-001';

export const HOURS = Array.from({ length: 24 }, (_, index) => `${index}`.padStart(2, '0'));
export const MINUTES = Array.from({ length: 60 }, (_, index) => `${index}`.padStart(2, '0'));

export const PROMPT_MIN_HEIGHT = 112;
export const PROMPT_DEFAULT_HEIGHT = 140;
export const PROMPT_INFO_ROW_HEIGHT = 24;
export const SHOW_EFFECTIVE_DATE_RANGE_UI = false;

export const INPUT_BOX_CLASS =
  'h-7 rounded-[6px] border border-[rgba(194,194,194,1)] bg-white text-[14px] text-[#101828] transition hover:border-[rgba(194,194,194,1)]';

export function normalizeTimeValue(value: string): string {
  if (!value) return '00:00:00';
  return value.length === 5 ? `${value}:00` : value;
}

export function trimSeconds(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const seconds = `${date.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function formatDateDisplay(value: string): string {
  return value ? value.replace(/-/g, '/') : '';
}

export function parseDateValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function toDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

export function addYears(date: Date, amount: number): Date {
  return new Date(date.getFullYear() + amount, date.getMonth(), 1, 12);
}

export function formatCalendarMonthLabel(date: Date): string {
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

export function splitTimeValue(value: string): { hour: string; minute: string } {
  const [hour = '00', minute = '00'] = trimSeconds(value || '00:00').split(':');
  return { hour, minute };
}

export function joinTimeValue(hour: string, minute: string): string {
  return `${hour}:${minute}`;
}

export function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export type EffectivePreset = '' | 'week' | 'month' | 'quarter' | 'year';

export function addPresetRange(baseDate: Date, preset: EffectivePreset): Date {
  const next = new Date(baseDate);
  if (preset === 'week') next.setDate(next.getDate() + 7);
  if (preset === 'month') next.setMonth(next.getMonth() + 1);
  if (preset === 'quarter') next.setMonth(next.getMonth() + 3);
  if (preset === 'year') next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function buildEffectiveTimeFromPreset(preset: EffectivePreset): ScheduleEffectiveTime | undefined {
  if (!preset) return undefined;
  const now = new Date();
  const end = addPresetRange(now, preset);
  return {
    startTime: formatDateTime(now),
    endTime: formatDateTime(end),
  };
}

export function sortWeekdays(weekdays: string[]): string[] {
  return [...weekdays].sort((left, right) => Number(left) - Number(right));
}

export function getDefaultSessionId(sessionMode: 'existing' | 'new'): string {
  return sessionMode === 'existing' ? '' : NEW_SESSION_ID;
}
