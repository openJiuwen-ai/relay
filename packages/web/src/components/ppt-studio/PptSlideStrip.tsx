/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useRef } from 'react';

import { buildPptSlideUrl, PPT_PLACEHOLDER_THUMB_WEBP } from './ppt-preview-canvas';
import { PPT_SLIDE_STRIP_ACTIVE_INNER_CLASS, PPT_SLIDE_STRIP_INACTIVE_INNER_CLASS } from './ppt-preview-selection';
import type { PptStudioSlide } from './ppt-studio-types';

interface PptSlideStripProps {
  slides: (PptStudioSlide | undefined)[];
  activeSlideId: string | null;
  projectRoot: string | null;
  pagesDir?: string | null;
  onSelect: (slideId: string) => void;
}

function isThumbActive(
  slide: PptStudioSlide | undefined,
  pageNum: number,
  activeSlideId: string | null,
  listIndex: number,
): boolean {
  if (!activeSlideId) return listIndex === 0;
  if (slide && activeSlideId === slide.slideId) return true;
  if (activeSlideId.startsWith('placeholder-')) {
    const ph = Number.parseInt(activeSlideId.slice('placeholder-'.length), 10);
    return Number.isFinite(ph) && ph === pageNum;
  }
  const slideRe = /^slide-(\d+)$/.exec(activeSlideId);
  if (slideRe) return Number.parseInt(slideRe[1] ?? '', 10) === pageNum;
  if (slide) return activeSlideId === slide.slideId;
  return false;
}

export function PptSlideStrip({
  slides,
  activeSlideId,
  projectRoot,
  pagesDir,
  onSelect,
  isGenerating: _isGenerating,
}: PptSlideStripProps & { isGenerating?: boolean }) {
  void _isGenerating;
  // slides 已由 PptStudioPanel 处理好（含占位符），这里直接渲染
  const displayItems = slides;
  const stripRef = useRef<HTMLDivElement>(null);

  // 纵向下滚轮映射为横向滚动；需非 passive 才能 preventDefault，避免与页面纵向滚动抢事件
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    const wheelOpts: AddEventListenerOptions = { passive: false };
    el.addEventListener('wheel', onWheel, wheelOpts);
    return () => el.removeEventListener('wheel', onWheel, wheelOpts);
  }, [displayItems.length]);

  if (displayItems.length === 0) return null;

  return (
    <div
      ref={stripRef}
      data-testid="ppt-slide-strip"
      className="flex w-full min-w-0 items-center gap-4 overflow-x-auto overflow-y-hidden px-6 py-5"
    >
      {displayItems.map((item, index) => {
        const slide = item as PptStudioSlide | undefined;
        const pageNum = slide ? slide.pageNumber : index + 1;
        const id = slide ? slide.slideId : `placeholder-${pageNum}`;
        const isActive = isThumbActive(slide, pageNum, activeSlideId, index);

        return (
          <button
            key={`ppt-page-${pageNum}`}
            data-testid={`ppt-slide-thumb-${pageNum}`}
            onClick={() => onSelect(id)}
            className="group relative flex shrink-0 cursor-pointer flex-col outline-none"
          >
            <div
              className={`relative flex h-[72px] w-[128px] items-center justify-center overflow-hidden rounded-[8px] transition-all ${
                isActive ? PPT_SLIDE_STRIP_ACTIVE_INNER_CLASS : PPT_SLIDE_STRIP_INACTIVE_INNER_CLASS
              }`}
            >
              <div
                className={`absolute right-1.5 top-1.5 z-10 flex h-[20px] w-[32px] items-center justify-center rounded-full text-[11px] font-bold shadow-sm transition-colors ${
                  isActive ? 'bg-[#1F1F1F] text-white' : 'bg-[#F2F2F2] text-[#4F4F4F]'
                }`}
              >
                {pageNum}
              </div>
              {/* 已有真实 slide 时直接显示 iframe，占位符（slide 为 undefined）才显 skeleton */}
              {projectRoot && slide ? (
                <iframe
                  title={`PPT slide ${slide.pageNumber} thumbnail`}
                  src={buildPptSlideUrl(projectRoot, slide, pagesDir)}
                  sandbox="allow-scripts allow-same-origin"
                  tabIndex={-1}
                  className="pointer-events-none absolute left-0 top-0 h-[720px] w-[1280px] origin-top-left scale-[0.1] border-0 bg-transparent"
                />
              ) : (
                // biome-ignore lint/performance/noImgElement: small static WebP from /public
                <img src={PPT_PLACEHOLDER_THUMB_WEBP} alt="" decoding="async" className="h-full w-full object-cover" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
