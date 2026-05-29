/*
 * *
 * * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { MarkdownDocumentPreview } from '@/components/document-preview/MarkdownDocumentPreview';
import { PreviewPanelShell } from '@/components/preview-panels/PreviewPanelShell';
import { Button } from '@/components/shared/Button';
import type { ActiveOutlinePreview, AskUserQuestionAnswer, PendingAskUserQuestion } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';

const OUTLINE_CONFIRM_ID = 'outline_confirm';
const OUTLINE_USE_EDITED_ID = 'outline_use_edited';

interface OutlinePreviewPanelProps {
  active: ActiveOutlinePreview;
  fullScreenContainerRef?: RefObject<HTMLDivElement | null>;
  pendingQuestion: PendingAskUserQuestion | null;
  onSubmit: (payload: { request_id: string; source?: string; answers: AskUserQuestionAnswer[] }) => void;
}

export function OutlinePreviewPanel({
  active,
  fullScreenContainerRef,
  pendingQuestion,
  onSubmit,
}: OutlinePreviewPanelProps) {
  const [submitStatus, setSubmitStatus] = useState<'pending' | 'confirmed'>(
    active.isConfirmed ? 'confirmed' : 'pending',
  );
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateOutlinePreviewText = useChatStore((s) => s.updateOutlinePreviewText);
  const setOutlinePreviewMode = useChatStore((s) => s.setOutlinePreviewMode);
  const closeOutlinePreview = useChatStore((s) => s.closeOutlinePreview);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const setOutlinePreviewConfirmed = useChatStore((s) => s.setOutlinePreviewConfirmed);

  // Sync local submitStatus when store isConfirmed changes (from OutlinePreviewCard)
  useEffect(() => {
    if (active.isConfirmed) {
      setSubmitStatus('confirmed');
    }
  }, [active.isConfirmed]);

  // Validate requestId consistency between pendingQuestion and active
  useEffect(() => {
    if (pendingQuestion && active) {
      if (pendingQuestion.requestId !== active.requestId) {
        console.warn('[OutlinePreviewPanel] requestId mismatch:', {
          pendingRequestId: pendingQuestion.requestId,
          activeRequestId: active.requestId,
        });
        closeOutlinePreview();
      }
    }
  }, [pendingQuestion, active, closeOutlinePreview]);

  // Validate threadId consistency - auto-close if user switched threads
  useEffect(() => {
    if (active && active.threadId !== currentThreadId) {
      console.warn('[OutlinePreviewPanel] threadId mismatch, auto-closing:', {
        activeThreadId: active.threadId,
        currentThreadId,
      });
      closeOutlinePreview();
    }
  }, [active, currentThreadId, closeOutlinePreview]);

  // Focus textarea on edit mode
  useEffect(() => {
    if (active.panelMode === 'edit') {
      textareaRef.current?.focus();
    }
  }, [active.panelMode]);

  // Auto-detect if edited and submit accordingly
  const handleConfirm = useCallback(() => {
    setError(null);

    // Safety validation before submit
    if (!pendingQuestion) {
      setError('缺少问题数据，无法提交');
      return;
    }
    if (pendingQuestion.requestId !== active.requestId) {
      setError('请求 ID 不匹配，请刷新页面');
      return;
    }
    if (!pendingQuestion.questions[0]?.question) {
      setError('问题内容缺失');
      return;
    }

    const isEdited = active.editedText.trim() !== active.initialText.trim();
    const finalId = isEdited ? OUTLINE_USE_EDITED_ID : OUTLINE_CONFIRM_ID;
    const finalText = isEdited ? active.editedText.trim() : null;

    if (isEdited && !finalText) {
      setError('编辑内容不能为空');
      return;
    }

    setSubmitStatus('confirmed');
    // Sync confirmed state to store (so OutlinePreviewCard can also show confirmed)
    setOutlinePreviewConfirmed(true);
    setTimeout(() => {
      onSubmit({
        request_id: active.requestId,
        source: active.source,
        answers: [
          {
            question: pendingQuestion?.questions[0]?.question ?? '',
            selected_options: [finalId],
            custom_input: finalText,
          },
        ],
      });
      closeOutlinePreview();
    }, 1200);
  }, [active, pendingQuestion, onSubmit, closeOutlinePreview, setOutlinePreviewConfirmed]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateOutlinePreviewText(e.target.value);
    },
    [updateOutlinePreviewText],
  );

  return (
    <PreviewPanelShell
      panelTestId="outline-preview-panel"
      title={active.title}
      fullScreenContainerRef={fullScreenContainerRef}
      onRequestClose={closeOutlinePreview}
      hideBorderLeft={true}
      headerActions={
        submitStatus === 'pending' ? (
          <div className="flex items-center">
            {/* 预览图标按钮 */}
            <button
              type="button"
              onClick={() => setOutlinePreviewMode('preview')}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                active.panelMode === 'preview' ? 'border border-black' : 'bg-gray-100 hover:bg-gray-200'
              }`}
              title="预览"
              aria-label="预览模式"
            >
              <img
                src="/icons/eye.svg"
                alt=""
                aria-hidden="true"
                className={`w-[14px] h-[14px] ${
                  active.panelMode === 'preview' ? 'brightness-0' : 'brightness-0 opacity-0.4'
                }`}
              />
            </button>

            {/* 编辑图标按钮 */}
            <button
              type="button"
              onClick={() => setOutlinePreviewMode('edit')}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                active.panelMode === 'edit' ? 'border border-black' : 'bg-gray-100 hover:bg-gray-200'
              }`}
              title="编辑"
              aria-label="编辑模式"
            >
              <img
                src="/icons/edit.svg"
                alt=""
                aria-hidden="true"
                className={`w-[14px] h-[14px] ${
                  active.panelMode === 'edit' ? 'brightness-0' : 'brightness-0 opacity-0.4'
                }`}
              />
            </button>

            {/* gap 8px */}
            <div className="w-2" />

            {/* 确认大纲按钮（无倒计时） */}
            <Button variant="default" size="sm" onClick={handleConfirm} data-testid="outline-preview-panel-confirm">
              确认大纲
            </Button>
          </div>
        ) : (
          <Button variant="default" size="sm" disabled>
            已确认
          </Button>
        )
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Error message */}
        {error && (
          <div className="px-4 pt-2 text-sm text-red-500" data-testid="outline-preview-panel-error">
            {error}
          </div>
        )}

        {/* Content area - fills remaining height */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3" data-testid="outline-preview-panel-content">
          {active.panelMode === 'preview' ? (
            <MarkdownDocumentPreview source={active.editedText} className="text-sm" />
          ) : (
            <textarea
              ref={textareaRef}
              value={active.editedText}
              onChange={handleTextChange}
              className="ui-textarea block h-full min-h-0 w-full resize-none overflow-y-auto text-sm leading-relaxed border-none focus:outline-none"
              placeholder="请编辑大纲内容..."
              data-testid="outline-preview-panel-textarea"
            />
          )}
        </div>
      </div>
    </PreviewPanelShell>
  );
}