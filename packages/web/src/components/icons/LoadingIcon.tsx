/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function LoadingIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} stroke="currentColor" strokeWidth="2">
      <path d="M18 12L21 9M21 15L18 12" />
      <path d="M3 12H18" />
      <path d="M3 12L6 8M6 16L3 12" />
      <path d="M10 8V16" />
      <path d="M14 8V16" />
    </svg>
  );
}
