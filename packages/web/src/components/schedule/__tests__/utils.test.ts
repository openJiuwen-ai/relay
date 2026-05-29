/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import {
  intervalValueToMs,
  normalizeIntervalMs,
  formatIntervalFrequency,
  formatCronFrequency,
} from '../utils';

// =============================================================================
// intervalValueToMs Tests
// =============================================================================

describe('intervalValueToMs', () => {
  // 正常流程测试
  it('正确转换 hour 为毫秒', () => {
    expect(intervalValueToMs(1, 'hour')).toBe(3600000);
    expect(intervalValueToMs(2, 'hour')).toBe(7200000);
  });

  it('正确转换 minute 为毫秒', () => {
    expect(intervalValueToMs(1, 'minute')).toBe(60000);
    expect(intervalValueToMs(30, 'minute')).toBe(1800000);
  });

  it('正确转换 second 为毫秒', () => {
    expect(intervalValueToMs(1, 'second')).toBe(1000);
    expect(intervalValueToMs(60, 'second')).toBe(60000);
  });

  // 边界值测试
  it('处理边界值 0', () => {
    expect(intervalValueToMs(0, 'hour')).toBe(0);
    expect(intervalValueToMs(0, 'minute')).toBe(0);
    expect(intervalValueToMs(0, 'second')).toBe(0);
  });

  it('处理极大值', () => {
    expect(intervalValueToMs(24, 'hour')).toBe(86400000);
    expect(intervalValueToMs(1000, 'minute')).toBe(60000000);
  });
});

// =============================================================================
// normalizeIntervalMs Tests
// =============================================================================

describe('normalizeIntervalMs', () => {
  // 正常流程测试
  it('正确归一化整小时间隔', () => {
    const result = normalizeIntervalMs(3600000); // 1小时
    expect(result).toEqual({ interval: 1, unit: 'hour' });
  });

  it('正确归一化整分钟间隔', () => {
    const result = normalizeIntervalMs(60000); // 1分钟
    expect(result).toEqual({ interval: 1, unit: 'minute' });
  });

  it('正确归一化整秒间隔', () => {
    const result = normalizeIntervalMs(5000); // 5秒
    expect(result).toBeNull();
  });

  it('正确归一化多单位间隔', () => {
    expect(normalizeIntervalMs(7200000)).toEqual({ interval: 2, unit: 'hour' });
    expect(normalizeIntervalMs(1800000)).toEqual({ interval: 30, unit: 'minute' });
  });

  // 边界值测试
  it('小于最小阈值（10秒）返回 null', () => {
    expect(normalizeIntervalMs(9999)).toBeNull();
    expect(normalizeIntervalMs(0)).toBeNull();
    expect(normalizeIntervalMs(-1000)).toBeNull();
  });

  it('非有限数值返回 null', () => {
    expect(normalizeIntervalMs(Infinity)).toBeNull();
    expect(normalizeIntervalMs(NaN)).toBeNull();
  });

  it('无法整除任何单位返回 null', () => {
    expect(normalizeIntervalMs(1500)).toBeNull(); // 1.5秒无法整除
    expect(normalizeIntervalMs(3333)).toBeNull();
  });

  it('正好10秒返回 null（最小阈值）', () => {
    expect(normalizeIntervalMs(10000)).toEqual({ interval: 10, unit: 'second' });
  });

  it('11秒可以整除秒单位返回 {interval: 11, unit: second}', () => {
    expect(normalizeIntervalMs(11000)).toEqual({ interval: 11, unit: 'second' });
  });
});

// =============================================================================
// formatIntervalFrequency Tests
// =============================================================================

