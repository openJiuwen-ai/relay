/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import {
  cloneElement,
  type CSSProperties,
  type ElementType,
  type Ref,
  type ReactNode,
  isValidElement,
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_PADDING = 12;
const TOOLTIP_GAP = 10;
const TOOLTIP_ARROW_SIZE = 6;
const TOOLTIP_MAX_WIDTH = 328;

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

type TooltipPosition = {
  top: number;
  left: number;
  maxWidth: number;
  placement: TooltipPlacement;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function useTooltipPositioning(content: string, gap: number, preferredPlacement: TooltipPlacement) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const maxWidth = Math.max(160, Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2));
      const tooltipWidth = Math.min(tooltipRect.width || maxWidth, maxWidth);
      const tooltipHeight = tooltipRect.height;

      const centeredLeft = clamp(
        triggerRect.left + triggerRect.width / 2 - tooltipWidth / 2,
        VIEWPORT_PADDING,
        window.innerWidth - tooltipWidth - VIEWPORT_PADDING,
      );
      const centeredTop = clamp(
        triggerRect.top + triggerRect.height / 2 - tooltipHeight / 2,
        VIEWPORT_PADDING,
        window.innerHeight - tooltipHeight - VIEWPORT_PADDING,
      );

      const topAbove = triggerRect.top - tooltipHeight - gap - TOOLTIP_ARROW_SIZE;
      const topBelow = triggerRect.bottom + gap + TOOLTIP_ARROW_SIZE;
      const leftOf = triggerRect.left - tooltipWidth - gap - TOOLTIP_ARROW_SIZE;
      const rightOf = triggerRect.right + gap + TOOLTIP_ARROW_SIZE;

      const canTop = topAbove >= VIEWPORT_PADDING;
      const canBottom = topBelow + tooltipHeight <= window.innerHeight - VIEWPORT_PADDING;
      const canLeft = leftOf >= VIEWPORT_PADDING;
      const canRight = rightOf + tooltipWidth <= window.innerWidth - VIEWPORT_PADDING;

      const verticalFallback = (): TooltipPosition => {
        const placeTop = canTop || !canBottom;
        return {
          top: placeTop ? Math.max(VIEWPORT_PADDING, topAbove) : topBelow,
          left: centeredLeft,
          maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH),
          placement: placeTop ? 'top' : 'bottom',
        };
      };

      const horizontalFallback = (): TooltipPosition => {
        const placeRight = canRight || !canLeft;
        return {
          top: centeredTop,
          left: placeRight ? rightOf : Math.max(VIEWPORT_PADDING, leftOf),
          maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH),
          placement: placeRight ? 'right' : 'left',
        };
      };

      if (preferredPlacement === 'right') {
        setPosition(canRight ? { top: centeredTop, left: rightOf, maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'right' } : canLeft ? { top: centeredTop, left: Math.max(VIEWPORT_PADDING, leftOf), maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'left' } : verticalFallback());
        return;
      }
      if (preferredPlacement === 'left') {
        setPosition(canLeft ? { top: centeredTop, left: Math.max(VIEWPORT_PADDING, leftOf), maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'left' } : canRight ? { top: centeredTop, left: rightOf, maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'right' } : verticalFallback());
        return;
      }
      if (preferredPlacement === 'bottom') {
        setPosition(canBottom ? { top: topBelow, left: centeredLeft, maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'bottom' } : canTop ? { top: Math.max(VIEWPORT_PADDING, topAbove), left: centeredLeft, maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'top' } : horizontalFallback());
        return;
      }
      if (preferredPlacement === 'top') {
        setPosition(canTop ? { top: Math.max(VIEWPORT_PADDING, topAbove), left: centeredLeft, maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'top' } : canBottom ? { top: topBelow, left: centeredLeft, maxWidth: Math.min(maxWidth, TOOLTIP_MAX_WIDTH), placement: 'bottom' } : horizontalFallback());
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [content, gap, open, preferredPlacement]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
    }
  }, [open]);

  const tooltipStyle: CSSProperties | undefined = position
    ? {
      position: 'fixed',
      top: `${position.top}px`,
      left: `${position.left}px`,
      maxWidth: `${position.maxWidth}px`,
    }
    : {
      position: 'fixed',
      top: '-9999px',
      left: '-9999px',
      maxWidth: `min(${TOOLTIP_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
    };

  return {
    triggerRef,
    tooltipRef,
    tooltipId,
    open,
    setOpen,
    tooltipStyle,
    placement: position?.placement ?? 'top',
  };
}

function TooltipPortal({
  open,
  tooltipId,
  tooltipRef,
  tooltipStyle,
  content,
  customContent,
  placement,
  interactive,
  copyable,
  copied,
  onTooltipEnter,
  onTooltipLeave,
  onCopy,
}: {
  open: boolean;
  tooltipId: string;
  tooltipRef: React.MutableRefObject<HTMLDivElement | null>;
  tooltipStyle: CSSProperties | undefined;
  content: string;
  customContent?: ReactNode;
  placement: TooltipPlacement;
  interactive: boolean;
  copyable: boolean;
  copied: boolean;
  onTooltipEnter: () => void;
  onTooltipLeave: () => void;
  onCopy: () => void;
}) {
  if (!open) return null;

  const arrowClass =
    placement === 'top'
      ? 'absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-[var(--tooltip-surface)]'
      : placement === 'bottom'
        ? 'absolute bottom-full left-1/2 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[6px] border-x-transparent border-b-[var(--tooltip-surface)]'
        : placement === 'right'
          ? 'absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-r-[6px] border-y-transparent border-r-[var(--tooltip-surface)]'
          : 'absolute left-full top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[6px] border-y-transparent border-l-[var(--tooltip-surface)]';

  return createPortal(
    <div
      ref={tooltipRef}
      id={tooltipId}
      role="tooltip"
      data-placement={placement}
      className={`${interactive ? 'pointer-events-auto' : 'pointer-events-none'} z-[1000]`}
      style={tooltipStyle}
      onMouseEnter={onTooltipEnter}
      onMouseLeave={onTooltipLeave}
    >
      <div className="relative whitespace-normal break-all rounded-lg bg-[var(--tooltip-surface)] px-3 py-2 text-xs leading-5 text-[var(--tooltip-text)] overflow-tooltip shadow-[var(--tooltip-shadow)]">
        {customContent ? (
          customContent
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`min-w-0 flex-1 ${copyable ? 'select-text' : ''}`}>{content}</span>
            {copyable && (
              <button
                type="button"
                onClick={onCopy}
                aria-label="复制"
                title="复制"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--tooltip-icon)] transition-colors hover:text-[var(--tooltip-icon-hover)]"
              >
                {copied ? (
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 10.5L8 14l7.5-7.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 1024 1024" version="1.1" fill="currentColor" aria-hidden="true">
                    <path d="M337.28 138.688a27.968 27.968 0 0 0-27.968 27.968v78.72h377.344c50.816 0 92.032 41.152 92.032 91.968v377.344h78.656a28.032 28.032 0 0 0 27.968-28.032V166.656a28.032 28.032 0 0 0-27.968-27.968H337.28z m441.408 640v78.656c0 50.816-41.216 91.968-92.032 91.968H166.656a92.032 92.032 0 0 1-91.968-91.968V337.28c0-50.816 41.152-92.032 91.968-92.032h78.72V166.656c0-50.816 41.152-91.968 91.968-91.968h520c50.816 0 91.968 41.152 91.968 91.968v520c0 50.816-41.152 92.032-91.968 92.032h-78.72zM166.656 309.312a27.968 27.968 0 0 0-27.968 28.032v520c0 15.424 12.544 27.968 27.968 27.968h520a28.032 28.032 0 0 0 28.032-27.968V337.28a28.032 28.032 0 0 0-28.032-28.032H166.656z" p-id="5039"></path>
                  </svg>
                )}
              </button>
            )}
          </div>
        )}
        <span data-testid="overflow-tooltip-arrow" className={arrowClass} aria-hidden="true" />
      </div>
    </div >,
    document.body,
  );
}

function isOverflowed(node: HTMLElement): boolean {
  return node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;
}

export function OverflowTooltip({
  content,
  customContent,
  className,
  textClassName,
  as: Component = 'span',
  children,
  forceShow = false,
  copyable = false,
  gap = TOOLTIP_GAP,
  placement = 'top',
}: {
  content: string;
  customContent?: ReactNode;
  className?: string;
  textClassName?: string;
  as?: ElementType;
  children?: ReactElement;
  forceShow?: boolean;
  copyable?: boolean;
  gap?: number;
  placement?: TooltipPlacement;
}) {
  const contentRef = useRef<HTMLElement | null>(null);
  const { triggerRef, tooltipRef, tooltipId, open, setOpen, tooltipStyle, placement: actualPlacement } = useTooltipPositioning(
    content,
    gap,
    placement,
  );
  const interactive = copyable || !!customContent;
  const [copied, setCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 300);
  }, [clearCloseTimer, setOpen]);

  const handleOpen = useCallback(() => {
    const node = contentRef.current;
    if (!node) return;

    clearCloseTimer();
    const shouldOpen = forceShow || isOverflowed(node);

    if (shouldOpen) {
      clearOpenTimer();
      openTimerRef.current = window.setTimeout(() => {
        setOpen(true);
        openTimerRef.current = null;
      }, 150);
    }
  }, [clearCloseTimer, clearOpenTimer, forceShow, setOpen]);

  const handleClose = useCallback(() => {
    clearOpenTimer();
    if (interactive) {
      scheduleClose();
    } else {
      setOpen(false);
    }
  }, [clearOpenTimer, interactive, scheduleClose, setOpen]);

  const handleCopy = useCallback(async () => {
    if (!copyable || !content.trim()) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setOpen(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // no-op
    }
  }, [content, copyable, setOpen]);

  useEffect(() => () => {
    clearCloseTimer();
    clearOpenTimer();
  }, [clearCloseTimer, clearOpenTimer]);

  const setRef = <T,>(ref: Ref<T> | undefined, value: T) => {
    if (!ref) return;
    if (typeof ref === 'function') {
      ref(value);
      return;
    }
    (ref as { current: T }).current = value;
  };

  const renderedContent = children
    ? isValidElement(children)
      ? cloneElement(children, {
          ref: (value: HTMLElement | null) => {
            setRef((children as ReactElement & { ref?: Ref<HTMLElement | null> }).ref, value);
            contentRef.current = value;
          },
        } as { ref: (value: HTMLElement | null) => void })
      : children
    : cloneElement(<Component className={textClassName}>{content}</Component>, { ref: contentRef } as {
      ref: typeof contentRef;
    });

  return (
    <div
      ref={triggerRef}
      className={className}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={handleClose}
      aria-describedby={open ? tooltipId : undefined}
    >
      {renderedContent}
      <TooltipPortal
        open={open}
        tooltipId={tooltipId}
        tooltipRef={tooltipRef}
        tooltipStyle={tooltipStyle}
        content={content}
        customContent={customContent}
        placement={actualPlacement}
        interactive={interactive}
        copyable={copyable}
        copied={copied}
        onTooltipEnter={clearCloseTimer}
        onTooltipLeave={scheduleClose}
        onCopy={() => void handleCopy()}
      />
    </div>
  );
}
