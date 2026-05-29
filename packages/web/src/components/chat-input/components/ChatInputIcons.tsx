/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { MaskIcon } from '@/components/shared/MaskIcon';

function FolderBadgeIcon({ className }: { className?: string }) {
  return <MaskIcon src="/icons/chart/folder.svg" testId="folder-select-icon" className={`${className ?? ''} text-[var(--mask-icon)]`} />;
}

function QuickActionExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {expanded ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
    </svg>
  );
}

export { FolderBadgeIcon, QuickActionExpandIcon };