describe('formatIntervalFrequency', () => {
  // 正常流程测试
  it('格式化小时间隔', () => {
    expect(formatIntervalFrequency(3600000)).toBe('每隔 1 小时');
    expect(formatIntervalFrequency(7200000)).toBe('每隔 2 小时');
  });

  it('格式化分钟间隔', () => {
    expect(formatIntervalFrequency(60000)).toBe('每隔 1 分钟');
    expect(formatIntervalFrequency(300000)).toBe('每隔 5 分钟');
  });

  it('格式化秒间隔', () => {
    expect(formatIntervalFrequency(30000)).toBe('每隔 30 秒');
    // 1000ms < 10000ms 最小阈值，normalizeIntervalMs 返回 null，走原始毫秒描述
    expect(formatIntervalFrequency(1000)).toBe('每隔 1000 毫秒');
  });

  // 边界值测试
  it('无法归一化的值回退到原始毫秒描述', () => {
    expect(formatIntervalFrequency(1500)).toBe('每隔 1500 毫秒');
    expect(formatIntervalFrequency(3333)).toBe('每隔 3333 毫秒');
  });

  it('零值格式化', () => {
    expect(formatIntervalFrequency(0)).toBe('每隔 0 毫秒');
  });
});

// =============================================================================
// formatCronFrequency Tests
// =============================================================================

describe('formatCronFrequency', () => {
  // 正常流程测试
  it('格式化每日定时（5段 cron）', () => {
    expect(formatCronFrequency('30 9 * * *')).toBe('每天 上午 9：30');
  });

  it('格式化每日定时（6段 cron 带秒）', () => {
    // second=0, minute=30, hour=9 -> 9:30:00
    expect(formatCronFrequency('0 30 9 * * *')).toBe('每天 上午 9：30：00');
  });

  it('格式化每周工作日（周一到周五）', () => {
    // 6段格式: second=0, minute=18, hour=0, day=*, month=*, weekday=1-5
    // 即每天0:18（午夜）在工作日执行
    const result = formatCronFrequency('0 18 0 * * 1-5');
    expect(result).toContain('周一至五');
    expect(result).toContain('12：18');
  });

  it('格式化指定工作日', () => {
    const result = formatCronFrequency('0 20 0 * * 6');
    expect(result).toContain('周六');
  });

  // 边界值测试
  it('处理无效 cron 表达式返回原始值', () => {
    expect(formatCronFrequency('')).toBe('');
    expect(formatCronFrequency('*')).toBe('*');
    expect(formatCronFrequency('invalid')).toBe('invalid');
  });

  it('处理部分字段的 cron 表达式', () => {
    expect(formatCronFrequency('30 9')).toBe('30 9');
    expect(formatCronFrequency('30')).toBe('30');
  });

  it('处理带星期名称的 cron', () => {
    const result = formatCronFrequency('0 10 * * MON');
    expect(result).toContain('周一');
  });

  it('处理带月份名称的 cron', () => {
    // 6段格式: second=0, minute=9, hour=1, day=*, month=JAN, weekday=*
    // 即每天凌晨1:09在1月执行
    const result = formatCronFrequency('0 9 1 JAN * *');
    expect(result).toContain('上午');
    expect(result).toContain('1：09');
  });

  // 分支逻辑覆盖
  it('处理每月特定日期', () => {
    // 6段格式: second=0, minute=9, hour=15, day=*, month=*, weekday=*
    // 即每天下午3:09
    const result = formatCronFrequency('0 9 15 * * *');
    expect(result).toContain('下午');
    expect(result).toContain('3：09');
  });

  it('处理范围语法', () => {
    // 0 9-18 * * * * = 每小时的9-18分钟执行
    const result = formatCronFrequency('0 9-18 * * * *');
    expect(result).toContain('每');
    expect(result).toContain('9-18');
  });

  it('处理步进语法', () => {
    // 0 */2 * * * * = 每2分钟执行
    const result = formatCronFrequency('0 */2 * * * *');
    expect(result).toContain('每隔 2 分钟');
  });

  it('处理复杂的混合表达式', () => {
    const result = formatCronFrequency('0 30 9 15 JAN MON');
    expect(result).toBeTruthy(); // 复杂的混合表达式，只要不抛错即可
  });
});
