/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export function PawIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 15C15 15 17.5 17 17.5 19.5C17.5 21 16 22.5 12 22.5C8 22.5 6.5 21 6.5 19.5C6.5 17 9 15 12 15Z" />
      <ellipse cx="6" cy="11.5" rx="2.5" ry="3" />
      <ellipse cx="12" cy="10" rx="3" ry="3.5" />
      <ellipse cx="18" cy="11.5" rx="2.5" ry="3" />
    </svg>
  );
}
