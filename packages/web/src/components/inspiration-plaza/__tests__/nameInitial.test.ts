/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { getDisplayInitial } from '../utils/nameInitial';

describe('getDisplayInitial', () => {
  it('uses uppercase Latin initials directly', () => {
    expect(getDisplayInitial('markdown')).toBe('M');
    expect(getDisplayInitial('Excel')).toBe('E');
  });

  it('derives pinyin initials for Chinese names', () => {
    expect(getDisplayInitial('技能编排')).toBe('J');
    expect(getDisplayInitial('智能体')).toBe('Z');
    expect(getDisplayInitial('写作助手')).toBe('X');
  });

  it('falls back to question mark for empty names', () => {
    expect(getDisplayInitial('')).toBe('?');
    expect(getDisplayInitial('   ')).toBe('?');
  });
});
