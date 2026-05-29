/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AskUserQuestionAnswer, AskUserQuestionItem } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { Button } from '../shared/Button';
import { extractOutlinePages, replaceOutlinePageLine } from './outline-parser';

const OUTLINE_CONFIRM_ID = 'outline_confirm';
const OUTLINE_USE_EDITED_ID = 'outline_use_edited';
const CARD_TIMEOUT_SECONDS = 300; // 固定 300 秒倒计时

interface OutlinePreviewCardProps {
  requestId: string;
  source?: string;
  questions: AskUserQuestionItem[];
  onSubmit: (payload: {
    request_id: string;
    source?: string;
    answers: AskUserQuestionAnswer[];
  }) => void;
  className?: string;
}

function joinClassName(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

interface OutlinePreviewLineProps {
  content: string;
  isEditing: boolean;
  editedContent: string;
  onStartEdit: () => void;
  onConfirmEdit: () => void;
  onCancelEdit: () => void;
  onContentChange: (content: string) => void;
}

function OutlinePreviewLine({
  content,
  isEditing,
  editedContent,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onContentChange,
}: OutlinePreviewLineProps) {
  return (
    <div className="flex items-center group hover:bg-gray-50 px-2 py-1.5 rounded min-h-[32px]">
      {/* 内容 */}
      {isEditing ? (
        <>
          <div className="relative flex-1">
            <input
              type="text"
              value={editedContent}
              onChange={(e) => onContentChange(e.target.value)}
              className="ui-input w-full pr-12 text-[14px]"
              autoFocus
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* 勾按钮 - 确认 */}
              <button
                type="button"
                onClick={onConfirmEdit}
                className="flex items-center justify-center w-[20px] h-[20px] hover:bg-gray-200 rounded"
                title="确认"
              >
                <img
                  src="/icons/check-line.svg"
                  alt="确认"
                  className="w-[14px] h-[14px]"
                />
              </button>
              {/* 叉按钮 - 取消 */}
              <button
                type="button"
                onClick={onCancelEdit}
                className="flex items-center justify-center w-[20px] h-[20px] hover:bg-gray-200 rounded"
                title="取消"
              >
                <img
                  src="/icons/cross-line.svg"
                  alt="取消"
                  className="w-[14px] h-[14px]"
                />
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <span className="flex-1 text-[14px] text-[var(--text-primary)] truncate">{content}</span>
          {/* 编辑按钮 - hover 显示 */}
          <button
            type="button"
            onClick={onStartEdit}
            className="opacity-0 group-hover:opacity-100 ml-2 flex items-center justify-center w-[24px] h-[24px] hover:bg-gray-200 rounded transition-opacity"
            title="编辑"
          >
            <img src="/icons/edit.svg" alt="编辑" className="w-[14px] h-[14px]" />
          </button>
        </>
      )}
    </div>
  );
}

