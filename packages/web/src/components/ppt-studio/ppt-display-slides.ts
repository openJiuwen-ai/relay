/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { PptStudioSlide } from './ppt-studio-types';

const DEFAULT_PLACEHOLDER_COUNT = 3;

/**
 * 按页码 1..N 铺槽：第 p 格仅承载 `pageNumber === p` 的 slide，无则 `undefined`（缩略条骨架）。
 * 避免并发先完成高页码时「把 slide 按到达顺序挤到左侧」导致角标与内容错位。
 */
export function buildDensePptDisplaySlides(
  slides: readonly PptStudioSlide[],
  expectedSlideCount: number,
  isGenerating: boolean,
  maxDisplayCountSoFar: number,
): (PptStudioSlide | undefined)[] {
  const maxPageFromSlides = slides.reduce((m, s) => Math.max(m, s.pageNumber), 0);
  let targetCount = expectedSlideCount > 0 ? expectedSlideCount : 0;
  if (targetCount === 0 && isGenerating) {
    targetCount = Math.max(maxDisplayCountSoFar, slides.length, DEFAULT_PLACEHOLDER_COUNT);
  }
  targetCount = Math.max(targetCount, maxPageFromSlides);

  if (targetCount === 0) {
    return [...slides];
  }

  const byPage = new Map<number, PptStudioSlide>();
  for (const s of slides) {
    byPage.set(s.pageNumber, s);
  }
  const out: (PptStudioSlide | undefined)[] = [];
  for (let p = 1; p <= targetCount; p++) {
    out.push(byPage.get(p));
  }
  return out;
}
