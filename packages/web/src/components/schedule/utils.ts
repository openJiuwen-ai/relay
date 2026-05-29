/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { ScheduleTrigger, ScheduledTaskItem } from './types';
import type { ScheduleTaskDraft } from './schedule-template-types';
import type { ScheduleIntervalUnit } from './schedule-template-types';
import type { ScheduleRunItem, ScheduleRunOutcome } from './types';

// =============================================================================
// Interval Utils (from scheduled-task-interval-utils.ts)
// =============================================================================

const INTERVAL_MS_BY_UNIT: Record<ScheduleIntervalUnit, number> = {
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
  second: 1000,
};

const INTERVAL_UNIT_LABELS: Record<ScheduleIntervalUnit, string> = {
  hour: '小时',
  minute: '分钟',
  second: '秒',
};

export function intervalValueToMs(value: number, unit: ScheduleIntervalUnit): number {
  return value * INTERVAL_MS_BY_UNIT[unit];
}

export function normalizeIntervalMs(
  ms: number,
): { interval: number; unit: ScheduleIntervalUnit } | null {
  if (!Number.isFinite(ms) || ms < 10_000) return null;
  if (ms % INTERVAL_MS_BY_UNIT.hour === 0) {
    return { interval: ms / INTERVAL_MS_BY_UNIT.hour, unit: 'hour' };
  }
  if (ms % INTERVAL_MS_BY_UNIT.minute === 0) {
    return { interval: ms / INTERVAL_MS_BY_UNIT.minute, unit: 'minute' };
  }
  if (ms % INTERVAL_MS_BY_UNIT.second === 0) {
    return { interval: ms / INTERVAL_MS_BY_UNIT.second, unit: 'second' };
  }
  return null;
}

export function formatIntervalFrequency(ms: number): string {
  const normalized = normalizeIntervalMs(ms);
  if (normalized) {
    return `每隔 ${normalized.interval} ${INTERVAL_UNIT_LABELS[normalized.unit]}`;
  }
  return `每隔 ${ms} 毫秒`;
}

// =============================================================================
// Cron Frequency Formatting (from scheduled-task-frequency.ts)
// =============================================================================

type ParsedField =
  | { kind: 'any'; raw: string }
  | { kind: 'single'; raw: string; value: number }
  | { kind: 'list'; raw: string; values: number[] }
  | { kind: 'range'; raw: string; from: number; to: number }
  | { kind: 'step'; raw: string; step: number }
  | { kind: 'range-step'; raw: string; from: number; to: number; step: number }
  | { kind: 'mixed'; raw: string };

type ParseFieldOptions = {
  min: number;
  max: number;
  nameMap?: Record<string, number>;
  normalize?: (value: number) => number;
};

const WEEKDAY_NAME_TO_NUM: Record<string, number> = {
  SUN: 0, SUNDAY: 0,
  MON: 1, MONDAY: 1,
  TUE: 2, TUESDAY: 2,
  WED: 3, WEDNESDAY: 3,
  THU: 4, THURSDAY: 4,
  FRI: 5, FRIDAY: 5,
  SAT: 6, SATURDAY: 6,
};

const MONTH_NAME_TO_NUM: Record<string, number> = {
  JAN: 1, JANUARY: 1,
  FEB: 2, FEBRUARY: 2,
  MAR: 3, MARCH: 3,
  APR: 4, APRIL: 4,
  MAY: 5,
  JUN: 6, JUNE: 6,
  JUL: 7, JULY: 7,
  AUG: 8, AUGUST: 8,
  SEP: 9, SEPTEMBER: 9,
  OCT: 10, OCTOBER: 10,
  NOV: 11, NOVEMBER: 11,
  DEC: 12, DECEMBER: 12,
};

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;
const LIST_SEPARATOR = '、';

function formatClock(hour: number, minute: number, second?: number): string {
  const period = hour < 12 ? '上午' : '下午';
  const hour12 = ((hour + 11) % 12) + 1;
  const minuteText = String(minute).padStart(2, '0');
  if (typeof second === 'number') {
    const secondText = String(second).padStart(2, '0');
    return `${period} ${hour12}：${minuteText}：${secondText}`;
  }
  return `${period} ${hour12}：${minuteText}`;
}

function parseToken(rawToken: string, options: ParseFieldOptions): number | null {
  const token = rawToken.trim().toUpperCase();
  if (!token) return null;
  const mapped = options.nameMap?.[token];
  const numeric = mapped ?? Number(token);
  if (!Number.isFinite(numeric)) return null;
  const normalized = options.normalize ? options.normalize(numeric) : numeric;
  if (normalized < options.min || normalized > options.max) return null;
  return normalized;
}

function dedupeKeepOrder(values: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function parseCronField(rawValue: string, options: ParseFieldOptions): ParsedField {
  const raw = rawValue.trim();
  const upper = raw.toUpperCase();
  if (!raw) return { kind: 'mixed', raw };
  if (upper === '*' || upper === '?') return { kind: 'any', raw };

  if (upper.includes(',')) {
    const values: number[] = [];
    for (const part of upper.split(',')) {
      const segment = part.trim();
      if (!segment || segment.includes('/') || segment.includes('-')) return { kind: 'mixed', raw };
      const value = parseToken(segment, options);
      if (value === null) return { kind: 'mixed', raw };
      values.push(value);
    }
    return { kind: 'list', raw, values: dedupeKeepOrder(values) };
  }

  const stepMatch = upper.match(/^(.+)\/(\d+)$/);
  if (stepMatch) {
    const step = Number(stepMatch[2]);
    if (!Number.isFinite(step) || step <= 0) return { kind: 'mixed', raw };
    const left = stepMatch[1]!.trim();
    if (left === '*' || left === '?') {
      return { kind: 'step', raw, step };
    }
    const rangeMatch = left.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
    if (rangeMatch) {
      const from = parseToken(rangeMatch[1]!, options);
      const to = parseToken(rangeMatch[2]!, options);
      if (from === null || to === null || from > to) return { kind: 'mixed', raw };
      return { kind: 'range-step', raw, from, to, step };
    }
    const start = parseToken(left, options);
    if (start === null) return { kind: 'mixed', raw };
    return { kind: 'range-step', raw, from: start, to: options.max, step };
  }

  const rangeMatch = upper.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
  if (rangeMatch) {
    const from = parseToken(rangeMatch[1]!, options);
    const to = parseToken(rangeMatch[2]!, options);
    if (from === null || to === null || from > to) return { kind: 'mixed', raw };
    return { kind: 'range', raw, from, to };
  }

  const single = parseToken(upper, options);
  if (single !== null) return { kind: 'single', raw, value: single };
  return { kind: 'mixed', raw };
}

function isAny(field: ParsedField): field is { kind: 'any'; raw: string } {
  return field.kind === 'any';
}

function formatValues(values: number[]): string {
  return values.join(LIST_SEPARATOR);
}

function formatMonthText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'single':
      return `${field.value}月`;
    case 'list':
      return `${field.values.map((value) => `${value}月`).join(LIST_SEPARATOR)}`;
    case 'range':
      return `${field.from}月至${field.to}月`;
    case 'step':
      return `每隔 ${field.step} 个月`;
    case 'range-step':
      return `${field.from}月至${field.to}月每隔 ${field.step} 个月`;
    default:
      return null;
  }
}

