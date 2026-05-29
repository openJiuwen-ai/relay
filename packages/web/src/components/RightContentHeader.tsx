/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useDesktopWindowControls } from '@/hooks/useDesktopWindowControls';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';
import { useFeedbackPopoverStore } from '@/stores/feedbackPopoverStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { readPublicEnv } from '@/utils/client-env';
import { getDomainId, getIsSkipAuth } from '@/utils/userId';
import { normalizeStoredThreadTitle } from './thread-sidebar/thread-title';
import { Button } from './shared/Button';
import { OverflowTooltip } from './shared/OverflowTooltip';

let hasAttemptedFeedbackAutoOpenThisSession = false;

function WindowSmileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6.1" cy="6.6" r="0.7" fill="currentColor" />
      <circle cx="9.9" cy="6.6" r="0.7" fill="currentColor" />
      <path
        d="M5.5 9.2C6.1 10.1 7 10.6 8 10.6C9 10.6 9.9 10.1 10.5 9.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WindowMinimizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M4 8H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function WindowMaximizeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="4.25" y="4.25" width="7.5" height="7.5" rx="0.9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function WindowRestoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5.75 4.25H10.1C10.984 4.25 11.7 4.966 11.7 5.85V10.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.25 5.75H5.9C5.016 5.75 4.3 6.466 4.3 7.35V11.1C4.3 11.984 5.016 12.7 5.9 12.7H10.25C11.134 12.7 11.85 11.984 11.85 11.1V7.35C11.85 6.466 11.134 5.75 10.25 5.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function WindowCloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 5L11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11 5L5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PopoverCloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4.75 4.75L11.25 11.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.25 4.75L4.75 11.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function HeaderWorkspaceIcon() {
  return (
    <img
      data-testid="thread-workspace-icon"
      src="/icons/chart/folder.svg"
      alt=""
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    />
  );
}

type HeaderActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'type'> & {
  title: string;
  children: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement>;
};

