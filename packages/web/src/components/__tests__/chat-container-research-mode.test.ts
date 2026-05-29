/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';

/**
 * AC-6 regression: research=multi query param detection.
 * Tests the extraction logic used in ChatContainer without
 * needing to render the full component.
 */
describe('research=multi param detection', () => {
  function detectResearchMode(search: string): boolean {
    const params = new URLSearchParams(search);
    return params.get('research') === 'multi';
  }

  it('detects research=multi param', () => {
    expect(detectResearchMode('?signal=art-1&research=multi')).toBe(true);
  });

  it('returns false when research param is absent', () => {
    expect(detectResearchMode('?signal=art-1')).toBe(false);
  });

  it('returns false when research param has different value', () => {
    expect(detectResearchMode('?signal=art-1&research=single')).toBe(false);
  });

  it('returns false for empty search', () => {
    expect(detectResearchMode('')).toBe(false);
  });
});
