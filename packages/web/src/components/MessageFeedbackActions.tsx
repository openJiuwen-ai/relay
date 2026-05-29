/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import type { MessageFeedbackVote } from '@/hooks/useMessageFeedback';
import { useToastStore } from '@/stores/toastStore';
import { Button } from './shared/Button';
import { OverflowTooltip } from './shared/OverflowTooltip';

type FeedbackReaction = 'none' | 'like' | 'dislike';

type MessageFeedbackActionsProps = {
  messageId: string;
  catId?: string;
  alwaysVisible: boolean;
  value?: MessageFeedbackVote | null;
  onSubmit: (messageId: string, vote: MessageFeedbackVote, reason?: string) => Promise<void>;
};

const DISLIKE_DETAIL_MAX_LENGTH = 1000;

const DISLIKE_OPTIONS = [
  { label: '回答不准确', value: 'not_accurate' },
  { label: '回答不完整', value: 'not_complete' },
  { label: '存在事实错误', value: 'factual_error' },
  { label: '与问题不相关', value: 'not_relevant' },
  { label: '其他', value: 'other' },
] as const;

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4">
      <path d="M4.5 4.5L11.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.5 4.5L4.5 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function MessageFeedbackActions({ messageId, catId, alwaysVisible, value, onSubmit }: MessageFeedbackActionsProps) {
  const [isDislikeDialogOpen, setIsDislikeDialogOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  void catId;

  const reaction: FeedbackReaction = value === 1 ? 'like' : value === -1 ? 'dislike' : 'none';
  const visibilityClass = alwaysVisible
    ? 'opacity-100 pointer-events-auto'
    : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto';
  const canSubmit = Boolean(selectedReason) && !submitting;
  const detailCounter = useMemo(() => `${detail.length}/${DISLIKE_DETAIL_MAX_LENGTH}`, [detail.length]);

  const handleLike = useCallback(async () => {
    if (reaction === 'like' || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(messageId, 1);
    } catch {
      addToast({ type: 'error', title: '提交失败', message: '请稍后重试', duration: 2600 });
    } finally {
      setSubmitting(false);
    }
  }, [addToast, messageId, onSubmit, reaction, submitting]);

  const handleDetailChange = useCallback((next: string) => {
    setDetail(next.length > DISLIKE_DETAIL_MAX_LENGTH ? next.slice(0, DISLIKE_DETAIL_MAX_LENGTH) : next);
  }, []);

  const handleSubmitDislike = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const reason = selectedReason === 'other' ? `other:${detail.trim()}` : selectedReason;
      await onSubmit(messageId, -1, reason);
      setIsDislikeDialogOpen(false);
      setSelectedReason('');
      setDetail('');
      addToast({ type: 'success', title: '反馈已提交', message: '', duration: 2400 });
    } catch (error) {
      addToast({
        type: 'error',
        title: '提交失败',
        message: error instanceof Error && error.message ? error.message : '网络异常',
        duration: 2600,
      });
    } finally {
      setSubmitting(false);
    }
  }, [addToast, canSubmit, detail, messageId, onSubmit, selectedReason]);

  return (
    <>
      <div className={`${visibilityClass} transition-opacity`}>
        <div className="message-feedback-actions">
          <OverflowTooltip content={reaction === 'like' ? '已点赞' : '点赞'} forceShow className="relative inline-flex" gap={2}>
            <button
              type="button"
              onClick={() => void handleLike()}
              aria-label="点赞"
              disabled={submitting}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-[8px] transition-colors hover:bg-[rgba(0,0,0,0.04)] focus-visible:bg-[rgba(0,0,0,0.04)] disabled:opacity-50 ${reaction === 'like' ? 'is-active-like' : ''}`}
              data-testid="message-feedback-like"
            >
              <img
                src={reaction === 'like' ? '/icons/chart/liked.svg' : '/icons/chart/like.svg'}
                alt=""
                aria-hidden="true"
                className="message-feedback-icon"
              />
            </button>
          </OverflowTooltip>
          <OverflowTooltip content={reaction === 'dislike' ? '已点踩' : '点踩'} forceShow className="relative inline-flex" gap={2}>
            <button
              type="button"
              onClick={() => {
                if (reaction !== 'dislike') setIsDislikeDialogOpen(true);
              }}
              aria-label="点踩"
              disabled={submitting}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-[8px] transition-colors hover:bg-[rgba(0,0,0,0.04)] focus-visible:bg-[rgba(0,0,0,0.04)] disabled:opacity-50 ${reaction === 'dislike' ? 'is-active-dislike' : ''}`}
              data-testid="message-feedback-dislike"
            >
              <img
                src={reaction === 'dislike' ? '/icons/chart/disliked.svg' : '/icons/chart/dislike.svg'}
                alt=""
                aria-hidden="true"
                className="message-feedback-icon"
              />
            </button>
          </OverflowTooltip>
        </div>
      </div>

      {isDislikeDialogOpen ? (
        <div className="message-feedback-dialog-mask" role="dialog" aria-modal="true" aria-label="点踩反馈弹窗">
          <div className="message-feedback-dialog">
            <div className="message-feedback-dialog-content relative">
              <div className="message-feedback-dialog-header">
                <h3 className="message-feedback-dialog-title">告诉我们哪里不满意</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onlyIcon
                  hasBorder={false}
                  aria-label="关闭"
                  onClick={() => setIsDislikeDialogOpen(false)}
                  className="message-feedback-dialog-close"
                >
                  <CloseIcon />
                </Button>
              </div>
              <div className="message-feedback-reason-grid">
                {DISLIKE_OPTIONS.map((reason) => (
                  <label key={reason.value} className="message-feedback-reason-option">
                    <input
                      type="radio"
                      name={`message-feedback-${messageId}`}
                      checked={selectedReason === reason.value}
                      onChange={() => setSelectedReason(reason.value)}
                    />
                    <span>{reason.label}</span>
                  </label>
                ))}
              </div>
              <div className="message-feedback-detail-shell">
                <textarea
                  className="ui-textarea message-feedback-detail-input"
                  value={detail}
                  onChange={(event) => handleDetailChange(event.target.value)}
                  placeholder="可补充具体原因"
                />
                <span className="message-feedback-detail-counter">{detailCounter}</span>
              </div>
              <div className="message-feedback-dialog-actions">
                <Button variant="default" size="sm" onClick={handleSubmitDislike} disabled={!canSubmit}>
                  提交
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
