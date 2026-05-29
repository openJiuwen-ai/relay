/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function RotatingBorderStopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <g>
        <path
          d="M10 1.5A8.5 8.5 0 0 1 18.5 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M18.5 10A8.5 8.5 0 1 1 10 1.5"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.24"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 10 10"
          to="360 10 10"
          dur="1s"
          repeatCount="indefinite"
        />
      </g>
      <rect x="6.3" y="6.3" width="7.4" height="7.4" rx="1.5" fill="currentColor" />
    </svg>
  );
}
