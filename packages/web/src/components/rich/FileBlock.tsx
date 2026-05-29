/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import type { RichFileBlock } from '@/stores/chat-types';

const EXT_ICONS: Record<string, string> = {
  pdf: '📄',
  doc: '📝',
  docx: '📝',
  xls: '📊',
  xlsx: '📊',
  xlsm: '📊',
  xlsb: '📊',
  ppt: '📎',
  pptx: '📎',
  md: '📋',
  txt: '📋',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSafeUrl(url: string): boolean {
  return /^\/uploads\//.test(url) || /^https:\/\//.test(url);
}

function getLegacyWorkspacePath(block: RichFileBlock): string | null {
  if (block.worktreeId && block.workspacePath) {
    return block.workspacePath;
  }
  if (!block.url.startsWith('/api/workspace/download?')) return null;
  const query = block.url.split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const path = params.get('path');
  return path;
}

export function FileBlock({ block }: { block: RichFileBlock }) {
  const ext = block.fileName.split('.').pop()?.toLowerCase() ?? '';
  const icon = EXT_ICONS[ext] ?? '📎';
  const safeHref = isSafeUrl(block.url) ? block.url : undefined;
  const legacyWorkspacePath = useMemo(() => getLegacyWorkspacePath(block), [block]);
  const isLegacyWorkspaceFile = legacyWorkspacePath != null;
  const secondaryText = isLegacyWorkspaceFile
    ? '历史 workspace 文件，能力已下线'
    : block.fileSize != null
      ? formatFileSize(block.fileSize)
      : block.mimeType ?? '附件';

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E9E5DF] bg-[#FBF9F6] px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#FFF1E8] text-lg text-[#C96A22]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#1F2937]">{block.fileName}</div>
        <div className="text-xs text-[#8C8C8C]">{secondaryText}</div>
        {legacyWorkspacePath ? (
          <div className="mt-1 break-all text-[11px] text-[#A3A3A3]">位置: {legacyWorkspacePath}</div>
        ) : null}
      </div>
      {isLegacyWorkspaceFile ? (
        <span className="inline-flex flex-shrink-0 items-center rounded-full border border-[#E5D7C9] bg-[#F5EEE8] px-4 py-1.5 text-xs font-medium text-[#8C6B55]">
          已下线
        </span>
      ) : (
        <a
          href={safeHref}
          download={safeHref ? block.fileName : undefined}
          className="inline-flex flex-shrink-0 items-center rounded-full border border-[#D2CDC4] bg-white px-4 py-1.5 text-xs font-medium text-[#3F3B37] transition-colors hover:bg-[#F4F1EC]"
        >
          下载
        </a>
      )}
    </div>
  );
}
