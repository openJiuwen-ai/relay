/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TextareaHTMLAttributes,
} from 'react';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  containerClassName?: string;
  counterClassName?: string;
  showCount?: boolean;
  formatCount?: (current: number, maxLength?: number) => string;
  useDefaultContainerStyles?: boolean;
  useDefaultTextareaStyles?: boolean;
};

function getControlledTextLength(value: TextareaProps['value']): number {
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number') return String(value).length;
  return 0;
}

function joinClassNames(...values: Array<string | undefined | false | null>): string | undefined {
  const next = values.filter(Boolean).join(' ');
  return next || undefined;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    containerClassName,
    counterClassName,
    className,
    showCount = false,
    formatCount,
    maxLength,
    useDefaultContainerStyles = true,
    useDefaultTextareaStyles = true,
    value,
    disabled,
    readOnly,
    style,
    ...props
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const currentLength = getControlledTextLength(value);

  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

  const stopResize = useCallback(() => {
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;
    document.body.style.removeProperty('user-select');
    document.body.style.removeProperty('cursor');
  }, []);

  useEffect(() => stopResize, [stopResize]);

  const resolvedContainerClassName = joinClassNames(
    'relative',
    useDefaultContainerStyles ? 'ui-field ui-form-focus-within bg-[var(--surface-panel)] pl-3 pt-2 pb-4' : null,
    containerClassName,
  );
  const resolvedTextareaClassName = joinClassNames(
    useDefaultTextareaStyles ? 'ui-textarea ui-textarea-plain w-full pr-3 rounded-none text-[12px]' : null,
    className,
  );
  const resolvedCounterClassName = joinClassNames(
    'pointer-events-none text-[12px] text-[var(--text-muted)]',
    counterClassName,
  );

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled || readOnly) return;

      const textarea = textareaRef.current;
      if (!textarea) return;

      stopResize();
      event.preventDefault();

      const computedStyle = window.getComputedStyle(textarea);
      const minHeight = Number.parseFloat(computedStyle.minHeight || '0') || 0;
      const startY = event.clientY;
      const startHeight = textarea.offsetHeight;

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextHeight = Math.max(minHeight, startHeight + (moveEvent.clientY - startY));
        setManualHeight(nextHeight);
      };

      const handlePointerEnd = () => {
        stopResize();
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerEnd, { once: true });
      window.addEventListener('pointercancel', handlePointerEnd, { once: true });

      resizeCleanupRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerEnd);
        window.removeEventListener('pointercancel', handlePointerEnd);
      };
    },
    [disabled, readOnly, stopResize],
  );

  return (
    <div className={resolvedContainerClassName}>
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        readOnly={readOnly}
        className={resolvedTextareaClassName}
        style={{ ...style, resize: 'none', height: manualHeight != null ? `${manualHeight}px` : style?.height }}
        {...props}
      />
      <div className="absolute bottom-0 right-0 flex items-center">
        {showCount ? (
          <div className={resolvedCounterClassName}>
            {formatCount ? formatCount(currentLength, maxLength) : `${currentLength}`}
          </div>
        ) : null}
        <button
          type="button"
          onPointerDown={handleResizeStart}
          disabled={disabled || readOnly}
          className="inline-flex h-4 w-4 shrink-0 touch-none cursor-ns-resize items-center justify-center rounded-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Resize textarea"
          title="Drag to resize"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M4 10L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M7 10L10 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
});