function formatDayOfMonthText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'single':
      return `${field.value}号`;
    case 'list':
      return `${field.values.map((value) => `${value}号`).join(LIST_SEPARATOR)}`;
    case 'range':
      return `${field.from}号至${field.to}号`;
    case 'step':
      return `每隔 ${field.step} 天`;
    case 'range-step':
      return `${field.from}号至${field.to}号每隔 ${field.step} 天`;
    default:
      return null;
  }
}

function formatWeekdaySpan(field: ParsedField): string | null {
  const toLabel = (value: number): string => WEEKDAY_LABELS[value] ?? String(value);
  switch (field.kind) {
    case 'single':
      return toLabel(field.value);
    case 'list':
      return field.values.map((value) => toLabel(value)).join(LIST_SEPARATOR);
    case 'range':
      return `${toLabel(field.from)}至${toLabel(field.to)}`;
    case 'step':
      return `每隔 ${field.step} 天`;
    case 'range-step':
      return `${toLabel(field.from)}至${toLabel(field.to)}每隔 ${field.step} 天`;
    default:
      return null;
  }
}

function formatSecondText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'any':
      return '每秒';
    case 'single':
      return `第${field.value}秒`;
    case 'list':
      return `第${formatValues(field.values)}秒`;
    case 'range':
      return `${field.from}-${field.to}秒`;
    case 'step':
      return `每隔 ${field.step} 秒`;
    case 'range-step':
      return `${field.from}-${field.to}秒每隔 ${field.step} 秒`;
    default:
      return null;
  }
}

function formatMinuteText(field: ParsedField): string | null {
  switch (field.kind) {
    case 'any':
      return '每分钟';
    case 'single':
      return `第${field.value}分钟`;
    case 'list':
      return `第${formatValues(field.values)}分钟`;
    case 'range':
      return `${field.from}-${field.to}分钟`;
    case 'step':
      return `每隔 ${field.step} 分钟`;
    case 'range-step':
      return `${field.from}-${field.to}分钟每隔 ${field.step} 分钟`;
    default:
      return null;
  }
}

function secondSuffix(field: ParsedField, hasExplicitSeconds: boolean): string {
  if (!hasExplicitSeconds) return '';
  if (field.kind === 'single' && field.value === 0) return '';
  const text = formatSecondText(field);
  if (!text) return '';
  return `（${text}）`;
}

function formatDatePart(month: ParsedField, dayOfMonth: ParsedField, dayOfWeek: ParsedField): string | null {
  const monthAny = isAny(month);
  const dayOfMonthAny = isAny(dayOfMonth);
  const dayOfWeekAny = isAny(dayOfWeek);

  if (monthAny && dayOfMonthAny && dayOfWeekAny) return null;

  if (monthAny && dayOfMonthAny && !dayOfWeekAny) {
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!dayOfWeekText) return null;
    return `每周${dayOfWeekText}`;
  }

  if (monthAny && !dayOfMonthAny && dayOfWeekAny) {
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    if (!dayOfMonthText) return null;
    if (dayOfMonth.kind === 'step' || dayOfMonth.kind === 'range-step') return dayOfMonthText;
    return `每月${dayOfMonthText}`;
  }

  if (!monthAny && dayOfMonthAny && dayOfWeekAny) {
    const monthText = formatMonthText(month);
    if (!monthText) return null;
    if (month.kind === 'step' || month.kind === 'range-step') return monthText;
    return `每年${monthText}`;
  }

  if (!monthAny && !dayOfMonthAny && dayOfWeekAny) {
    const monthText = formatMonthText(month);
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    if (!monthText || !dayOfMonthText) return null;
    const yearPrefix = month.kind === 'step' || month.kind === 'range-step' ? monthText : `每年${monthText}`;
    return `${yearPrefix}${dayOfMonthText}`;
  }

  if (monthAny && !dayOfMonthAny && !dayOfWeekAny) {
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!dayOfMonthText || !dayOfWeekText) return null;
    return `每月${dayOfMonthText}，每周${dayOfWeekText}`;
  }

  if (!monthAny && dayOfMonthAny && !dayOfWeekAny) {
    const monthText = formatMonthText(month);
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!monthText || !dayOfWeekText) return null;
    const yearPrefix = month.kind === 'step' || month.kind === 'range-step' ? monthText : `每年${monthText}`;
    return `${yearPrefix}，每周${dayOfWeekText}`;
  }

  if (!monthAny && !dayOfMonthAny && !dayOfWeekAny) {
    const monthText = formatMonthText(month);
    const dayOfMonthText = formatDayOfMonthText(dayOfMonth);
    const dayOfWeekText = formatWeekdaySpan(dayOfWeek);
    if (!monthText || !dayOfMonthText || !dayOfWeekText) return null;
    const yearPrefix = month.kind === 'step' || month.kind === 'range-step' ? monthText : `每年${monthText}`;
    return `${yearPrefix}${dayOfMonthText}，每周${dayOfWeekText}`;
  }

  return null;
}

