/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { normalizePptStudioApiQuery } from '@/stores/ppt-preview-store-helpers';
import { API_URL } from '@/utils/api-client';
import type { PptStudioSlide } from './ppt-studio-types';

export const PPT_SLIDE_WIDTH = 1280;
export const PPT_SLIDE_HEIGHT = 720;

/** 缩略图槽位未就绪时的静态底图（`public/`） */
export const PPT_PLACEHOLDER_THUMB_WEBP = '/images/ppt-preview/placeholder-thumb.webp';
/** 主画布占位（slide 为 null） */
export const PPT_PLACEHOLDER_MAIN_WEBP = '/images/ppt-preview/placeholder-main.webp';

export const PPT_CANVAS_STAGE_STYLE = { containerType: 'size' as const };

export const PPT_CANVAS_SHELL_STYLE = {
  width: `min(100cqw, calc((100cqh - 60px) * ${PPT_SLIDE_WIDTH} / ${PPT_SLIDE_HEIGHT}))`,
  height: `min(100cqh - 60px, calc(100cqw * ${PPT_SLIDE_HEIGHT} / ${PPT_SLIDE_WIDTH}))`,
};

export const PPT_CANVAS_IFRAME_STYLE = {
  width: `${PPT_SLIDE_WIDTH}px`,
  height: `${PPT_SLIDE_HEIGHT}px`,
  transformOrigin: '0 0',
  transform: `scale(min(calc(100cqw / ${PPT_SLIDE_WIDTH}px), calc((100cqh - 60px) / ${PPT_SLIDE_HEIGHT}px)))`,
};

export function buildPptSlideUrl(
  projectRoot: string | null,
  slide: PptStudioSlide | null,
  pagesDir?: string | null,
): string {
  if (!projectRoot?.trim() || !slide) return '';
  const root = pagesDir?.trim()
    ? normalizePptStudioApiQuery(projectRoot.trim(), pagesDir).projectRoot
    : projectRoot.trim();
  const params = new URLSearchParams({ projectRoot: root, path: slide.htmlPath });
  if (slide.updatedAt != null) params.set('v', String(slide.updatedAt));
  return `${API_URL}/api/ppt-studio/slide?${params.toString()}`;
}