function HeaderAction({ title, children, buttonRef, ...buttonProps }: HeaderActionProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="ui-content-header-action"
      title={title}
      aria-label={title}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

function RightPanelToggleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-transform ${isOpen ? '' : 'rotate-180'}`}
      aria-hidden
    >
      <rect
        x="2.5"
        y="2.5"
        width="15"
        height="15"
        rx="2.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <line
        x1="14"
        y1="2.75"
        x2="14"
        y2="17.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface RightContentHeaderPanelToggle {
  isOpen: boolean;
  onToggle: () => void;
  openLabel: string;
  closeLabel: string;
}

export interface RightContentHeaderProps {
  leftContent?: ReactNode;
  panelToggle?: RightContentHeaderPanelToggle;
}

type IssueOption = {
  id: string;
  label: string;
  hint?: string;
};

const SATISFACTION_SCORES = Array.from({ length: 11 }, (_, index) => index);
const LOW_SCORE_ISSUE_OPTIONS: IssueOption[] = [
  {
    id: 'ai_output_inaccurate',
    label: 'AI输出不准确',
  },
  {
    id: 'ui_unattractive',
    label: '界面不美观',
  },
  {
    id: 'ai_intent_understanding_weak',
    label: 'AI意图理解不到位',
  },
  {
    id: 'operation_inconvenient',
    label: '操作不便利',
  },
  {
    id: 'features_or_tools_limited',
    label: '功能/工具不丰富',
  },
  {
    id: 'security_reliability_low',
    label: '安全可靠性低',
  },
  {
    id: 'slow_and_laggy',
    label: '运行缓慢卡顿',
  },
  {
    id: 'other_issue',
    label: '其他问题',
  },
];
const HIGH_SCORE_ISSUE_OPTIONS: IssueOption[] = [
  {
    id: 'ai_output_accurate',
    label: 'AI输出准确无误',
  },
  {
    id: 'ui_beautiful',
    label: '界面美观',
  },
  {
    id: 'ai_intent_understanding_strong',
    label: 'AI意图理解能力强',
  },
  {
    id: 'operation_convenient_and_smooth',
    label: '操作便捷流畅',
  },
  {
    id: 'features_or_tools_rich',
    label: '功能/工具丰富',
  },
  {
    id: 'secure_and_reliable',
    label: '安全可靠',
  },
  {
    id: 'efficient_and_stable',
    label: '运行高效稳定',
  },
  {
    id: 'other_issue',
    label: '其他问题',
  },
];
const FEEDBACK_DATE_ENDPOINT = 'https://voc.huaweicloud.com/survey-api/api/get/commit/date';
const FEEDBACK_SAVE_ENDPOINT = 'https://voc.huaweicloud.com/survey-api/api/save';
const FEEDBACK_CLOSE_TIME_KEY = 'feedbackCloseTime';
const FEEDBACK_CLOSE_SUPPRESS_DAYS = 30;
const FEEDBACK_RESURFACE_DAYS = 120;
const FEEDBACK_AUTO_CLOSE_DELAY_MS = 60_000;
const FEEDBACK_MOUSE_LEAVE_CLOSE_DELAY_MS = 120;
const DEFAULT_FEEDBACK_SAVE_SURVEY_ID = 'hwcloudbusurvey_key_fbd25bdbdb87';
const DEFAULT_FEEDBACK_SAVE_SERVICE_ID = 'OfficeClaw';
const DEFAULT_FEEDBACK_SAVE_CONTACT_ID = 'global.cf';
const SCORE_QUESTION_ID = 'question_0';
const LOW_SCORE_REASON_QUESTION_ID = 'question_1';
const HIGH_SCORE_REASON_QUESTION_ID = 'question_2';
const DETAIL_QUESTION_ID = 'question_99';
const SCORE_REASON_DEFAULT_REASON = '0';
const DETAIL_DEFAULT_SUB_REMARK = 'null';
const DETAIL_DEFAULT_REASON = '0';
const OTHER_ISSUE_MAX_LENGTH = 400;
const OTHER_ISSUE_LENGTH_ERROR_MESSAGE = '\u8bf7\u5c06\u5185\u5bb9\u63a7\u5236\u5728400\u5b57\u4ee5\u5185';
const DETAIL_MAX_LENGTH = 1000;
const DETAIL_LENGTH_ERROR_MESSAGE = '\u8bf7\u5c06\u5185\u5bb9\u63a7\u5236\u57281000\u5b57\u7b26\u4ee5\u5185';
const DETAIL_PREFILL_TEMPLATE = '\u3010\u4f7f\u7528\u573a\u666f\u3011\uff1a\n\u3010\u4f18\u5316\u610f\u89c1\u3011\uff1a';
const REQUIRED_SELECT_ERROR_MESSAGE = '\u9009\u62e9\u4e0d\u80fd\u4e3a\u7a7a';
const REQUIRED_INPUT_ERROR_MESSAGE = '\u8f93\u5165\u4e0d\u80fd\u4e3a\u7a7a';
const LOW_SCORE_PRIMARY_TITLE = '您在使用过程中遇到了哪些问题？';
const HIGH_SCORE_PRIMARY_TITLE = '您感到满意的原因是？';
const PRIMARY_SUBTITLE = '（选择您最关注的三项）';
const LOW_SCORE_DETAIL_TITLE = '请您反馈遇到的具体问题，帮助我们准确评估并优化';
const DETAIL_SUBMIT_TITLE = '您还有其它意见和建议吗？';
const HIGH_SCORE_DETAIL_TITLE = DETAIL_SUBMIT_TITLE;
const HIGH_SCORE_DETAIL_SUBTITLE = '(可选)';

function hasMeaningfulDetail(value: string): boolean {
  const normalizedValue = value.trim();
  if (!normalizedValue) return false;

  return normalizedValue !== DETAIL_PREFILL_TEMPLATE.trim();
}

function getSelectedScoreIconSrc(score: number): string | null {
  if (score <= 6) return '/icons/nss/1.svg';
  if (score <= 8) return '/icons/nss/2.svg';
  if (score <= 10) return '/icons/nss/3.svg';
  return null;
}

function parseFeedbackDate(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const timestamp = new Date(normalized.replace(' ', 'T')).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isWithinDays(timestamp: number, days: number): boolean {
  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function getThreadIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/thread\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getFolderNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized ?? null;
}

function hasCompletedOneDialogueRound(messages: ChatMessage[]): boolean {
  let hasUserMessage = false;
  let hasAssistantMessage = false;

  for (const message of messages) {
    if (message.type === 'user') hasUserMessage = true;
    if (message.type === 'assistant') hasAssistantMessage = true;
    if (hasUserMessage && hasAssistantMessage) return true;
  }

  return false;
}

function getFeedbackUserId(): string {
  return readPublicEnv('NEXT_PUBLIC_FEEDBACK_SAVE_W3ACCOUNT')?.trim() || getDomainId();
}

function getFeedbackCloseStorageKey(): string {
  const domainId = getDomainId()?.trim();
  return domainId ? `${FEEDBACK_CLOSE_TIME_KEY}:${domainId}` : FEEDBACK_CLOSE_TIME_KEY;
}

export function __resetFeedbackAutoOpenSessionForTests() {
  hasAttemptedFeedbackAutoOpenThisSession = false;
}

export function __resetFeedbackPopoverStateForTests() {
  const state = useFeedbackPopoverStore.getState();
  state.resetFeedbackPopoverState();
  state.resetFeedbackFormState();
}

type FeedbackDateResponse = {
  data?: string | { latest_feedback_date?: string };
  latest_feedback_date?: string;
};

type FeedbackSubmitAnswer = {
  questionId: string;
  subQuestionId: string | null;
  subName: string;
  answer: string;
  subRemark?: string;
  reason?: string;
};

type FeedbackSubmitResponse = {
  error_code?: string;
  error_msg?: string;
  errorCode?: string;
  errorMsg?: string;
  msg?: string;
  code?: string | number;
  feedback_data?: string;
  message?: string;
  error?: string;
};

export function RightContentHeader({ leftContent, panelToggle }: RightContentHeaderProps = {}) {
  const { isMaximized, canMaximize, minimize, toggleMaximize, close, startDrag } = useDesktopWindowControls();
  const { pathname } = useLocation();
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const threads = useChatStore((s) => s.threads);
  const rightPanelMode = useChatStore((s) => s.rightPanelMode);
  const openFileBrowserPanel = useChatStore((s) => s.openFileBrowserPanel);
  const setRightPanelMode = useChatStore((s) => s.setRightPanelMode);
  const isFileBrowserOpen = rightPanelMode === 'fileBrowser';

  const handleToggleFileBrowser = useCallback(() => {
    if (isFileBrowserOpen) {
      setRightPanelMode('status');
    } else {
      openFileBrowserPanel();
    }
  }, [isFileBrowserOpen, openFileBrowserPanel, setRightPanelMode]);
  const isLoadingHistory = useChatStore((s) => s.isLoadingHistory);
  const messages = useChatStore((s) => s.messages);
  const isFeedbackOpen = useFeedbackPopoverStore((s) => s.isFeedbackOpen);
  const isAutoOpenedFeedback = useFeedbackPopoverStore((s) => s.isAutoOpenedFeedback);
  const selectedScore = useFeedbackPopoverStore((s) => s.selectedScore);
  const lowScoreSelectedIssues = useFeedbackPopoverStore((s) => s.lowScoreSelectedIssues);
  const highScoreSelectedIssues = useFeedbackPopoverStore((s) => s.highScoreSelectedIssues);
  const lowScoreDetail = useFeedbackPopoverStore((s) => s.lowScoreDetail);
  const lowScoreOtherIssueDetail = useFeedbackPopoverStore((s) => s.lowScoreOtherIssueDetail);
  const highScoreOtherIssueDetail = useFeedbackPopoverStore((s) => s.highScoreOtherIssueDetail);
  const setFeedbackPopoverState = useFeedbackPopoverStore((s) => s.setFeedbackPopoverState);
  const setSelectedScore = useFeedbackPopoverStore((s) => s.setSelectedScore);
  const setLowScoreSelectedIssues = useFeedbackPopoverStore((s) => s.setLowScoreSelectedIssues);
  const setHighScoreSelectedIssues = useFeedbackPopoverStore((s) => s.setHighScoreSelectedIssues);
  const setLowScoreDetail = useFeedbackPopoverStore((s) => s.setLowScoreDetail);
  const setLowScoreOtherIssueDetail = useFeedbackPopoverStore((s) => s.setLowScoreOtherIssueDetail);
  const setHighScoreOtherIssueDetail = useFeedbackPopoverStore((s) => s.setHighScoreOtherIssueDetail);
  const resetFeedbackFormState = useFeedbackPopoverStore((s) => s.resetFeedbackFormState);
  const [feedbackPopoverMaxHeight, setFeedbackPopoverMaxHeight] = useState<number | null>(null);
  const [isDetailTooLong, setIsDetailTooLong] = useState(false);
  const [isIssueRequiredError, setIsIssueRequiredError] = useState(false);
  const [isOtherIssueRequiredError, setIsOtherIssueRequiredError] = useState(false);
  const [isDetailRequiredError, setIsDetailRequiredError] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const headerRef = useRef<HTMLDivElement>(null);
  const smileActionRef = useRef<HTMLButtonElement>(null);
  const feedbackPopoverRef = useRef<HTMLDivElement | null>(null);
  const autoCloseFeedbackTimerRef = useRef<number | null>(null);
  const mouseLeaveCloseTimerRef = useRef<number | null>(null);
  const selectedScoreRef = useRef<number | null>(null);
  const feedbackPopoverId = useId();
  const isScoreUnselected = selectedScore == null;
  const isVeryLowScoreDetailVisible = selectedScore != null && selectedScore <= 6;
  const isLowScoreDetailVisible = selectedScore != null && selectedScore <= 8;
  const isHighScoreDetailVisible = selectedScore != null && selectedScore >= 9;
  const currentIssueOptions = isHighScoreDetailVisible ? HIGH_SCORE_ISSUE_OPTIONS : LOW_SCORE_ISSUE_OPTIONS;
  const currentSelectedIssues = isHighScoreDetailVisible ? highScoreSelectedIssues : lowScoreSelectedIssues;
  const currentOtherIssueDetail = isHighScoreDetailVisible ? highScoreOtherIssueDetail : lowScoreOtherIssueDetail;
  const routeThreadId = getThreadIdFromPathname(pathname ?? '');
  const currentThread = routeThreadId === currentThreadId ? threads.find((thread) => thread.id === currentThreadId) : null;
  const threadTitle = currentThread ? normalizeStoredThreadTitle(currentThread.title) : null;
  const workspacePath = currentThread?.projectPath?.trim() ?? '';
  const shouldShowWorkspace = Boolean(workspacePath && workspacePath !== 'default');
  const workspaceLabel = shouldShowWorkspace ? getFolderNameFromPath(workspacePath) || workspacePath : null;

  const handleOpenWorkspace = useCallback(async () => {
    if (!shouldShowWorkspace) return;
    try {
      const res = await apiFetch('/api/projects/open-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message =
          typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : `无法打开当前会话的工作空间目录（状态码 ${res.status}）`;
        throw new Error(message);
      }
    } catch (error) {
      console.error('Failed to open workspace directory:', error);
      addToast({
        type: 'error',
        title: '打开工作空间失败',
        message: error instanceof Error && error.message.trim() ? error.message : '无法打开当前会话的工作空间目录',
        duration: 2400,
      });
    }
  }, [addToast, shouldShowWorkspace, workspacePath]);
  const isOtherIssueSelected = currentSelectedIssues.includes('other_issue');
  const isOtherIssueTooLong = isOtherIssueSelected && currentOtherIssueDetail.length > OTHER_ISSUE_MAX_LENGTH;
  const currentSurveyTitle = '\u60a8\u7684\u4f7f\u7528\u4f53\u9a8c\u5982\u4f55\uff1f\u6211\u4eec\u671f\u5f85\u503e\u542c';
  const currentPrimaryTitle = isHighScoreDetailVisible ? HIGH_SCORE_PRIMARY_TITLE : LOW_SCORE_PRIMARY_TITLE;
  const currentPrimarySubtitle = PRIMARY_SUBTITLE;
  const currentDetailTitle = isHighScoreDetailVisible ? HIGH_SCORE_DETAIL_TITLE : LOW_SCORE_DETAIL_TITLE;
  const currentDetailSubtitle = isHighScoreDetailVisible ? HIGH_SCORE_DETAIL_SUBTITLE : null;
  const currentDetailMaxLength = DETAIL_MAX_LENGTH;
  const currentDetailPlaceholder = DETAIL_PREFILL_TEMPLATE;
  const isDetailRequired = isLowScoreDetailVisible;
  const resetFeedbackState = useCallback(() => {
    resetFeedbackFormState();
    setIsDetailTooLong(false);
    setIsIssueRequiredError(false);
    setIsOtherIssueRequiredError(false);
    setIsDetailRequiredError(false);
    setIsSubmittingFeedback(false);
  }, [resetFeedbackFormState]);
  const closeFeedbackPopover = useCallback(() => {
    if (autoCloseFeedbackTimerRef.current != null) {
      window.clearTimeout(autoCloseFeedbackTimerRef.current);
      autoCloseFeedbackTimerRef.current = null;
    }
    if (mouseLeaveCloseTimerRef.current != null) {
      window.clearTimeout(mouseLeaveCloseTimerRef.current);
      mouseLeaveCloseTimerRef.current = null;
    }
    setFeedbackPopoverState({ isFeedbackOpen: false, isAutoOpenedFeedback: false });
    setFeedbackPopoverMaxHeight(null);
    resetFeedbackState();
  }, [resetFeedbackState, setFeedbackPopoverState]);
  const dismissFeedbackPopover = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getFeedbackCloseStorageKey(), String(Date.now()));
    }
    closeFeedbackPopover();
  }, [closeFeedbackPopover]);
  const openFeedbackPopoverManually = useCallback(() => {
    if (autoCloseFeedbackTimerRef.current != null) {
      window.clearTimeout(autoCloseFeedbackTimerRef.current);
      autoCloseFeedbackTimerRef.current = null;
    }
    if (mouseLeaveCloseTimerRef.current != null) {
      window.clearTimeout(mouseLeaveCloseTimerRef.current);
      mouseLeaveCloseTimerRef.current = null;
    }
    setFeedbackPopoverState({ isFeedbackOpen: true, isAutoOpenedFeedback: false });
  }, [setFeedbackPopoverState]);
  const cancelMouseLeaveClose = useCallback(() => {
    if (mouseLeaveCloseTimerRef.current != null) {
      window.clearTimeout(mouseLeaveCloseTimerRef.current);
      mouseLeaveCloseTimerRef.current = null;
    }
  }, []);
  const scheduleMouseLeaveClose = useCallback(() => {
    if (selectedScoreRef.current != null) return;
    cancelMouseLeaveClose();
    mouseLeaveCloseTimerRef.current = window.setTimeout(() => {
      mouseLeaveCloseTimerRef.current = null;
      if (selectedScoreRef.current == null) {
        closeFeedbackPopover();
      }
    }, FEEDBACK_MOUSE_LEAVE_CLOSE_DELAY_MS);
  }, [cancelMouseLeaveClose, closeFeedbackPopover]);

  useEffect(() => {
    selectedScoreRef.current = selectedScore;
  }, [selectedScore]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (getIsSkipAuth()) return;
    if (hasAttemptedFeedbackAutoOpenThisSession) return;

    const routeThreadId = getThreadIdFromPathname(pathname ?? '');
    if (!routeThreadId || routeThreadId !== currentThreadId) return;
    if (isLoadingHistory) return;
    if (!hasCompletedOneDialogueRound(messages)) return;

    hasAttemptedFeedbackAutoOpenThisSession = true;

    const dismissedAtRaw = window.localStorage.getItem(getFeedbackCloseStorageKey());
    const dismissedAt = dismissedAtRaw ? Number(dismissedAtRaw) : Number.NaN;
    if (Number.isFinite(dismissedAt) && isWithinDays(dismissedAt, FEEDBACK_CLOSE_SUPPRESS_DAYS)) {
      return;
    }

    const surveyId = readPublicEnv('NEXT_PUBLIC_FEEDBACK_SAVE_SURVEY_ID')?.trim() || DEFAULT_FEEDBACK_SAVE_SURVEY_ID;
    const serviceId = readPublicEnv('NEXT_PUBLIC_FEEDBACK_SAVE_SERVICE_ID')?.trim() || DEFAULT_FEEDBACK_SAVE_SERVICE_ID;
    const contactId = readPublicEnv('NEXT_PUBLIC_FEEDBACK_SAVE_CONTACT_ID')?.trim() || DEFAULT_FEEDBACK_SAVE_CONTACT_ID;
    const userId = getFeedbackUserId();
    const query = new URLSearchParams({
      userId,
      surveyId,
      serviceId,
      contactId,
    });
    let cancelled = false;

    const fetchLatestFeedbackDate = async () => {
      try {
        const response = await fetch(`${FEEDBACK_DATE_ENDPOINT}?${query.toString()}`, {
          method: 'GET',
        });
        if (cancelled) return;
        if (!response.ok) {
          resetFeedbackState();
          setFeedbackPopoverState({ isFeedbackOpen: true, isAutoOpenedFeedback: true });
          return;
        }

        const payload = (await response.json()) as FeedbackDateResponse;
        if (cancelled) return;
        const latestFeedbackDate =
          typeof payload?.latest_feedback_date === 'string'
            ? payload.latest_feedback_date
            : typeof payload?.data === 'string'
              ? payload.data
              : typeof payload?.data?.latest_feedback_date === 'string'
                ? payload.data.latest_feedback_date
                : '';
        const latestFeedbackTimestamp = latestFeedbackDate ? parseFeedbackDate(latestFeedbackDate) : null;

        if (!latestFeedbackTimestamp || !isWithinDays(latestFeedbackTimestamp, FEEDBACK_RESURFACE_DAYS)) {
          resetFeedbackState();
          setFeedbackPopoverState({ isFeedbackOpen: true, isAutoOpenedFeedback: true });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        resetFeedbackState();
        setFeedbackPopoverState({ isFeedbackOpen: true, isAutoOpenedFeedback: true });
      }
    };

    void fetchLatestFeedbackDate();

    return () => {
      cancelled = true;
    };
  }, [currentThreadId, isLoadingHistory, messages, pathname, resetFeedbackState, setFeedbackPopoverState]);

  useEffect(() => {
    if (isLowScoreDetailVisible) return;
    setIsIssueRequiredError(false);
    setIsOtherIssueRequiredError(false);
  }, [isLowScoreDetailVisible]);

  useEffect(() => {
    if ((isLowScoreDetailVisible || isHighScoreDetailVisible) && !lowScoreDetail.trim()) {
      setLowScoreDetail(DETAIL_PREFILL_TEMPLATE);
      setIsDetailTooLong(false);
      setIsDetailRequiredError(false);
      return;
    }

    if (!isLowScoreDetailVisible) {
      setIsDetailRequiredError(false);
    }
  }, [isHighScoreDetailVisible, isLowScoreDetailVisible, lowScoreDetail, setLowScoreDetail]);

  useEffect(() => {
    if (!isFeedbackOpen) return;

    const updatePopoverMaxHeight = () => {
      const buttonRect = smileActionRef.current?.getBoundingClientRect();
      if (!buttonRect) return;

      const contentBottom = window.innerHeight;
      const nextMaxHeight = Math.max(0, Math.floor(contentBottom - (buttonRect.bottom + 12) - 32));
      setFeedbackPopoverMaxHeight(nextMaxHeight);
    };

    updatePopoverMaxHeight();
    window.addEventListener('resize', updatePopoverMaxHeight);

    return () => {
      window.removeEventListener('resize', updatePopoverMaxHeight);
    };
  }, [isFeedbackOpen]);

  useEffect(() => {
    if (!isFeedbackOpen || !isAutoOpenedFeedback) return;

    autoCloseFeedbackTimerRef.current = window.setTimeout(() => {
      autoCloseFeedbackTimerRef.current = null;
      if (selectedScoreRef.current == null) {
        closeFeedbackPopover();
      }
    }, FEEDBACK_AUTO_CLOSE_DELAY_MS);

    return () => {
      if (autoCloseFeedbackTimerRef.current != null) {
        window.clearTimeout(autoCloseFeedbackTimerRef.current);
        autoCloseFeedbackTimerRef.current = null;
      }
    };
  }, [closeFeedbackPopover, isAutoOpenedFeedback, isFeedbackOpen]);

  const handleToggleIssue = (issue: string) => {
    const setCurrentIssues = isHighScoreDetailVisible ? setHighScoreSelectedIssues : setLowScoreSelectedIssues;
    setCurrentIssues((prev) => {
      let nextIssues = prev;
      if (prev.includes(issue)) {
        nextIssues = prev.filter((item) => item !== issue);
      } else if (prev.length < 3) {
        nextIssues = [...prev, issue];
      }

      if (!nextIssues.includes('other_issue')) {
        setIsOtherIssueRequiredError(false);
      }
      if (nextIssues.length > 0) {
        setIsIssueRequiredError(false);
      }

      return nextIssues;
    });
  };

  const handleDetailChange = useCallback(
    (value: string) => {
      if (value.length > currentDetailMaxLength) {
        setIsDetailTooLong(true);
        return;
      }
      setIsDetailTooLong(false);
      if (hasMeaningfulDetail(value)) {
        setIsDetailRequiredError(false);
      }
      setLowScoreDetail(value);
    },
    [currentDetailMaxLength, setLowScoreDetail],
  );

  const handleDetailFocus = useCallback(() => {
    if (!isLowScoreDetailVisible && !isHighScoreDetailVisible) return;
    if (lowScoreDetail.trim().length > 0) return;
    setLowScoreDetail(DETAIL_PREFILL_TEMPLATE);
    setIsDetailTooLong(false);
    setIsDetailRequiredError(false);
  }, [isHighScoreDetailVisible, isLowScoreDetailVisible, lowScoreDetail, setLowScoreDetail]);

  const handleOtherIssueDetailChange = useCallback((value: string) => {
    if (isHighScoreDetailVisible) {
      setHighScoreOtherIssueDetail(value);
    } else {
      setLowScoreOtherIssueDetail(value);
    }
    if (value.trim().length > 0) {
      setIsOtherIssueRequiredError(false);
    }
  }, [isHighScoreDetailVisible, setHighScoreOtherIssueDetail, setLowScoreOtherIssueDetail]);

  const handleSubmitFeedback = useCallback(async () => {
    if (!isLowScoreDetailVisible) {
      setIsIssueRequiredError(false);
      setIsOtherIssueRequiredError(false);
    }

    if (isSubmittingFeedback) return;
    if (selectedScore == null) {
      const message = '\u8bf7\u5148\u9009\u62e9\u6ee1\u610f\u5ea6\u8bc4\u5206';
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message,
        duration: 3200,
      });
      return;
    }
    if (isLowScoreDetailVisible || isHighScoreDetailVisible) {
      const hasIssueSelection = currentSelectedIssues.length > 0;
      const needOtherIssueInput = currentSelectedIssues.includes('other_issue');
      const hasOtherIssueInput = currentOtherIssueDetail.trim().length > 0;
      const isDetailMissing = isDetailRequired && !hasMeaningfulDetail(lowScoreDetail);

      setIsIssueRequiredError(!hasIssueSelection);
      setIsOtherIssueRequiredError(needOtherIssueInput && !hasOtherIssueInput);
      setIsDetailRequiredError(isDetailMissing);

      if (!hasIssueSelection) {
        return;
      }
      if ((needOtherIssueInput && !hasOtherIssueInput) || isDetailMissing) {
        return;
      }
    }
    if (currentSelectedIssues.includes('other_issue') && currentOtherIssueDetail.length > OTHER_ISSUE_MAX_LENGTH) {
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message: OTHER_ISSUE_LENGTH_ERROR_MESSAGE,
        duration: 3200,
      });
      return;
    }
    if (lowScoreDetail.length > currentDetailMaxLength) {
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message: DETAIL_LENGTH_ERROR_MESSAGE,
        duration: 3200,
      });
      return;
    }

    const surveyId = readPublicEnv('NEXT_PUBLIC_FEEDBACK_SAVE_SURVEY_ID')?.trim() || DEFAULT_FEEDBACK_SAVE_SURVEY_ID;
    const serviceId = readPublicEnv('NEXT_PUBLIC_FEEDBACK_SAVE_SERVICE_ID')?.trim() || DEFAULT_FEEDBACK_SAVE_SERVICE_ID;
    const contactId = readPublicEnv('NEXT_PUBLIC_FEEDBACK_SAVE_CONTACT_ID')?.trim() || DEFAULT_FEEDBACK_SAVE_CONTACT_ID;
    const w3account = getFeedbackUserId();
    const scoreValue = String(selectedScore);
    const selectedIssueCodes = currentIssueOptions
      .map((issue, index) => (currentSelectedIssues.includes(issue.id) ? String(index) : ''))
      .filter(Boolean)
      .join(',');
    const selectedIssueLabels = currentIssueOptions
      .filter((issue) => currentSelectedIssues.includes(issue.id))
      .map((issue) => issue.label)
      .join(',');
    const detailText = hasMeaningfulDetail(lowScoreDetail) ? lowScoreDetail.trim() : '';
    const otherIssueReason = currentSelectedIssues.includes('other_issue')
      ? currentOtherIssueDetail.trim()
      : SCORE_REASON_DEFAULT_REASON;
    const scoreReasonQuestionId = selectedScore >= 9 ? HIGH_SCORE_REASON_QUESTION_ID : LOW_SCORE_REASON_QUESTION_ID;
    const answers: FeedbackSubmitAnswer[] = [
      {
        questionId: SCORE_QUESTION_ID,
        subQuestionId: null,
        subName: currentSurveyTitle,
        answer: scoreValue,
        subRemark: scoreValue,
        reason: SCORE_REASON_DEFAULT_REASON,
      },
      {
        questionId: scoreReasonQuestionId,
        subQuestionId: null,
        subName: currentPrimaryTitle,
        answer: selectedIssueCodes,
        subRemark: selectedIssueLabels,
        reason: otherIssueReason || SCORE_REASON_DEFAULT_REASON,
      },
      {
        questionId: DETAIL_QUESTION_ID,
        subQuestionId: null,
        subName: DETAIL_SUBMIT_TITLE,
        answer: detailText,
        subRemark: detailText ? DETAIL_DEFAULT_SUB_REMARK : '',
        reason: DETAIL_DEFAULT_REASON,
      },
    ];

    setIsSubmittingFeedback(true);
    try {
      const response = await fetch(FEEDBACK_SAVE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json;charset=utf8' },
        body: JSON.stringify({
          data: {
            surveyId: surveyId,
            serviceId: serviceId,
            contactId: contactId,
            w3account,
            answers,
          },
        }),
      });

      let payload: FeedbackSubmitResponse | null = null;
      try {
        payload = (await response.json()) as FeedbackSubmitResponse;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const message =
          payload?.error_msg?.trim() ||
          payload?.errorMsg?.trim() ||
          payload?.message?.trim() ||
          payload?.msg?.trim() ||
          payload?.error?.trim() ||
          `\u63d0\u4ea4\u5931\u8d25\uff08HTTP ${response.status}\uff09`;
        addToast({
          type: 'error',
          title: '\u63d0\u4ea4\u5931\u8d25',
          message,
          duration: 4200,
        });
        return;
      }

      if (payload?.error_code || payload?.errorCode) {
        const message =
          payload?.error_msg?.trim() ||
          payload?.errorMsg?.trim() ||
          payload?.message?.trim() ||
          payload?.msg?.trim() ||
          payload?.error_code ||
          payload?.errorCode || '';
        addToast({
          type: 'error',
          title: '\u63d0\u4ea4\u5931\u8d25',
          message,
          duration: 4200,
        });
        return;
      }

      addToast({
        type: 'success',
        title: '\u63d0\u4ea4\u6210\u529f',
        message: '\u611f\u8c22\u60a8\u7684\u53cd\u9988',
        duration: 2600,
      });
      closeFeedbackPopover();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : '\u7f51\u7edc\u5f02\u5e38';
      addToast({
        type: 'error',
        title: '\u63d0\u4ea4\u5931\u8d25',
        message,
        duration: 4200,
      });
    } finally {
      setIsSubmittingFeedback(false);
    }
  }, [
    addToast,
    currentDetailMaxLength,
    currentIssueOptions,
    currentSelectedIssues,
    currentPrimaryTitle,
    closeFeedbackPopover,
    isDetailRequired,
    isHighScoreDetailVisible,
    isLowScoreDetailVisible,
    isSubmittingFeedback,
    lowScoreDetail,
    currentOtherIssueDetail,
    selectedScore,
  ]);

  const dragStateRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 只响应左键
      if (e.button !== 0) {
        return;
      }

      // 排除按钮点击
      if ((e.target as HTMLElement).closest('.ui-content-header-action')) {
        return;
      }

      // 排除弹窗区域
      if ((e.target as HTMLElement).closest('.ui-content-header-feedback-popover')) {
        return;
      }

      // 排除反馈锚点区域（笑脸按钮的容器）
      if ((e.target as HTMLElement).closest('.ui-content-header-feedback-anchor')) {
        return;
      }

      // 记录鼠标按下的位置，等待 mousemove
      dragStateRef.current = {
        isDragging: false,
        startX: e.clientX,
        startY: e.clientY,
      };
    },
    [],
  );

  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 排除按钮点击
      if ((e.target as HTMLElement).closest('.ui-content-header-action')) {
        return;
      }

      // 排除弹窗区域
      if ((e.target as HTMLElement).closest('.ui-content-header-feedback-popover')) {
        return;
      }

      // 排除反馈锚点区域
      if ((e.target as HTMLElement).closest('.ui-content-header-feedback-anchor')) {
        return;
      }

      // 双击时切换最大化
      toggleMaximize();
    },
    [toggleMaximize],
  );

  // 监听全局 mousemove 和 mouseup
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      // 如果鼠标按下了，但还没开始拖动
      if (state.startX !== 0 && !state.isDragging) {
        // 计算鼠标移动距离
        const deltaX = Math.abs(e.clientX - state.startX);
        const deltaY = Math.abs(e.clientY - state.startY);
        // 如果移动超过 5px，认为是拖动意图
        if (deltaX > 5 || deltaY > 5) {
          state.isDragging = true;
          // 触发拖动
          startDrag();
        }
      }
    };

    const handleMouseUp = () => {
      // 重置状态
      dragStateRef.current = {
        isDragging: false,
        startX: 0,
        startY: 0,
      };
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [startDrag]);

  return (
    <div
      ref={headerRef}
      className="ui-content-header"
      data-testid="right-content-header"
      onMouseDown={handleHeaderMouseDown}
      onDoubleClick={handleHeaderDoubleClick}
    >
      <div className="flex h-full min-w-0 flex-1 items-center">
        {leftContent ?? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {threadTitle && (
              <OverflowTooltip content={threadTitle} className="min-w-0 max-w-full self-center h-full inline-flex items-center overflow-hidden" placement="bottom">
                <span
                  data-testid="thread-title-label"
                  className="block w-full truncate whitespace-nowrap text-ellipsis text-[14px] font-medium leading-[2] text-[rgba(25,25,25,1)]"
                >
                  {threadTitle}
                </span>
              </OverflowTooltip>
            )}
            {shouldShowWorkspace && workspaceLabel && (
              <OverflowTooltip
                content="点击打开会话工作空间目录"
                className="min-w-0 max-w-full self-center h-full inline-flex items-center shrink-0"
                placement="bottom"
                forceShow
              >
                <button
                  type="button"
                  data-testid="thread-workspace-open-button"
                  onClick={handleOpenWorkspace}
                  onMouseDown={(event) => event.stopPropagation()}
                  aria-label={`打开工作空间 ${workspaceLabel}`}
                  className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded bg-[rgba(245,245,245,1)] px-2 text-sm leading-none text-[var(--text-primary)] shadow-none outline-none transition-colors hover:text-[var(--text-accent)] focus-visible:ring-2 focus-visible:ring-[var(--text-accent)]"
                >
                  <HeaderWorkspaceIcon />
                  <span className="leading-[2] max-[600px]:hidden truncate">{workspaceLabel}</span>
                </button>
              </OverflowTooltip>
            )}
          </div>
        )}
      </div>
      <div className="ui-content-header-actions">
        {routeThreadId !== null && (
          <><HeaderAction
          title={
            panelToggle
              ? panelToggle.isOpen
                ? panelToggle.closeLabel
                : panelToggle.openLabel
              : isFileBrowserOpen
                ? '关闭文件浏览'
                : '打开文件浏览'
          }
          onClick={panelToggle ? panelToggle.onToggle : handleToggleFileBrowser}
        >
          <RightPanelToggleIcon isOpen={panelToggle ? panelToggle.isOpen : isFileBrowserOpen} />
            </HeaderAction>
            <div className="ui-content-header-divider" aria-hidden="true" />
          </>
        )}
        <div
          className="ui-content-header-feedback-anchor"
          onMouseEnter={cancelMouseLeaveClose}
          onMouseLeave={scheduleMouseLeaveClose}
        >
          <HeaderAction
            title={'\u7b11\u8138'}
            buttonRef={smileActionRef}
            aria-expanded={isFeedbackOpen}
            aria-controls={feedbackPopoverId}
            aria-haspopup="dialog"
            onClick={openFeedbackPopoverManually}
            onMouseEnter={openFeedbackPopoverManually}
          >
            <WindowSmileIcon />
          </HeaderAction>
          {isFeedbackOpen ? (
            <div
              ref={feedbackPopoverRef}
              id={feedbackPopoverId}
              role="dialog"
              aria-modal="false"
              aria-label={'\u6ee1\u610f\u5ea6\u8bc4\u5206'}
              style={{ height: 'auto' }}
              className={
                isScoreUnselected
                  ? 'ui-content-header-feedback-popover ui-content-header-feedback-popover-compact'
                  : 'ui-content-header-feedback-popover'
              }
            >
              <div
                className="ui-content-header-feedback-popover-content"
                style={{ maxHeight: feedbackPopoverMaxHeight != null ? `${feedbackPopoverMaxHeight}px` : undefined }}
              >
                <div className="ui-content-header-feedback-popover-header">
                  <p className="ui-content-header-feedback-popover-title">
                    {currentSurveyTitle}
                  </p>
                  <button
                    type="button"
                    aria-label={'\u5173\u95ed\u6ee1\u610f\u5ea6\u8bc4\u4ef7\u5f39\u7a97'}
                    className="ui-content-header-feedback-popover-close"
                    onClick={dismissFeedbackPopover}
                  >
                    <PopoverCloseIcon />
                  </button>
                </div>
                <div className="ui-content-header-feedback-popover-body">
                  <div className="ui-content-header-feedback-score-row">
                    {SATISFACTION_SCORES.map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => setSelectedScore(score)}
                        aria-label={`\u8bc4\u5206 ${score}`}
                        aria-pressed={selectedScore === score}
                        className={
                          selectedScore === score
                            ? 'ui-content-header-feedback-score ui-content-header-feedback-score-selected'
                            : 'ui-content-header-feedback-score'
                        }
                      >
                        {selectedScore === score ? (
                          <span className="flex h-full w-full items-center justify-center">
                            <img
                              src={getSelectedScoreIconSrc(score) ?? ''}
                              alt=""
                              aria-hidden="true"
                              width={24}
                              height={24}
                              className="h-6 w-6 object-contain"
                            />
                          </span>
                        ) : (
                          score
                        )}
                      </button>
                    ))}
                  </div>
                  {isLowScoreDetailVisible || isHighScoreDetailVisible ? (
                    <div className="ui-content-header-feedback-low-score">
                      <div className="ui-content-header-feedback-low-score-section">
                        <p className="ui-content-header-feedback-low-score-title">
                          {currentPrimaryTitle}
                          <span className="ui-content-header-feedback-low-score-subtitle">
                            {currentPrimarySubtitle}
                          </span>
                        </p>
                        <div className="ui-content-header-feedback-low-score-options">
                          {currentIssueOptions.map((issue) => {
                            const isChecked = currentSelectedIssues.includes(issue.id);
                            const isDisabled = !isChecked && currentSelectedIssues.length >= 3;
                            return (
                              <label
                                key={issue.id}
                                className={
                                  isDisabled
                                    ? 'ui-content-header-feedback-low-score-option ui-content-header-feedback-low-score-option-disabled'
                                    : 'ui-content-header-feedback-low-score-option'
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => handleToggleIssue(issue.id)}
                                />
                                <span className="ui-content-header-feedback-low-score-option-content">
                                  <span className="ui-content-header-feedback-low-score-option-label">{issue.label}</span>
                                  {issue.hint ? (
                                    <span className="ui-content-header-feedback-low-score-option-hint">{issue.hint}</span>
                                  ) : null}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {isOtherIssueSelected ? (
                          <>
                            <input
                              type="text"
                              className="ui-input"
                              placeholder={'\u662f\u4ec0\u4e48\u95ee\u9898\u5462\uff1f\u8bf7\u7b80\u8981\u8bf4\u660e'}
                              value={currentOtherIssueDetail}
                              onChange={(event) => handleOtherIssueDetailChange(event.target.value)}
                            />
                            {isOtherIssueRequiredError ? (
                              <p className="ui-content-header-feedback-other-error">
                                {REQUIRED_INPUT_ERROR_MESSAGE}
                              </p>
                            ) : isOtherIssueTooLong ? (
                              <p className="ui-content-header-feedback-other-error">
                                {OTHER_ISSUE_LENGTH_ERROR_MESSAGE}
                              </p>
                            ) : null}
                          </>
                        ) : null}
                        {isIssueRequiredError ? (
                          <p className="ui-content-header-feedback-other-error">
                            {REQUIRED_SELECT_ERROR_MESSAGE}
                          </p>
                        ) : null}
                      </div>
                      <div className="ui-content-header-feedback-low-score-section">
                        <p className="ui-content-header-feedback-low-score-title">
                          {currentDetailTitle}
                          {currentDetailSubtitle ? (
                            <span className="ui-content-header-feedback-low-score-subtitle">{currentDetailSubtitle}</span>
                          ) : null}
                        </p>
                        <div className="ui-content-header-feedback-detail-shell">
                          <textarea
                            className="ui-textarea ui-content-header-feedback-detail-input"
                            placeholder={currentDetailPlaceholder}
                            value={lowScoreDetail}
                            onFocus={handleDetailFocus}
                            onChange={(event) => handleDetailChange(event.target.value)}
                          />
                          <span className="ui-content-header-feedback-detail-counter">
                            {lowScoreDetail.length}/{currentDetailMaxLength}
                          </span>
                        </div>
                        {isDetailRequiredError ? (
                          <p className="ui-content-header-feedback-detail-error">
                            {REQUIRED_INPUT_ERROR_MESSAGE}
                          </p>
                        ) : isDetailTooLong ? (
                          <p className="ui-content-header-feedback-detail-error">
                            {DETAIL_LENGTH_ERROR_MESSAGE}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                {isLowScoreDetailVisible || isHighScoreDetailVisible ? (
                  <div className="ui-content-header-feedback-low-score-actions">
                    <Button variant="default"
                      onClick={closeFeedbackPopover}
                    >
                      {'\u53d6\u6d88'}
                    </Button>
                    <Button variant="major"
                      onClick={() => void handleSubmitFeedback()}
                      disabled={isSubmittingFeedback}
                    >
                      {isSubmittingFeedback ? '\u63d0\u4ea4\u4e2d...' : '\u63d0\u4ea4'}
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="ui-content-header-feedback-popover-arrow" aria-hidden="true" />
            </div>
          ) : null}
        </div>
        <div className="ui-content-header-divider" data-testid="right-content-header-divider" aria-hidden="true" />
        <HeaderAction title={'\u6700\u5c0f\u5316'} onClick={minimize}>
          <WindowMinimizeIcon />
        </HeaderAction>
        <HeaderAction title={isMaximized ? '\u8fd8\u539f' : '\u6700\u5927\u5316'} onClick={toggleMaximize} disabled={!canMaximize}>
          {isMaximized ? <WindowRestoreIcon /> : <WindowMaximizeIcon />}
        </HeaderAction>
        <HeaderAction title={'\u5173\u95ed'} onClick={close}>
          <WindowCloseIcon />
        </HeaderAction>
      </div>
    </div>
  );
}