function formatFixedTimesForHours(hours: number[], minute: number, second?: number): string {
  return hours.map((hour) => formatClock(hour, minute, second)).join(LIST_SEPARATOR);
}

function formatTimePart(
  hour: ParsedField,
  minute: ParsedField,
  second: ParsedField,
  hasExplicitSeconds: boolean,
  hasDateConstraint: boolean,
): string | null {
  const hourAny = isAny(hour);
  const minuteAny = isAny(minute);

  if (hourAny && minuteAny) {
    if (!hasExplicitSeconds) return '每分钟';
    if (second.kind === 'single' && second.value === 0) return '每分钟';
    if (second.kind === 'any') return '每秒';
    if (second.kind === 'step') return `每隔 ${second.step} 秒`;
    const secondText = formatSecondText(second);
    return secondText ? `每分钟${secondText}` : null;
  }

  if (hourAny) {
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    let base = minuteText;
    if (minute.kind !== 'step' && minute.kind !== 'any') {
      base = `每小时${minuteText}`;
    }
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`.trim();
  }

  if (hour.kind === 'step') {
    if (minute.kind === 'single') {
      return `每隔 ${hour.step} 小时（第${minute.value}分钟）${secondSuffix(second, hasExplicitSeconds)}`.trim();
    }
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    return `每隔 ${hour.step} 小时（${minuteText}）${secondSuffix(second, hasExplicitSeconds)}`.trim();
  }

  if (hour.kind === 'range-step') {
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    return `每天${hour.from}点至${hour.to}点每隔 ${hour.step} 小时（${minuteText}）${secondSuffix(second, hasExplicitSeconds)}`.trim();
  }

  if (hour.kind === 'single' && minute.kind === 'single') {
    const secondValue = hasExplicitSeconds && second.kind === 'single' ? second.value : undefined;
    const prefix = hasDateConstraint ? '' : '每天 ';
    const base = `${prefix}${formatClock(hour.value, minute.value, secondValue)}`;
    if (!hasExplicitSeconds || second.kind === 'single') return base;
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  if (hour.kind === 'list' && minute.kind === 'single') {
    const secondValue = hasExplicitSeconds && second.kind === 'single' ? second.value : undefined;
    const prefix = hasDateConstraint ? '' : '每天 ';
    const times = formatFixedTimesForHours(hour.values, minute.value, secondValue);
    if (!hasExplicitSeconds || second.kind === 'single') return `${prefix}${times}`;
    return `${prefix}${times}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  if (hour.kind === 'range' && minute.kind === 'single') {
    const prefix = hasDateConstraint ? '' : '每天 ';
    const base = `${prefix}${hour.from}点至${hour.to}点第${minute.value}分钟`;
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  if (hour.kind === 'range') {
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    const prefix = hasDateConstraint ? '' : '每天 ';
    const base = `${prefix}${hour.from}点至${hour.to}点${minuteText}`;
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  if (hour.kind === 'single') {
    const minuteText = formatMinuteText(minute);
    if (!minuteText) return null;
    const prefix = hasDateConstraint ? '' : '每天 ';
    const base = `${prefix}${hour.value}点${minuteText}`;
    return `${base}${secondSuffix(second, hasExplicitSeconds)}`;
  }

  return null;
}

export function formatCronFrequency(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return expression;

  let secondRaw = '0';
  let minuteRaw = '*';
  let hourRaw = '*';
  let dayOfMonthRaw = '*';
  let monthRaw = '*';
  let dayOfWeekRaw = '*';
  let hasExplicitSeconds = false;

  if (parts.length === 5) {
    [minuteRaw, hourRaw, dayOfMonthRaw, monthRaw, dayOfWeekRaw] = parts;
  } else {
    [secondRaw, minuteRaw, hourRaw, dayOfMonthRaw, monthRaw, dayOfWeekRaw] = parts;
    hasExplicitSeconds = true;
  }

  const second = parseCronField(secondRaw, { min: 0, max: 59 });
  const minute = parseCronField(minuteRaw, { min: 0, max: 59 });
  const hour = parseCronField(hourRaw, { min: 0, max: 23 });
  const dayOfMonth = parseCronField(dayOfMonthRaw, { min: 1, max: 31 });
  const month = parseCronField(monthRaw, { min: 1, max: 12, nameMap: MONTH_NAME_TO_NUM });
  const dayOfWeek = parseCronField(dayOfWeekRaw, {
    min: 0,
    max: 6,
    nameMap: WEEKDAY_NAME_TO_NUM,
    normalize: (value) => (value === 7 ? 0 : value),
  });

  const hasDateConstraint = !(isAny(month) && isAny(dayOfMonth) && isAny(dayOfWeek));
  const datePart = formatDatePart(month, dayOfMonth, dayOfWeek);
  const timePart = formatTimePart(hour, minute, second, hasExplicitSeconds, hasDateConstraint);

  if (datePart && timePart) return `${datePart} ${timePart}`.replace(/\s+/g, ' ').trim();
  if (datePart) return datePart;
  if (timePart) return timePart;
  return expression;
}

// =============================================================================
// Calendar Utils (from scheduled-tasks-calendar-utils.ts)
// =============================================================================

export type CalendarDisplayMode = 'single' | 'recurring';
export type CalendarTaskState = 'pending' | 'completed' | 'failed' | 'paused' | 'skipped';

export type CalendarOccurrence = {
  taskId: string;
  sourceTaskId: string;
  taskName: string;
  mode: CalendarDisplayMode;
  timeLabel: string;
  state: CalendarTaskState;
  lastExecutionText?: string;
  nextExecutionText?: string;
  latestRunAt?: string;
  latestRunOutcome?: ScheduleRunOutcome;
  runCount?: number;
};

export type CalendarDayColumn = {
  date: Date;
  dayIndex: number;
  labelZh: string;
  labelEn: string;
  dayOfMonth: number;
  occurrences: CalendarOccurrence[];
};

const WEEKDAY_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;
const WEEKDAY_EN = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

type ParsedCron = {
  second: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
};

type DailyRunSummary = {
  latestRun: ScheduleRunItem;
  latestStartedAt: Date;
  runCount: number;
  state: CalendarTaskState;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toHm(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

function compareDateOnly(a: Date, b: Date): number {
  const av = startOfDay(a).getTime();
  const bv = startOfDay(b).getTime();
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function parseCron(expression: string): ParsedCron | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5) return null;
  if (parts.length === 5) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    return { second: '0', minute, hour, dayOfMonth, month, dayOfWeek };
  }
  const [second, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { second, minute, hour, dayOfMonth, month, dayOfWeek };
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isValidDate(date: Date): boolean {
  return Number.isFinite(date.getTime());
}

function isPastDay(date: Date, now: Date): boolean {
  return compareDateOnly(date, now) < 0;
}

function hasStepSyntax(field: string): boolean {
  return field.includes('/');
}

function parseCalendarToken(token: string, map?: Record<string, number>): number | null {
  const upper = token.trim().toUpperCase();
  if (!upper) return null;
  if (map && upper in map) return map[upper]!;
  const num = Number(upper);
  if (!Number.isFinite(num)) return null;
  return num;
}

function matchField(
  rawField: string,
  value: number,
  min: number,
  max: number,
  map?: Record<string, number>,
  normalize?: (num: number) => number,
): boolean {
  const field = rawField.trim().toUpperCase();
  if (field === '*' || field === '?') return true;
  const items = field.split(',');
  for (const item of items) {
    const segment = item.trim();
    if (!segment) continue;
    const stepMatch = segment.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const left = stepMatch[1]!.trim();
      const step = Number(stepMatch[2]!);
      if (!Number.isFinite(step) || step <= 0) continue;
      let rangeStart = min;
      let rangeEnd = max;
      if (left !== '*' && left !== '?') {
        const rangeMatch = left.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
        if (rangeMatch) {
          const fromRaw = parseCalendarToken(rangeMatch[1]!, map);
          const toRaw = parseCalendarToken(rangeMatch[2]!, map);
          if (fromRaw === null || toRaw === null) continue;
          rangeStart = normalize ? normalize(fromRaw) : fromRaw;
          rangeEnd = normalize ? normalize(toRaw) : toRaw;
        } else {
          const startRaw = parseCalendarToken(left, map);
          if (startRaw === null) continue;
          rangeStart = normalize ? normalize(startRaw) : startRaw;
          rangeEnd = max;
        }
      }
      if (rangeStart > rangeEnd) continue;
      if (value < rangeStart || value > rangeEnd) continue;
      if ((value - rangeStart) % step === 0) return true;
      continue;
    }
    const rangeMatch = segment.match(/^([A-Z0-9]+)-([A-Z0-9]+)$/);
    if (rangeMatch) {
      const fromRaw = parseCalendarToken(rangeMatch[1]!, map);
      const toRaw = parseCalendarToken(rangeMatch[2]!, map);
      if (fromRaw === null || toRaw === null) continue;
      const from = normalize ? normalize(fromRaw) : fromRaw;
      const to = normalize ? normalize(toRaw) : toRaw;
      if (value >= from && value <= to) return true;
      continue;
    }
    const singleRaw = parseCalendarToken(segment, map);
    if (singleRaw === null) continue;
    const single = normalize ? normalize(singleRaw) : singleRaw;
    if (single === value) return true;
  }
  return false;
}

function expandNoStepField(rawField: string, min: number, max: number): number[] | null {
  const field = rawField.trim().toUpperCase();
  if (field.includes('/')) return null;
  if (field === '*' || field === '?') return Array.from({ length: max - min + 1 }, (_, idx) => min + idx);
  const out = new Set<number>();
  for (const item of field.split(',')) {
    const segment = item.trim();
    if (!segment) continue;
    const rangeMatch = segment.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      if (from > to) continue;
      for (let i = from; i <= to; i += 1) {
        if (i >= min && i <= max) out.add(i);
      }
      continue;
    }
    const n = Number(segment);
    if (Number.isFinite(n) && n >= min && n <= max) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

function expandFieldWithStep(rawField: string, min: number, max: number): number[] {
  const field = rawField.trim().toUpperCase();
  if (field === '*' || field === '?') return Array.from({ length: max - min + 1 }, (_, idx) => min + idx);
  const out = new Set<number>();
  for (const item of field.split(',')) {
    const segment = item.trim();
    if (!segment) continue;
    const stepMatch = segment.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const left = stepMatch[1]!.trim();
      const step = Number(stepMatch[2]!);
      if (!Number.isFinite(step) || step <= 0) continue;
      let start = min;
      let end = max;
      if (left !== '*' && left !== '?') {
        const rangeMatch = left.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
          start = Number(rangeMatch[1]);
          end = Number(rangeMatch[2]);
        } else {
          const n = Number(left);
          if (!Number.isFinite(n)) continue;
          start = n;
          end = max;
        }
      }
      if (start > end) continue;
      for (let i = Math.max(start, min); i <= Math.min(end, max); i += step) out.add(i);
      continue;
    }
    const rangeMatch = segment.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);
      if (from > to) continue;
      for (let i = from; i <= to; i += 1) if (i >= min && i <= max) out.add(i);
      continue;
    }
    const n = Number(segment);
    if (Number.isFinite(n) && n >= min && n <= max) out.add(n);
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function classifyCronDisplayMode(expression: string): CalendarDisplayMode {
  const parsed = parseCron(expression);
  if (!parsed) return 'single';
  if (hasStepSyntax(parsed.second) || hasStepSyntax(parsed.minute) || hasStepSyntax(parsed.hour)) {
    return 'recurring';
  }
  const seconds = expandNoStepField(parsed.second, 0, 59);
  const times = cronTimesForDay(parsed);
  if (!seconds || seconds.length !== 1) return 'recurring';
  if (times.length !== 1) return 'recurring';
  return 'single';
}

function startOfWeekMonday(baseDate: Date, weekOffset: number): Date {
  const date = new Date(baseDate);
  date.setHours(0, 0, 0, 0);
  const jsDay = date.getDay();
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  date.setDate(date.getDate() + mondayOffset + weekOffset * 7);
  return date;
}

export function getCalendarWeekRange(baseDate: Date, weekOffset: number): { start: Date; end: Date } {
  const start = startOfWeekMonday(baseDate, weekOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function formatWeekRangeText(baseDate: Date, weekOffset: number): string {
  const { start, end } = getCalendarWeekRange(baseDate, weekOffset);
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日- ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
}

function computeNextCronExecutionAt(parsed: ParsedCron, from: Date, lookaheadDays = 370): Date | null {
  const secondValues = expandFieldWithStep(parsed.second, 0, 59);
  const minuteValues = expandFieldWithStep(parsed.minute, 0, 59);
  const hourValues = expandFieldWithStep(parsed.hour, 0, 23);
  if (secondValues.length === 0 || minuteValues.length === 0 || hourValues.length === 0) return null;

  const cursor = new Date(from.getTime() + 1000);
  cursor.setMilliseconds(0);
  const cursorStartDay = startOfDay(cursor);

  for (let dayOffset = 0; dayOffset <= lookaheadDays; dayOffset += 1) {
    const day = new Date(cursorStartDay);
    day.setDate(cursorStartDay.getDate() + dayOffset);
    if (!cronMatchesDay(parsed, day)) continue;

    const minHour = dayOffset === 0 ? cursor.getHours() : 0;
    for (const hour of hourValues) {
      if (hour < minHour) continue;
      const minMinute = dayOffset === 0 && hour === cursor.getHours() ? cursor.getMinutes() : 0;
      for (const minute of minuteValues) {
        if (minute < minMinute) continue;
        const minSecond =
          dayOffset === 0 && hour === cursor.getHours() && minute === cursor.getMinutes() ? cursor.getSeconds() : 0;
        for (const second of secondValues) {
          if (second < minSecond) continue;
          const candidate = new Date(day);
          candidate.setHours(hour, minute, second, 0);
          if (candidate.getTime() > from.getTime()) return candidate;
        }
      }
    }
  }
  return null;
}

export function getNextExecutionAt(trigger: ScheduleTrigger, from: Date = new Date()): Date | null {
  if (trigger.type === 'interval') {
    return new Date(from.getTime() + trigger.ms);
  }
  if (trigger.type === 'once') {
    const fireAt = new Date(trigger.fireAt);
    if (!isValidDate(fireAt)) return null;
    return fireAt.getTime() > from.getTime() ? fireAt : null;
  }
  const parsed = parseCron(trigger.expression);
  if (!parsed) return null;
  return computeNextCronExecutionAt(parsed, from);
}

function stateForRunOutcome(outcome: ScheduleRunOutcome | string): CalendarTaskState {
  if (outcome === 'RUN_FAILED') return 'failed';
  if (outcome === 'RUN_DELIVERED') return 'completed';
  if (outcome.startsWith('SKIP_')) return 'skipped';
  return 'skipped';
}

function runStatusText(state: CalendarTaskState): string {
  if (state === 'failed') return '执行失败';
  if (state === 'completed') return '执行成功';
  if (state === 'skipped') return '已跳过';
  if (state === 'paused') return '已暂停';
  return '待执行';
}

function runSummaryKey(taskId: string, date: Date): string {
  return `${taskId}|${localDateKey(date)}`;
}

function buildRunSummaryMap(runs: ScheduleRunItem[]): Map<string, DailyRunSummary> {
  const summaries = new Map<string, DailyRunSummary>();
  for (const run of runs) {
    const startedAt = new Date(run.startedAt);
    if (!isValidDate(startedAt)) continue;
    const key = runSummaryKey(run.taskId, startedAt);
    const existing = summaries.get(key);
    if (!existing) {
      summaries.set(key, {
        latestRun: run,
        latestStartedAt: startedAt,
        runCount: 1,
        state: stateForRunOutcome(run.outcome),
      });
      continue;
    }
    existing.runCount += 1;
    if (startedAt.getTime() > existing.latestStartedAt.getTime()) {
      existing.latestRun = run;
      existing.latestStartedAt = startedAt;
      existing.state = stateForRunOutcome(run.outcome);
    }
  }
  return summaries;
}

function getDailyRunSummary(
  summaries: Map<string, DailyRunSummary>,
  taskId: string,
  date: Date,
): DailyRunSummary | undefined {
  return summaries.get(runSummaryKey(taskId, date));
}

function triggerForRun(run: ScheduleRunItem, task?: ScheduledTaskItem): ScheduleTrigger | null {
  return task?.trigger ?? run.task?.trigger ?? null;
}

function taskNameForRun(run: ScheduleRunItem, task?: ScheduledTaskItem): string {
  const snapshotLabel = run.task?.label?.trim();
  return task?.taskName ?? (snapshotLabel || run.taskId);
}

function isRecurringTrigger(trigger: ScheduleTrigger | null | undefined): boolean {
  if (!trigger) return false;
  if (trigger.type === 'interval') return true;
  if (trigger.type === 'cron') return classifyCronDisplayMode(trigger.expression) === 'recurring';
  return false;
}

function runTimeLabel(startedAt: string): string {
  const date = new Date(startedAt);
  if (!isValidDate(date)) return '--:--';
  return toHm(date);
}

function computeSingleOccurrenceState(
  task: ScheduledTaskItem,
  runSummary?: DailyRunSummary,
): CalendarTaskState {
  if (!task.effectiveEnabled) return 'paused';
  if (runSummary) return runSummary.state;
  return 'pending';
}

function recurringTimeRangeForCron(parsed: ParsedCron): string {
  const hours = expandFieldWithStep(parsed.hour, 0, 23);
  if (!hours || hours.length === 0) return '00:00-23:59';
  const start = hours[0]!;
  const end = hours[hours.length - 1]!;
  return `${pad2(start)}:00-${pad2(end)}:59`;
}

function computeNextIntervalTimeLabel(
  task: ScheduledTaskItem,
  dayDate: Date,
  now: Date,
  latestRunAt?: string,
): string {
  if (task.trigger.type !== 'interval') return '--:--';
  if (isSameDate(dayDate, now)) {
    const base = latestRunAt ? new Date(latestRunAt).getTime() : task.lastRunAt ? new Date(task.lastRunAt).getTime() : now.getTime();
    return toHm(new Date(base + task.trigger.ms));
  }
  return '00:00';
}

function computeNextCronTimeLabel(parsed: ParsedCron, dayDate: Date, now: Date): string {
  const hours = expandFieldWithStep(parsed.hour, 0, 23);
  const minutes = expandFieldWithStep(parsed.minute, 0, 59);
  if (hours.length === 0 || minutes.length === 0) return '--:--';
  const currentMinute = isSameDate(dayDate, now) ? now.getHours() * 60 + now.getMinutes() : -1;
  const candidates: string[] = [];
  for (const h of hours) {
    for (const m of minutes) {
      const value = h * 60 + m;
      if (value >= currentMinute) candidates.push(`${pad2(h)}:${pad2(m)}`);
    }
  }
  if (candidates.length > 0) return candidates.sort()[0]!;
  return `${pad2(hours[0]!)}:${pad2(minutes[0]!)}`;
}

function stateLabel(state: CalendarTaskState): string {
  if (state === 'failed') return '已失败';
  if (state === 'completed') return '已完成';
  if (state === 'skipped') return '已跳过';
  if (state === 'paused') return '已暂停';
  return '待执行';
}

function computeRecurringState(
  task: ScheduledTaskItem,
  dayDate: Date,
  now: Date,
  runSummary?: DailyRunSummary,
): CalendarTaskState {
  if (!task.effectiveEnabled) return 'paused';
  const dateCmp = compareDateOnly(dayDate, now);
  if (dateCmp < 0) return runSummary?.state ?? 'pending';
  if (dateCmp > 0) return 'pending';
  if (runSummary) return runSummary.state;
  return 'pending';
}

function makeRecurringOccurrence(
  task: ScheduledTaskItem,
  parsedCron: ParsedCron | null,
  dayDate: Date,
  now: Date,
  runSummary?: DailyRunSummary,
): CalendarOccurrence {
  const state = computeRecurringState(task, dayDate, now, runSummary);
  const latestRunAt = runSummary?.latestRun.startedAt ?? task.lastRunAt;
  const latestRunState =
    runSummary?.state ?? (task.lastRunOutcome ? stateForRunOutcome(task.lastRunOutcome) : null);
  const lastExecutionText =
    latestRunAt && latestRunState
      ? `上次 ${toHm(new Date(latestRunAt))} ${runStatusText(latestRunState)}`
      : latestRunAt
        ? `上次 ${toHm(new Date(latestRunAt))} 执行`
        : stateLabel(state);
  const nextHm =
    task.trigger.type === 'interval'
      ? computeNextIntervalTimeLabel(task, dayDate, now, latestRunAt ?? undefined)
      : parsedCron
        ? computeNextCronTimeLabel(parsedCron, dayDate, now)
        : '--:--';
  const isToday = isSameDate(dayDate, now);
  const shouldShowNext = isToday || state === 'pending';
  return {
    taskId: task.taskId,
    sourceTaskId: task.taskId,
    taskName: task.taskName,
    mode: 'recurring',
    timeLabel:
      task.trigger.type === 'interval'
        ? '00:00-23:59'
        : parsedCron
          ? recurringTimeRangeForCron(parsedCron)
          : '00:00-23:59',
    state,
    lastExecutionText: isToday ? lastExecutionText : stateLabel(state),
    nextExecutionText: shouldShowNext ? `下次 ${nextHm} 执行` : undefined,
    latestRunAt: runSummary?.latestRun.startedAt,
    latestRunOutcome: runSummary?.latestRun.outcome,
    runCount: runSummary?.runCount,
  };
}

function cronMatchesDay(parsed: ParsedCron, date: Date): boolean {
  const month = date.getMonth() + 1;
  const dom = date.getDate();
  const dow = date.getDay();
  const monthMatch = matchField(parsed.month, month, 1, 12, MONTH_NAME_TO_NUM);
  const domMatch = matchField(parsed.dayOfMonth, dom, 1, 31);
  const dowMatch = matchField(parsed.dayOfWeek, dow, 0, 6, WEEKDAY_NAME_TO_NUM, (v) => (v === 7 ? 0 : v));
  return monthMatch && domMatch && dowMatch;
}

function cronTimesForDay(parsed: ParsedCron): Array<{ h: number; m: number }> {
  const hours = expandNoStepField(parsed.hour, 0, 23);
  const minutes = expandNoStepField(parsed.minute, 0, 59);
  if (!hours || !minutes || !hours.length || !minutes.length) return [];
  const out: Array<{ h: number; m: number }> = [];
  for (const h of hours) {
    for (const m of minutes) out.push({ h, m });
  }
  return out.sort((a, b) => (a.h === b.h ? a.m - b.m : a.h - b.h));
}

function expandFixedCronForWeek(
  task: ScheduledTaskItem,
  parsed: ParsedCron,
  days: CalendarDayColumn[],
  runSummaries: Map<string, DailyRunSummary>,
) {
  const now = new Date();
  const seconds = expandNoStepField(parsed.second, 0, 59);
  const second = seconds && seconds.length > 0 ? seconds[0]! : 0;
  for (const day of days) {
    if (!cronMatchesDay(parsed, day.date)) continue;
    const runSummary = getDailyRunSummary(runSummaries, task.taskId, day.date);
    const times = cronTimesForDay(parsed);
    for (const time of times) {
      const occurrenceAt = new Date(day.date);
      occurrenceAt.setHours(time.h, time.m, second, 0);
      if (!runSummary && isSameDate(day.date, now) && occurrenceAt.getTime() < now.getTime()) continue;
      const state = computeSingleOccurrenceState(task, runSummary);
      day.occurrences.push({
        taskId: `${task.taskId}-${day.dayOfMonth}-${time.h}-${time.m}`,
        sourceTaskId: task.taskId,
        taskName: task.taskName,
        mode: 'single',
        timeLabel: `${pad2(time.h)}:${pad2(time.m)}`,
        state,
        latestRunAt: runSummary?.latestRun.startedAt,
        latestRunOutcome: runSummary?.latestRun.outcome,
        runCount: runSummary?.runCount,
      });
    }
  }
}

function expandOnceForWeek(
  task: ScheduledTaskItem,
  days: CalendarDayColumn[],
  runSummaries: Map<string, DailyRunSummary>,
) {
  if (task.trigger.type !== 'once') return;
  const fireAt = new Date(task.trigger.fireAt);
  const now = new Date();
  for (const day of days) {
    if (
      fireAt.getFullYear() === day.date.getFullYear() &&
      fireAt.getMonth() === day.date.getMonth() &&
      fireAt.getDate() === day.date.getDate()
    ) {
      const runSummary = getDailyRunSummary(runSummaries, task.taskId, day.date);
      if (!runSummary && isSameDate(day.date, now) && fireAt.getTime() < now.getTime()) continue;
      const state = computeSingleOccurrenceState(task, runSummary);
      day.occurrences.push({
        taskId: task.taskId,
        sourceTaskId: task.taskId,
        taskName: task.taskName,
        mode: 'single',
        timeLabel: toHm(fireAt),
        state,
        latestRunAt: runSummary?.latestRun.startedAt,
        latestRunOutcome: runSummary?.latestRun.outcome,
        runCount: runSummary?.runCount,
      });
    }
  }
}

function timeLabelStartMinutes(label: string): number {
  const head = label.split('-')[0]?.trim() ?? '';
  const match = head.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  return h * 60 + m;
}

function compareOccurrence(a: CalendarOccurrence, b: CalendarOccurrence): number {
  const modeOrder = a.mode === b.mode ? 0 : a.mode === 'recurring' ? -1 : 1;
  if (modeOrder !== 0) return modeOrder;

  const startDiff = timeLabelStartMinutes(a.timeLabel) - timeLabelStartMinutes(b.timeLabel);
  if (startDiff !== 0) return startDiff;

  const nameOrder = a.taskName.localeCompare(b.taskName, 'zh-CN');
  if (nameOrder !== 0) return nameOrder;
  return a.taskId.localeCompare(b.taskId);
}

function buildRunsByDay(monday: Date, runs: ScheduleRunItem[]): Map<number, ScheduleRunItem[]> {
  const out = new Map<number, ScheduleRunItem[]>();
  const weekStart = startOfDay(monday).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const run of runs) {
    const runDate = new Date(run.startedAt);
    if (!isValidDate(runDate)) continue;
    const dayStart = startOfDay(runDate).getTime();
    const index = Math.floor((dayStart - weekStart) / dayMs);
    if (index < 0 || index > 6) continue;
    const bucket = out.get(index);
    if (bucket) {
      bucket.push(run);
    } else {
      out.set(index, [run]);
    }
  }
  return out;
}

function appendRunBackedOccurrences(
  day: CalendarDayColumn,
  runs: ScheduleRunItem[],
  taskById: Map<string, ScheduledTaskItem>,
  runSummaries: Map<string, DailyRunSummary>,
  opts: { missingTasksOnly: boolean },
): void {
  const recurringTaskIds = new Set<string>();
  const singleRuns: Array<{ run: ScheduleRunItem; task?: ScheduledTaskItem }> = [];

  for (const run of runs) {
    const task = taskById.get(run.taskId);
    if (opts.missingTasksOnly && task) continue;
    const trigger = triggerForRun(run, task);
    const summary = getDailyRunSummary(runSummaries, run.taskId, day.date);
    const isLegacyRecurringWithoutSnapshot = !trigger && !task && (summary?.runCount ?? 0) > 1;
    if (isRecurringTrigger(trigger)) {
      recurringTaskIds.add(run.taskId);
      continue;
    }
    if (isLegacyRecurringWithoutSnapshot) {
      recurringTaskIds.add(run.taskId);
      continue;
    }
    singleRuns.push({ run, task });
  }

  for (const taskId of recurringTaskIds) {
    const summary = getDailyRunSummary(runSummaries, taskId, day.date);
    if (!summary) continue;
    const task = taskById.get(taskId);
    if (opts.missingTasksOnly && task) continue;
    const trigger = triggerForRun(summary.latestRun, task);
    const parsedCron = trigger?.type === 'cron' ? parseCron(trigger.expression) : null;
    day.occurrences.push({
      taskId,
      sourceTaskId: taskId,
      taskName: taskNameForRun(summary.latestRun, task),
      mode: 'recurring',
      timeLabel:
        trigger?.type === 'interval'
          ? '00:00-23:59'
          : parsedCron
            ? recurringTimeRangeForCron(parsedCron)
            : '00:00-23:59',
      state: summary.state,
      lastExecutionText: `上次 ${runTimeLabel(summary.latestRun.startedAt)} ${runStatusText(summary.state)}`,
      latestRunAt: summary.latestRun.startedAt,
      latestRunOutcome: summary.latestRun.outcome,
      runCount: summary.runCount,
    });
  }

  singleRuns
    .sort((a, b) => new Date(a.run.startedAt).getTime() - new Date(b.run.startedAt).getTime())
    .forEach(({ run, task }) => {
      day.occurrences.push({
        taskId: `${run.taskId}-${run.id}`,
        sourceTaskId: run.taskId,
        taskName: taskNameForRun(run, task),
        mode: 'single',
        timeLabel: runTimeLabel(run.startedAt),
        state: stateForRunOutcome(run.outcome),
        latestRunAt: run.startedAt,
        latestRunOutcome: run.outcome,
        runCount: 1,
      });
    });
}

export function buildCalendarWeek(
  baseDate: Date,
  weekOffset: number,
  tasks: ScheduledTaskItem[],
  runs: ScheduleRunItem[] = [],
): CalendarDayColumn[] {
  const monday = startOfWeekMonday(baseDate, weekOffset);
  const now = new Date();
  const days: CalendarDayColumn[] = Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + idx);
    return {
      date,
      dayIndex: idx,
      labelZh: WEEKDAY_ZH[idx]!,
      labelEn: WEEKDAY_EN[idx]!,
      dayOfMonth: date.getDate(),
      occurrences: [],
    };
  });
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));
  const runSummaries = buildRunSummaryMap(runs);
  const runsByDay = buildRunsByDay(monday, runs);

  for (const task of tasks) {
    const applicableDays = days.filter((day) => !isPastDay(day.date, now));
    if (task.trigger.type === 'interval') {
      for (const day of applicableDays) {
        day.occurrences.push(
          makeRecurringOccurrence(task, null, day.date, now, getDailyRunSummary(runSummaries, task.taskId, day.date)),
        );
      }
      continue;
    }
    if (task.trigger.type === 'once') {
      expandOnceForWeek(task, applicableDays, runSummaries);
      continue;
    }
    if (task.trigger.type !== 'cron') continue;
    const parsed = parseCron(task.trigger.expression);
    if (!parsed) continue;
    const mode = classifyCronDisplayMode(task.trigger.expression);
    if (mode === 'recurring') {
      for (const day of applicableDays) {
        if (!cronMatchesDay(parsed, day.date)) continue;
        day.occurrences.push(
          makeRecurringOccurrence(task, parsed, day.date, now, getDailyRunSummary(runSummaries, task.taskId, day.date)),
        );
      }
      continue;
    }
    expandFixedCronForWeek(task, parsed, applicableDays, runSummaries);
  }

  for (const day of days) {
    const dayRuns = runsByDay.get(day.dayIndex) ?? [];
    if (dayRuns.length === 0) continue;
    appendRunBackedOccurrences(day, dayRuns, taskById, runSummaries, {
      missingTasksOnly: !isPastDay(day.date, now),
    });
  }

  for (const day of days) {
    day.occurrences.sort(compareOccurrence);
  }
  return days;
}

