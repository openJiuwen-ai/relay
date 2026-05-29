/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { describe, expect, it } from 'vitest';
import { buildDensePptDisplaySlides } from '@/components/ppt-studio/ppt-display-slides';
import type { PptStudioSlide } from '@/components/ppt-studio/ppt-studio-types';

function slide(pageNumber: number, suffix = ''): PptStudioSlide {
  return {
    slideId: `slide-${pageNumber}${suffix}`,
    pageNumber,
    htmlPath: `pages/page-${pageNumber}.pptx.html`,
    title: null,
    blockCount: null,
    updatedAt: null,
  };
}

describe('buildDensePptDisplaySlides', () => {
  it('places page 3 in slot 3 when only page 3 exists (concurrent finish)', () => {
    const s3 = slide(3);
    const out = buildDensePptDisplaySlides([s3], 5, true, 0);
    expect(out).toEqual([undefined, undefined, s3, undefined, undefined]);
  });

  it('separates sparse pages 1 and 5 across slots (no duplicate page numbers in wrong slots)', () => {
    const s1 = slide(1);
    const s5 = slide(5);
    const out = buildDensePptDisplaySlides([s1, s5], 5, true, 0);
    expect(out).toEqual([s1, undefined, undefined, undefined, s5]);
  });

  it('returns empty array when no slides and no target width', () => {
    const out = buildDensePptDisplaySlides([], 0, false, 0);
    expect(out).toEqual([]);
  });

  it('expands strip when only high page exists and no expected count (generating)', () => {
    const s5 = slide(5);
    const out = buildDensePptDisplaySlides([s5], 0, true, 0);
    expect(out).toHaveLength(5);
    expect(out[0]).toBeUndefined();
    expect(out[4]).toBe(s5);
  });
});
