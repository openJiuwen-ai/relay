/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { buildNameInitialIconDataUrl, getNameInitial, getNameInitialIconTheme } from '../name-initial-icon';

describe('name initial icon utils', () => {
  it('normalizes initial as uppercase for latin letters', () => {
    expect(getNameInitial('gpt-5')).toBe('G');
  });

  it('supports non-latin initials and empty names', () => {
    expect(getNameInitial(' 缅因猫')).toBe('缅');
    expect(getNameInitial('   ')).toBe('#');
  });

  it('returns stable themed colors for same name and varying colors for different names', () => {
    const first = getNameInitialIconTheme('model-a');
    const second = getNameInitialIconTheme('model-a');
    const other = getNameInitialIconTheme('model-b');

    expect(first).toEqual(second);
    expect(first.background).not.toBe(other.background);
    expect(first.borderColor).not.toBe(other.borderColor);
  });

  it('builds deterministic icon data-url and changes with variant', () => {
    const first = buildNameInitialIconDataUrl('skill-demo', 1);
    const second = buildNameInitialIconDataUrl('skill-demo', 1);
    const third = buildNameInitialIconDataUrl('skill-demo', 2);

    expect(first).toBe(second);
    expect(first).toContain('data:image/svg+xml');
    expect(first).not.toBe(third);
  });
});
