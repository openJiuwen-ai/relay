/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { formatCronFrequency } from '@/components/schedule/utils';

describe('formatCronFrequency', () => {
  it('formats every-minute cron', () => {
    expect(formatCronFrequency('* * * * *')).toBe('\u6bcf\u5206\u949f');
  });

  it('formats minute step cron', () => {
    expect(formatCronFrequency('*/5 * * * *')).toBe('\u6bcf\u9694 5 \u5206\u949f');
  });

  it('formats minute list and range-step cron', () => {
    expect(formatCronFrequency('5,35 * * * *')).toBe('\u6bcf\u5c0f\u65f6\u7b2c5\u300135\u5206\u949f');
    expect(formatCronFrequency('0-50/10 * * * *')).toBe('\u6bcf\u5c0f\u65f60-50\u5206\u949f\u6bcf\u9694 10 \u5206\u949f');
  });

  it('formats weekly range with hour step', () => {
    expect(formatCronFrequency('0 */2 * * 1-5')).toBe('\u6bcf\u5468\u4e00\u81f3\u4e94 \u6bcf\u9694 2 \u5c0f\u65f6\uff08\u7b2c0\u5206\u949f\uff09');
    expect(formatCronFrequency('0 8 * * MON-FRI')).toBe('\u6bcf\u5468\u4e00\u81f3\u4e94 \u4e0a\u5348 8\uff1a00');
    expect(formatCronFrequency('0 8 * * MONDAY-FRIDAY')).toBe('\u6bcf\u5468\u4e00\u81f3\u4e94 \u4e0a\u5348 8\uff1a00');
  });

  it('formats monthly and yearly cron', () => {
    expect(formatCronFrequency('0 8 1 * *')).toBe('\u6bcf\u67081\u53f7 \u4e0a\u5348 8\uff1a00');
    expect(formatCronFrequency('0 8 1 1 *')).toBe('\u6bcf\u5e741\u67081\u53f7 \u4e0a\u5348 8\uff1a00');
  });

  it('formats 6-field second-level cron', () => {
    expect(formatCronFrequency('*/15 * * * * *')).toBe('\u6bcf\u9694 15 \u79d2');
    expect(formatCronFrequency('30 * * * * *')).toBe('\u6bcf\u5206\u949f\u7b2c30\u79d2');
    expect(formatCronFrequency('0 */5 * * * *')).toBe('\u6bcf\u9694 5 \u5206\u949f');
    expect(formatCronFrequency('30 */5 * * * *')).toBe('\u6bcf\u9694 5 \u5206\u949f\uff08\u7b2c30\u79d2\uff09');
    expect(formatCronFrequency('0 */15 9-18 * * *')).toBe('\u6bcf\u5929 9\u70b9\u81f318\u70b9\u6bcf\u9694 15 \u5206\u949f');
  });

  it('falls back to raw expression when unsupported', () => {
    expect(formatCronFrequency('bad expression')).toBe('bad expression');
  });
});

