/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

export function LoadingPointStyle({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      <img
        src="/loading-point-style.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}
