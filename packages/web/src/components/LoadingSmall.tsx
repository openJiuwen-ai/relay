/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

export function LoadingSmall({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      <img
        src="/loading-small.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}
