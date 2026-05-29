/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { exportThreadImage, exportThreadText } from '@/utils/thread-export';
import { DownloadIcon } from './icons/DownloadIcon';

type ExportFormat = 'png' | 'md' | 'txt';

interface ExportOption {
  format: ExportFormat;
  label: string;
  description: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  { format: 'png', label: '导出长图', description: 'PNG 截图' },
  { format: 'md', label: '下载聊天记录', description: 'Markdown' },
  { format: 'txt', label: '下载聊天记录', description: '纯文本' },
];

export function ExportButton({ threadId }: { threadId: string }) {
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      setMenuOpen(false);
      setLoading(true);
      try {
        if (format === 'png') {
          await exportThreadImage(threadId);
        } else {
          await exportThreadText(threadId, format);
        }
      } catch (error) {
        console.error('导出失败:', error);
        alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setLoading(false);
      }
    },
    [threadId],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        disabled={loading}
        className="p-1 rounded-lg hover:bg-cocreator-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="导出会话"
        aria-label="导出会话"
      >
        {loading ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-5 h-5 animate-spin text-gray-500"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 019.8 8" />
          </svg>
        ) : (
          <DownloadIcon className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-cafe-white border border-cocreator-light rounded-lg shadow-lg z-50 py-1">
          {EXPORT_OPTIONS.map((opt) => (
            <button
              key={opt.format}
              onClick={() => handleExport(opt.format)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-cocreator-light transition-colors flex items-center justify-between"
            >
              <span className="text-cafe-black">{opt.label}</span>
              <span className="text-xs text-gray-400">{opt.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
