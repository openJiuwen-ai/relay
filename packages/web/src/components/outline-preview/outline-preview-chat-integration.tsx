/*
 * *
 * * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type RefObject } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useAskUserQuestion } from '@/hooks/useAskUserQuestion';
import { OutlinePreviewPanel } from './OutlinePreviewPanel';
import { ResizeHandle } from '@/components/workspace/ResizeHandle';
import type { AskUserQuestionAnswer, PendingAskUserQuestion } from '@/stores/chat-types';

const PREVIEW_PANEL_MIN_WIDTH = 360;

interface OutlinePreviewSecondaryPaneProps {
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  previewPaneWidth?: number;
  isCompactPreviewLayout?: boolean;
  onResize: (delta: number) => void;
  onReset: () => void;
}

export function OutlinePreviewSecondaryPane({
  fullScreenContainerRef,
  previewPaneWidth,
  isCompactPreviewLayout = false,
  onResize,
  onReset,
}: OutlinePreviewSecondaryPaneProps) {
  const activeOutlinePreview = useChatStore((s) => s.activeOutlinePreview);
  const currentThreadId = useChatStore((s) => s.currentThreadId);

  // Get pendingQuestion from the hook - need to match threadId
  const { pendingQuestion, submitAnswer } = useAskUserQuestion(currentThreadId);

  if (!activeOutlinePreview) return null;

  const handleSubmit = async (payload: {
    request_id: string;
    source?: string;
    answers: AskUserQuestionAnswer[];
  }) => {
    await submitAnswer(payload);
  };

  return (
    <>
      {!isCompactPreviewLayout ? (
        <div data-testid="outline-preview-pane-resizer" className="flex shrink-0">
          <ResizeHandle direction="horizontal" onResize={onResize} onDoubleClick={onReset} />
        </div>
      ) : null}
      <aside
        data-testid="outline-preview-secondary-pane"
        className={
          isCompactPreviewLayout
            ? 'flex min-h-0 min-w-0 flex-1 overflow-hidden'
            : 'flex min-h-0 min-w-0 shrink-0 overflow-hidden'
        }
        style={
          !isCompactPreviewLayout && previewPaneWidth
            ? {
                width: `${previewPaneWidth}px`,
                flexShrink: 0,
                flexGrow: 0,
                flexBasis: `${previewPaneWidth}px`,
                minWidth: `${PREVIEW_PANEL_MIN_WIDTH}px`,
                maxWidth: `${previewPaneWidth}px`,
              }
            : isCompactPreviewLayout
              ? { minWidth: `${PREVIEW_PANEL_MIN_WIDTH}px` }
              : undefined
        }
      >
        <div className="flex h-full min-h-0 w-full min-w-0">
          <OutlinePreviewPanel
            active={activeOutlinePreview}
            fullScreenContainerRef={fullScreenContainerRef}
            pendingQuestion={pendingQuestion}
            onSubmit={handleSubmit}
          />
        </div>
      </aside>
    </>
  );
}

// Export a hook for checking if outline preview is active
export function useOutlinePreviewActive(): boolean {
  const rightPanelMode = useChatStore((s) => s.rightPanelMode);
  const activeOutlinePreview = useChatStore((s) => s.activeOutlinePreview);
  return rightPanelMode === 'outlinePreview' && activeOutlinePreview != null;
}