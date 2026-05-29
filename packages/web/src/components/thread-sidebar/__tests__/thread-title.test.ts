/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { normalizeStoredThreadTitleOrNull, sanitizeThreadTitleOrNull } from '../thread-title';

describe('thread title normalization', () => {
  it('keeps user-saved special-character titles intact', () => {
    expect(normalizeStoredThreadTitleOrNull('~')).toBe('~');
    expect(normalizeStoredThreadTitleOrNull(' ~~ ')).toBe('~~');
  });

  it('still treats special-character-only auto-generated titles as empty', () => {
    expect(sanitizeThreadTitleOrNull('~')).toBeNull();
    expect(sanitizeThreadTitleOrNull(' ~~ ')).toBeNull();
  });
});