export function OutlinePreviewCard({
  requestId,
  source,
  questions,
  onSubmit,
  className,
}: OutlinePreviewCardProps) {
  const preview = questions[0]?.preview;
  const initialText = preview?.text ?? '';
  const title = preview?.title || questions[0]?.header || '大纲审阅';

  const openOutlinePreview = useChatStore((s) => s.openOutlinePreview);
  const activeOutlinePreview = useChatStore((s) => s.activeOutlinePreview);
  const setOutlinePreviewConfirmed = useChatStore((s) => s.setOutlinePreviewConfirmed);
  const updateOutlinePreviewText = useChatStore((s) => s.updateOutlinePreviewText);

  // Local confirmed state (when user clicks confirm on this card or auto-confirm)
  const [localConfirmed, setLocalConfirmed] = useState(false);

  // Local edited text - stores edits made on the card before panel is opened
  const [localEditedText, setLocalEditedText] = useState(initialText);

  // Timer state: seconds left and whether timer is stopped (user clicked "查看详情")
  const [secondsLeft, setSecondsLeft] = useState(CARD_TIMEOUT_SECONDS);
  const [timerStopped, setTimerStopped] = useState(false);

  // Track if auto-confirm has been triggered to avoid duplicate calls
  const autoConfirmTriggered = useRef(false);

  // Line editing state: which page line is being edited and its edited content
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState<string>('');

  // Parse edited text to extract P-lines (page titles) - use localEditedText to show edits
  const pages = useMemo(() => extractOutlinePages(localEditedText), [localEditedText]);
  const hasPages = pages.length > 0;

  // Sync panel confirmed state to localConfirmed (so state persists after panel closes)
  useEffect(() => {
    if (activeOutlinePreview?.requestId === requestId && activeOutlinePreview?.isConfirmed === true) {
      setLocalConfirmed(true);
    }
  }, [activeOutlinePreview, requestId]);

  // Check if this card's requestId is confirmed in the store OR locally confirmed
  const isConfirmed = localConfirmed || (activeOutlinePreview?.requestId === requestId && activeOutlinePreview?.isConfirmed === true);

  // Countdown timer - runs every second until stopped or confirmed
  useEffect(() => {
    if (timerStopped || localConfirmed) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timerStopped, localConfirmed]);

  const handleOpenPanel = useCallback(() => {
    // Stop timer when user clicks "查看详情"
    setTimerStopped(true);
    // Cancel any ongoing edit before opening panel
    setEditingPageIndex(null);
    setEditingContent('');
    openOutlinePreview({
      requestId,
      source,
      initialText: localEditedText, // Use local edited text (includes any card edits)
      title,
      isConfirmed: localConfirmed,
    });
  }, [openOutlinePreview, requestId, source, localEditedText, title, localConfirmed]);

  const handleConfirm = useCallback(() => {
    // Mark local state as confirmed
    setLocalConfirmed(true);

    // If panel is open with matching requestId, sync confirmed state to store
    if (activeOutlinePreview && activeOutlinePreview.requestId === requestId) {
      setOutlinePreviewConfirmed(true);
    }

    // Check if there were any edits
    const hasEdits = localEditedText.trim() !== initialText.trim();
    const finalId = hasEdits ? OUTLINE_USE_EDITED_ID : OUTLINE_CONFIRM_ID;
    const finalText = hasEdits ? localEditedText.trim() : null;

    onSubmit({
      request_id: requestId,
      source,
      answers: [{
        question: questions[0]?.question ?? '',
        selected_options: [finalId],
        custom_input: finalText,
      }],
    });
  }, [activeOutlinePreview, setOutlinePreviewConfirmed, onSubmit, requestId, source, questions, localEditedText, initialText]);

  // Auto-confirm on 300s timeout (only if not stopped and not confirmed)
  useEffect(() => {
    if (secondsLeft === 0 && !localConfirmed && !timerStopped && !autoConfirmTriggered.current) {
      autoConfirmTriggered.current = true;
      handleConfirm();
    }
  }, [secondsLeft, localConfirmed, timerStopped, handleConfirm]);

  // Page line edit handlers
  const handleStartEdit = useCallback((pageIndex: number) => {
    setTimerStopped(true); // Stop timer when user starts editing
    setEditingPageIndex(pageIndex);
    setEditingContent(pages[pageIndex]?.displayText ?? '');
  }, [pages]);

  const handleCancelEdit = useCallback(() => {
    setEditingPageIndex(null);
    setEditingContent('');
  }, []);

  const handleConfirmEdit = useCallback(() => {
    if (editingPageIndex === null) return;

    const page = pages[editingPageIndex];
    if (!page) return;

    // Use replaceOutlinePageLine to update the text
    const newText = replaceOutlinePageLine(localEditedText, page, editingContent);

    // Update local edited text state
    setLocalEditedText(newText);

    // If panel is open with matching requestId, sync to store as well
    if (activeOutlinePreview && activeOutlinePreview.requestId === requestId) {
      updateOutlinePreviewText(newText);
    }

    // Clear editing state
    setEditingPageIndex(null);
    setEditingContent('');
  }, [editingPageIndex, editingContent, localEditedText, pages, activeOutlinePreview, requestId, updateOutlinePreviewText]);

  const handleContentChange = useCallback((content: string) => {
    setEditingContent(content);
  }, []);

  const rootClassName = joinClassName(
    'flex flex-col flex-1 min-h-0 bg-white rounded-[15px] overflow-hidden px-5 py-4 text-[var(--text-primary)]',
    className,
  );

  // Build confirm button text with countdown (only show when timer is running)
  const confirmButtonText = useMemo(() => {
    if (secondsLeft > 0 && !isConfirmed && !timerStopped) {
      return `确认 (${secondsLeft}s)`;
    }
    return '确认';
  }, [secondsLeft, isConfirmed, timerStopped]);

  return (
    <div className={joinClassName(
      'max-w-[85%] flex flex-col relative rounded-[16px] border border-[var(--content-header-border)]',
      hasPages ? 'w-[560px] max-h-[588px]' : 'w-auto',
    )}>
      <section className={rootClassName} data-testid="outline-preview-card-root">
        <header className={joinClassName('flex shrink-0 items-center justify-between gap-4', hasPages ? 'mb-3' : '')}>
          <div className="flex items-center gap-3">
            <img src="/icons/outline.svg" alt="大纲" className="w-[24px] h-[24px]" />
            <h2 className="min-w-0 flex-1 text-[16px] font-semibold leading-[1.4] text-[var(--text-primary)]">
              {title}
            </h2>
          </div>
        </header>

        {hasPages && (
          <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-1" data-testid="outline-preview-card-content">
            {pages.map((page, idx) => (
              <OutlinePreviewLine
                key={page.pageNumber}
                content={page.displayText}
                isEditing={editingPageIndex === idx}
                editedContent={editingContent}
                onStartEdit={() => handleStartEdit(idx)}
                onConfirmEdit={handleConfirmEdit}
                onCancelEdit={handleCancelEdit}
                onContentChange={handleContentChange}
              />
            ))}
          </div>
        )}

        <footer className={joinClassName('flex shrink-0 items-center gap-3', hasPages ? 'mt-4' : 'mt-2')}>
          <Button
            variant="default"
            size="sm"
            onClick={handleOpenPanel}
            data-testid="outline-preview-card-open-panel"
          >
            查看详情
          </Button>
          <Button
            color="major"
            onClick={handleConfirm}
            disabled={isConfirmed}
            data-testid="outline-preview-card-confirm"
          >
            {isConfirmed ? '已确认' : confirmButtonText}
          </Button>
        </footer>
      </section>
    </div>
  );
}