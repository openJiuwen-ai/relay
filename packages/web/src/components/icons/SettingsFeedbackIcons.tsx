/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿export function ModalCloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function FeedbackHelpCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M15 8c0-3.87-3.14-7-7-7-3.87 0-7 3.13-7 7 0 3.86 3.13 7 7 7 3.86 0 7-3.14 7-7ZM2 8c0-3.32 2.68-6 6-6 3.31 0 6 2.68 6 6 0 3.31-2.69 6-6 6-3.32 0-6-2.69-6-6Zm8.2-1.28c0-1.23-1-2.22-2.23-2.22s-2.22.99-2.22 2.22c0 .27.22.5.5.5.27 0 .5-.23.5-.5 0-.68.54-1.22 1.22-1.22.68 0 1.23.54 1.23 1.22 0 .67-.55 1.21-1.23 1.21-.27 0-.5.23-.5.5v1.23c0 .27.23.5.5.5l.09-.01c.24-.04.41-.24.41-.49v-.78l.12-.03c.93-.27 1.61-1.12 1.61-2.13Zm-2.27 3.87c.31 0 .57.25.57.56 0 .31-.26.56-.57.56a.56.56 0 0 1-.56-.56c0-.31.25-.56.56-.56Z"
        clipRule="evenodd"
        fillRule="evenodd"
        fill="currentColor"
      />
    </svg>
  );
}
