/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react';
import { useDesktopWindowControls } from '@/hooks/useDesktopWindowControls';

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
      <path
        d="M5.75 4.25H10.1C10.984 4.25 11.7 4.966 11.7 5.85V10.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 5.75H5.9C5.016 5.75 4.3 6.466 4.3 7.35V11.1C4.3 11.984 5.016 12.7 5.9 12.7H10.25C11.134 12.7 11.85 11.984 11.85 11.1V7.35C11.85 6.466 11.134 5.75 10.25 5.75Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
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

type HeaderActionProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title' | 'type'> & {
  title: string;
  children: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement>;
};

function HeaderAction({ title, children, buttonRef, ...buttonProps }: HeaderActionProps) {
  return (
    <button ref={buttonRef} type="button" className="ui-content-header-action" title={title} aria-label={title} {...buttonProps}>
      {children}
    </button>
  );
}

export function LoginHeader({ className }: { className?: string }) {
  const { isMaximized, canMaximize, minimize, toggleMaximize, close, startDrag } = useDesktopWindowControls();
  const headerRef = useRef<HTMLDivElement>(null);

  const dragStateRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.ui-content-header-action')) return;

    dragStateRef.current = {
      isDragging: false,
      startX: e.clientX,
      startY: e.clientY,
    };
  }, []);

  const handleHeaderDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('.ui-content-header-action')) return;
      toggleMaximize();
    },
    [toggleMaximize],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (state.startX !== 0 && !state.isDragging) {
        const deltaX = Math.abs(e.clientX - state.startX);
        const deltaY = Math.abs(e.clientY - state.startY);
        if (deltaX > 5 || deltaY > 5) {
          state.isDragging = true;
          startDrag();
        }
      }
    };

    const handleMouseUp = () => {
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
      className={`ui-content-header${className ? ` ${className}` : ''}`}
      data-testid="login-header"
      onMouseDown={handleHeaderMouseDown}
      onDoubleClick={handleHeaderDoubleClick}
    >
      <div aria-hidden="true" />
      <div className="ui-content-header-actions">
        <HeaderAction title="最小化" onClick={minimize}>
          <WindowMinimizeIcon />
        </HeaderAction>
        <HeaderAction title={isMaximized ? '还原' : '最大化'} onClick={toggleMaximize} disabled={!canMaximize}>
          {isMaximized ? <WindowRestoreIcon /> : <WindowMaximizeIcon />}
        </HeaderAction>
        <HeaderAction title="关闭" onClick={close}>
          <WindowCloseIcon />
        </HeaderAction>
      </div>
    </div>
  );
}
