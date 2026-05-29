/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react';

function PasswordEyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M10.6 6.2A11.1 11.1 0 0 1 12 6c6.5 0 10 6 10 6a18.8 18.8 0 0 1-3.3 4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.7 6.8C4.1 8.2 2 12 2 12s3.5 6 10 6c1 0 1.9-.1 2.8-.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  toggleTestId?: string;
  wrapperClassName?: string;
  iconClassName?: string;
  inputPaddingRightClassName?: string;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(
  {
    className,
    value,
    toggleTestId,
    wrapperClassName,
    iconClassName = 'h-4 w-4',
    inputPaddingRightClassName = 'pr-10',
    ...props
  },
  ref,
) {
  const [showPassword, setShowPassword] = useState(false);
  const hasValue = typeof value === 'string' ? value.length > 0 : !!value;

  useEffect(() => {
    if (!hasValue) {
      setShowPassword(false);
    }
  }, [hasValue]);

  return (
    <div className={wrapperClassName ?? 'relative'}>
      <input
        {...props}
        ref={ref}
        value={value}
        type={showPassword ? 'text' : 'password'}
        className={['password-field-input', className, inputPaddingRightClassName].filter(Boolean).join(' ')}
      />
      {hasValue ? (
        <button
          type="button"
          data-testid={toggleTestId}
          aria-label={showPassword ? '隐藏密码' : '显示密码'}
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-[#8C95A6] transition-colors hover:text-[#4B5563]"
        >
          <span className={iconClassName}>
            <PasswordEyeIcon visible={showPassword} />
          </span>
        </button>
      ) : null}
    </div>
  );
});
