/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { type ToastItem, useToastStore } from '@/stores/toastStore';
import { useChatStore } from '@/stores/chatStore';

// 全局简化调用方法
type ToastInput = Omit<ToastItem, 'id' | 'createdAt' | 'duration'> & { duration?: number };

export function showToast(toast: ToastInput) {
  return useToastStore.getState().addToast({
    ...toast,
    duration: toast.duration ?? 4000,
  });
}

const DISMISS_DELAY = 300; // animation duration

function ToastCard({ toast }: { toast: ToastItem }) {
  const { removeToast, markExiting } = useToastStore();
  const navigate = useNavigate();
  const threads = useChatStore((s) => s.threads);
  const setCurrentProject = useChatStore((s) => s.setCurrentProject);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const statusIconSrc =
    toast.type === 'success'
      ? '/icons/message-success.svg'
      : toast.type === 'error'
        ? '/icons/message-error.svg'
        : null;

  const dismiss = useCallback(() => {
    markExiting(toast.id);
    setTimeout(() => removeToast(toast.id), DISMISS_DELAY);
  }, [toast.id, markExiting, removeToast]);

  const handleViewThread = useCallback(() => {
    if (toast.threadId) {
      const target = threads?.find((t) => t.id === toast.threadId);
      setCurrentProject(target?.projectPath ?? 'default');
      navigate(toast.threadId === 'default' ? '/' : `/thread/${toast.threadId}`, { preventScrollReset: true });
    }
    dismiss();
  }, [toast.threadId, threads, setCurrentProject, navigate, dismiss]);

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, dismiss]);

  useEffect(() => {
    if (msgRef.current) {
      const links = msgRef.current.querySelectorAll('a');
      links.forEach((a) => {
        a.style.color = '#1476FF';
        a.style.textDecoration = 'none';
        a.onmouseover = () => (a.style.color = '#0d62d9');
        a.onmouseout = () => (a.style.color = '#1476FF');
      });
    }
  }, [toast.message]);

  const toneClass =
    toast.type === 'error'
      ? 'bg-[var(--toast-error-surface)] border-[var(--toast-error-surface)]'
      : toast.type === 'success'
        ? 'bg-[var(--toast-success-surface)] border-[var(--toast-success-surface)]'
        : 'bg-[var(--toast-warning-surface)] border-[var(--toast-warning-surface)]';

  return (
    <div
      className={`
        ${toneClass} box-border rounded-[8px] border text-[var(--toast-text)]
        shadow-[var(--toast-shadow)]
        px-4 py-2 max-w-lg pointer-events-auto
        ${toast.exiting ? 'animate-toast-out' : 'animate-toast-in'}
      `}
      role="alert"
    >
      <div className="flex flex-row items-start justify-start gap-2">
        {statusIconSrc ? (
          <img
            src={statusIconSrc}
            alt=""
            aria-hidden="true"
            data-testid="toast-status-icon"
            className="mt-0.5 h-4 w-4 flex-shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {toast.threadTitle ? (
            <p className="mb-0.5 truncate text-xs text-[var(--toast-muted-text)]" data-testid="toast-thread-title">
              {toast.threadTitle}
            </p>
          ) : null}
          <p className="truncate text-sm font-medium text-[var(--toast-text)]">{toast.title}</p>
          <p
            ref={msgRef}
            className="mt-0.5 whitespace-pre-wrap break-words text-xs text-[var(--toast-detail-text)]"
            dangerouslySetInnerHTML={{ __html: toast.message }}
          />
          {toast.threadId ? (
            <button
              onClick={handleViewThread}
              className="mt-2 text-xs text-[var(--toast-link)] underline transition-colors hover:text-[var(--toast-link-hover)]"
              data-testid="toast-view-button"
            >
              查看
            </button>
          ) : null}
        </div>
        <button
          onClick={dismiss}
          className="text-[var(--toast-close-icon)] transition-colors hover:text-[var(--toast-close-icon-hover)]"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4.5 4.5L11.5 11.5M11.5 4.5L4.5 11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-[130] flex flex-col gap-2 pointer-events-none">
      {/* 局部样式全局只插入一次，避免运行时注入 style 标签 */}
      <style>{`
        .text-[var(--toast-detail-text)] a,
        .text-xs a {
          color: #1476FF !important;
          text-decoration: underline !important;
          transition: color 0.2s;
        }
        .text-[var(--toast-detail-text)] a:hover,
        .text-xs a:hover {
          color: #0d62d9 !important;
        }
      `}</style>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
