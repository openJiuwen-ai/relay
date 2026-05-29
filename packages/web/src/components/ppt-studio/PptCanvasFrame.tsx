/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo, useRef } from 'react';
import {
  buildPptSlideUrl,
  PPT_CANVAS_IFRAME_STYLE,
  PPT_CANVAS_SHELL_STYLE,
  PPT_CANVAS_STAGE_STYLE,
  PPT_PLACEHOLDER_MAIN_WEBP,
} from './ppt-preview-canvas';
import type { PptStudioSlide } from './ppt-studio-types';

interface PptCanvasFrameProps {
  slide: PptStudioSlide | null;
  projectRoot: string | null;
  pagesDir?: string | null;
}

export function PptCanvasFrame({
  slide,
  projectRoot,
  pagesDir,
  isGenerating: _isGenerating,
  children,
}: PptCanvasFrameProps & { isGenerating?: boolean; children?: React.ReactNode }) {
  void _isGenerating;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const slideUrl = useMemo(
    () => buildPptSlideUrl(projectRoot, slide, pagesDir),
    [slide, projectRoot, pagesDir],
  );

  // 只有 slide 为 null（占位符）时才显示 skeleton，已生成的 slide 不管是否正在生成都应显示 iframe
  if (!slide) {
    return (
      <div
        data-testid="ppt-canvas-stage"
        className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-4 py-6 bg-white gap-6"
        style={PPT_CANVAS_STAGE_STYLE}
      >
        <div
          data-testid="ppt-canvas-shell-placeholder"
          className="relative overflow-hidden rounded-[8px] border border-gray-200 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.04)] shrink-0"
          style={PPT_CANVAS_SHELL_STYLE}
        >
          {/* biome-ignore lint/performance/noImgElement: static WebP from /public */}
          <img
            src={PPT_PLACEHOLDER_MAIN_WEBP}
            alt=""
            decoding="async"
            className="absolute left-0 top-0 h-full w-full object-cover"
          />
        </div>
        {children && <div className="shrink-0">{children}</div>}
      </div>
    );
  }

  return (
    <div
      data-testid="ppt-canvas-stage"
      className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-4 py-6 bg-white gap-6"
      style={PPT_CANVAS_STAGE_STYLE}
    >
      <div
        data-testid="ppt-canvas-shell"
        className="relative overflow-hidden rounded-[8px] border border-gray-200 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.04)] shrink-0"
        style={PPT_CANVAS_SHELL_STYLE}
      >
        <iframe
          key={`ppt-canvas-${slide.pageNumber}`}
          ref={iframeRef}
          data-testid="ppt-canvas-frame"
          title={`PPT slide ${slide.pageNumber}`}
          src={slideUrl}
          sandbox="allow-scripts allow-same-origin"
          className="absolute left-0 top-0 border-0 bg-white"
          style={PPT_CANVAS_IFRAME_STYLE}
        />
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