// =============================================================================
// Edit Utils (from scheduled-task-edit-utils.ts)
// =============================================================================

export const SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON = '该定时任务仅支持通过对话进行编辑';

export type ScheduleTaskEditability =
  | { editable: true; draft: ScheduleTaskDraft; reason: null }
  | { editable: false; draft: null; reason: string };

function formatDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(
    date.getMinutes(),
  )}:${pad2(date.getSeconds())}`;
}

function parseCronWeekdayField(raw: string): string[] | null {
  const normalized = raw.trim().toUpperCase();
  if (!normalized || normalized === '*' || normalized === '?') return null;
  if (normalized.includes('/') || normalized.includes('-')) return null;

  const out = new Set<string>();
  for (const item of normalized.split(',')) {
    const text = item.trim();
    if (!text) continue;
    const num = Number(text);
    if (!Number.isFinite(num)) return null;
    if (num === 0 || num === 7) {
      out.add('7');
      continue;
    }
    if (num >= 1 && num <= 6) {
      out.add(String(num));
      continue;
    }
    return null;
  }
  return Array.from(out).sort((left, right) => Number(left) - Number(right));
}

function toDraftFrequency(
  trigger: ScheduleTrigger | null | undefined,
  localTimezone: string | undefined,
): ScheduleTaskDraft['frequency'] | null {
  if (!trigger || typeof trigger !== 'object' || !('type' in trigger)) return null;
  if (trigger.type === 'once') {
    return {
      type: 'once',
      executeTime: formatDateTimeLocal(new Date(trigger.fireAt)),
    };
  }

  if (trigger.type === 'interval') {
    const normalized = normalizeIntervalMs(trigger.ms);
    if (!normalized) return null;
    return {
      type: 'interval',
      interval: normalized.interval,
      unit: normalized.unit,
    };
  }

  if (trigger.type !== 'cron') return null;
  if (trigger.timezone && localTimezone && trigger.timezone !== localTimezone) {
    return null;
  }

  const parts = trigger.expression.trim().split(/\s+/);
  let secondField = '0';
  let minuteField = '';
  let hourField = '';
  let dayOfMonthField = '';
  let monthField = '';
  let dayOfWeekField = '';

  if (parts.length === 5) {
    [minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;
  } else if (parts.length === 6) {
    [secondField, minuteField, hourField, dayOfMonthField, monthField, dayOfWeekField] = parts;
  } else {
    return null;
  }

  if (secondField !== '0') return null;

  const minute = Number(minuteField);
  const hour = Number(hourField);
  if (!Number.isFinite(minute) || !Number.isFinite(hour) || minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    return null;
  }
  const time = `${pad2(hour)}:${pad2(minute)}:00`;

  const normalizedDayOfMonth = dayOfMonthField.trim();
  const normalizedMonth = monthField.trim();
  const normalizedDayOfWeek = dayOfWeekField.trim();
  if (normalizedMonth !== '*') return null;

  if (normalizedDayOfMonth !== '*') return null;
  if (normalizedDayOfWeek === '*' || normalizedDayOfWeek === '?') {
    return { type: 'daily', time };
  }

  const weekdays = parseCronWeekdayField(normalizedDayOfWeek);
  if (!weekdays || weekdays.length === 0) return null;
  if (weekdays.length === 7) return { type: 'daily', time };
  return { type: 'weekday', time, weekdays };
}

function resolveLocalTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

export function getScheduleTaskEditability(
  task: ScheduledTaskItem,
  localTimezone = resolveLocalTimezone(),
): ScheduleTaskEditability {
  const frequency = toDraftFrequency(task.trigger, localTimezone);
  if (!frequency) {
    return {
      editable: false,
      draft: null,
      reason: SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON,
    };
  }
  return {
    editable: true,
    reason: null,
    draft: {
      source: 'custom',
      taskName: task.taskName,
      prompt: task.prompt,
      frequency,
      enabled: task.enabled,
      sessionId: task.deliveryThreadId ?? null,
    },
  };
}
