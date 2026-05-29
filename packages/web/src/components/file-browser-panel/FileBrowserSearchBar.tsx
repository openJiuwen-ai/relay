/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

interface FileBrowserSearchBarProps {
  value: string;
  onChange: (next: string) => void;
}

export function FileBrowserSearchBar({ value, onChange }: FileBrowserSearchBarProps) {
  return (
    <div className="relative mb-3 shrink-0">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#BFBFBF]"
        aria-hidden
      >
        <title>搜索</title>
        <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zm0-1a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" fill="currentColor" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="输入关键字搜索"
        className="h-9 w-full rounded-lg border border-[#F0F0F0] bg-[#FAFAFA] py-2 pl-9 pr-3 text-[13px] leading-[18px] text-[#1F1F1F] placeholder:text-[#BFBFBF] outline-none transition-colors focus:border-[#D9D9D9] focus:bg-white"
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}
