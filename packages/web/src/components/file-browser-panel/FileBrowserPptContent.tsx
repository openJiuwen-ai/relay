/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { PptCanvasFrame } from '@/components/ppt-studio/PptCanvasFrame';
import { PptSlideStrip } from '@/components/ppt-studio/PptSlideStrip';
import { buildDensePptDisplaySlides } from '@/components/ppt-studio/ppt-display-slides';
import type { PptStudioSlide } from '@/components/ppt-studio/ppt-studio-types';
import { QUICK_ACTION_TOKEN_PREFIX, QUICK_ACTION_TOKEN_SUFFIX } from '@/components/chat-input/utils/constants';
import { useChatStore } from '@/stores/chatStore';

const NAV_BTN =
  'flex h-8 w-8 items-center justify-center rounded-md border border-[#E3E8EF] bg-white text-[#4B5565] shadow-sm transition-colors hover:bg-[#F8FAFC] hover:text-[#1F2937] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DCE7FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-[#E3E8EF] disabled:bg-[#F3F5F7] disabled:text-[#99A1AD] disabled:shadow-sm';

function getDisplaySlideId(slide: PptStudioSlide | undefined, index: number): string {
  return slide?.slideId ?? `placeholder-${index + 1}`;
}

interface FileBrowserPptContentProps {
  /** The pagesDir of the matched PptStudioSession. */
  pagesDir: string;
  threadId: string;
}

/**
 * Renders PPT studio content (canvas + slide strip) without a PreviewPanelShell wrapper.
 * Reads session from chatStore via pagesDir, same as PptStudioPanel.
 * Intended to be used inside FileBrowserPreviewPane's shared shell.
 */
export function FileBrowserPptContent({ pagesDir, threadId }: FileBrowserPptContentProps) {
  const session = useChatStore((state) => {
    const sessions = state.pptStudioSessions ?? {};
    if (sessions[pagesDir]) return sessions[pagesDir];
    const forThread = Object.values(sessions).filter((s) => s.threadId === threadId);
    return forThread[forThread.length - 1] ?? null;
  });
  const hasActiveInvocation = useChatStore((state) => state.threadStates[threadId]?.hasActiveInvocation ?? false);
  const setPptStudioActiveSlide = useChatStore((s) => s.setPptStudioActiveSlide);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);
  const isGenerating = session?.status === 'generating' || hasActiveInvocation;
  const maxDisplayCountRef = useRef(0);

  const displaySlides = useMemo((): (PptStudioSlide | undefined)[] => {
    const slides = session?.slides ?? [];
    const expectedCount = session?.expectedSlideCount ?? 0;
    return buildDensePptDisplaySlides(slides, expectedCount, isGenerating, maxDisplayCountRef.current);
  }, [session, isGenerating]);

  useEffect(() => {
    if (isGenerating) {
      if (displaySlides.length > maxDisplayCountRef.current) maxDisplayCountRef.current = displaySlides.length;
    } else {
      maxDisplayCountRef.current = 0;
    }
  }, [displaySlides.length, isGenerating]);

  const activeSlide = useMemo(() => {
    if (!session) return null;
    if (session.activeSlideId) {
      const found = session.slides?.find((s) => s.slideId === session.activeSlideId);
      if (found) return found;
      if (session.activeSlideId.startsWith('placeholder-')) return null;
    }
    return session.slides?.[0] ?? null;
  }, [session]);

  const currentIndex = useMemo(() => {
    if (!session?.activeSlideId) return displaySlides.length ? 0 : -1;
    return displaySlides.findIndex((s, i) => getDisplaySlideId(s, i) === session.activeSlideId);
  }, [displaySlides, session?.activeSlideId]);

  useEffect(() => {
    if (!session || session.activeSlideId || !session.slides?.[0]) return;
    setPptStudioActiveSlide(session.pagesDir, session.slides[0].slideId);
  }, [session, setPptStudioActiveSlide]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      const prev = displaySlides[currentIndex - 1];
      if (session?.pagesDir) setPptStudioActiveSlide(session.pagesDir, getDisplaySlideId(prev, currentIndex - 1));
    }
  }, [currentIndex, displaySlides, session?.pagesDir, setPptStudioActiveSlide]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < displaySlides.length - 1) {
      const next = displaySlides[currentIndex + 1];
      if (session?.pagesDir) setPptStudioActiveSlide(session.pagesDir, getDisplaySlideId(next, currentIndex + 1));
    }
  }, [currentIndex, displaySlides, session?.pagesDir, setPptStudioActiveSlide]);

  const handleSelectSlide = useCallback(
    (slideId: string) => {
      if (session?.pagesDir) setPptStudioActiveSlide(session.pagesDir, slideId);
    },
    [session?.pagesDir, setPptStudioActiveSlide],
  );

  /** 点击「内容核查」按钮：将当前页核查 prompt 覆盖写入对话输入框，带蓝色 chip 标签 */
  const handleFactCheck = useCallback(() => {
    if (!activeSlide) return;
    const pageNum = activeSlide.pageNumber;
    // 使用快捷操作 token 格式，输入框会渲染成蓝色 chip 标签
    const label = '内容核查';
    const token = `${QUICK_ACTION_TOKEN_PREFIX}${label}${QUICK_ACTION_TOKEN_SUFFIX}`;
    const pageText = `第 ${pageNum} 页：核实所有内容的真实性，如果内容正确，请提供可点击的参考链接。否则，请指出错误之处并搜索与参考来源的相关内容。`;
    setPendingChatInsert({ threadId: currentThreadId, text: `${token} ${pageText}`, replaceAll: true });
  }, [activeSlide, currentThreadId, setPendingChatInsert]);

  if (!session) {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-400">PPT 会话加载中…</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <PptCanvasFrame
          slide={activeSlide}
          projectRoot={session.projectRoot ?? null}
          pagesDir={session.pagesDir}
          isGenerating={isGenerating}
        >
          <div data-testid="fb-ppt-nav-controls" className="flex shrink-0 items-center justify-center gap-4">
            <button
              type="button"
              aria-label="上一张幻灯片"
              title="上一张幻灯片"
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              className={NAV_BTN}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* 内容核查按钮 */}
            <button
              type="button"
              data-testid="fb-ppt-fact-check"
              aria-label="内容核查"
              title="内容核查：核实当前页内容真实性"
              onClick={handleFactCheck}
              disabled={!activeSlide}
              className={NAV_BTN}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <polyline points="9 11 11 13 15 9" />
              </svg>
            </button>

            <button
              type="button"
              aria-label="下一张幻灯片"
              title="下一张幻灯片"
              onClick={handleNext}
              disabled={currentIndex === -1 || currentIndex >= displaySlides.length - 1}
              className={NAV_BTN}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </PptCanvasFrame>
      </div>
      <div className="h-auto shrink-0 border-t border-gray-100 bg-white pb-4">
        <PptSlideStrip
          slides={displaySlides}
          activeSlideId={session.activeSlideId ?? null}
          projectRoot={session.projectRoot ?? null}
          pagesDir={session.pagesDir}
          isGenerating={isGenerating}
          onSelect={handleSelectSlide}
        />
      </div>
    </div>
  );
}
