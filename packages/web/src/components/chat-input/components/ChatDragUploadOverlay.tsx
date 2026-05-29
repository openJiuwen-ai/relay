/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { createPortal } from 'react-dom';

type ChatDragUploadOverlayProps = {
  isVisible: boolean;
  host: HTMLElement | null;
};

export function ChatDragUploadOverlay({ isVisible, host }: ChatDragUploadOverlayProps) {
  if (!isVisible || !host) return null;

  return createPortal(
    <div
      className="pointer-events-none absolute inset-0 z-[2147483648]"
      style={{
        background: 'var(--chat-drag-upload-bg, rgba(255, 255, 255, 0.8))',
        backdropFilter: 'blur(15px)',
        WebkitBackdropFilter: 'blur(15px)',
      }}
    >
      <div
        className="absolute inset-[48px] flex items-center justify-center rounded-[40px] border border-dashed"
        style={{
          borderColor: 'var(--chat-drag-upload-border, rgba(128, 128, 128, 1))',
        }}
      >
        <div className="flex flex-col items-center justify-center gap-3 px-6 text-center text-[var(--text-primary)]">
          <img src="/icons/icon-drag-file.svg" alt="" aria-hidden="true" className="h-20 w-20 select-none" draggable={false} />
          <p className="text-[16px] font-bold leading-[19px]">将附件拖放到此处完成上传</p>
          <p className="text-[14px] font-normal leading-[20px] text-[var(--text-secondary)]">总计最多上传5个附件（每个100MB以内）</p>
          <p className="text-[14px] font-normal leading-[20px] text-[var(--text-secondary)]">支持格式：doc、docx、pdf、txt、xls、xlsx、csv、ppt、pptx</p>
        </div>
      </div>
    </div>,
    host,
  );
}
