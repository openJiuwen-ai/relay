/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { CronExpressionParser } from 'cron-parser';

/**
 * Calculate milliseconds until the next occurrence of a cron expression.
 * @param expression - Standard 5-field cron expression (e.g. "0 9 * * *")
 * @param timezone - Optional IANA timezone (default: system local)
 * @param currentDate - Reference time for calculating the next occurrence
 * @returns Positive integer ms until next fire
 * @throws If the expression is invalid
 */
export function getNextCronMs(expression: string, timezone?: string, currentDate = new Date()): number {
  const options: Record<string, unknown> = { currentDate };
  if (timezone) options.tz = timezone;
  const parsed = CronExpressionParser.parse(expression, options);
  const next = parsed.next().toDate();
  return Math.max(1, next.getTime() - currentDate.getTime());
}
