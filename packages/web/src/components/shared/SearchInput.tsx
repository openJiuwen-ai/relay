/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ChangeEvent, InputHTMLAttributes } from 'react';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>;

interface SearchInputProps extends NativeInputProps {
  value: string;
  onChange: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  inputClassName?: string;
  wrapperClassName?: string;
  clearAriaLabel?: string;
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        d="M1.72656 7.17676C1.72656 4.13919 4.189 1.67676 7.22656 1.67676C10.2641 1.67676 12.7266 4.13919 12.7266 7.17676C12.7266 8.50784 12.2537 9.72845 11.4668 10.6798L14.2009 13.3786C14.3974 13.5726 14.3995 13.8892 14.2055 14.0857C14.033 14.2604 13.7637 14.2814 13.568 14.1477L10.7625 11.3897C9.80641 12.1929 8.57299 12.6768 7.22656 12.6768C4.189 12.6768 1.72656 10.2143 1.72656 7.17676ZM11.7266 7.17676C11.7266 4.69147 9.71184 2.67676 7.22656 2.67676C4.74128 2.67676 2.72656 4.69147 2.72656 7.17676C2.72656 9.66205 4.74128 11.6768 7.22656 11.6768C9.71184 11.6768 11.7266 9.66205 11.7266 7.17676Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SearchInput({
  value,
  onChange,
  onClear,
  inputClassName,
  wrapperClassName,
  clearAriaLabel = '清除搜索',
  ...rest
}: SearchInputProps) {
  const showClear = Boolean(onClear) && value.length > 0;

  return (
    <div className={['relative', wrapperClassName].filter(Boolean).join(' ')}>
      <span
        className="pointer-events-none absolute left-3 top-1/2 inline-flex -translate-y-1/2 items-center text-[var(--text-muted)]"
        data-testid="search-input-leading-icon"
      >
        <SearchIcon />
        <span className="ml-1 h-4 w-0" aria-hidden="true" />
      </span>
      <input
        {...rest}
        value={value}
        onChange={(event) => onChange(event.target.value, event)}
        className={['search-input-control ui-input w-full px-8', inputClassName].filter(Boolean).join(' ')}
      />
      {showClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center text-[var(--text-disabled)] transition-colors hover:text-[var(--text-primary)]"
          aria-label={clearAriaLabel}
          data-testid="search-input-clear-button"
        >
          <ClearIcon />
        </button>
      )}
    </div>
  );
}
