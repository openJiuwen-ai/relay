/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function GuidedModeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1" />
      <path
        d="M5.03389 10.0209C4.95343 10.1842 5.0206 10.3819 5.18391 10.4623C5.25705 10.4984 5.34095 10.506 5.4194 10.4838L7.95473 9.76606L10.581 10.4881C10.7565 10.5364 10.9379 10.4332 10.9862 10.2577C11.008 10.1786 10.9994 10.0943 10.9623 10.0211L8.25303 4.68058C8.17066 4.51822 7.97226 4.45337 7.80989 4.53574C7.74628 4.56801 7.69485 4.62004 7.66333 4.68403L5.03389 10.0209Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}