/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type CSSProperties, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type AgentOption } from '../chat-input-options';
import { useMentionMenuInput } from '../hooks/useMentionMenuInput';

interface ChatInputMenusProps {
  agentOptions: AgentOption[];
  showMentions: boolean;
  mentionFilter: string;
  onMentionFilterChange: (value: string) => void;
  onCloseMentionMenu: () => void;
  selectedIdx: number;
  onSelectIdx: (i: number) => void;
  onInsertMention: (opt: AgentOption) => void;
  menuRef: RefObject<HTMLDivElement>;
  mentionMenuStyle?: CSSProperties;
}

function catInitial(name?: string): string {
  if (!name) return '?';
  const normalized = name.replace(/^@/, '').trim();
  return (normalized.slice(0, 1) || '?').toUpperCase();
}

function renderMentionAvatar(opt: AgentOption) {
  const avatar = opt.avatar?.trim() ?? '';
  const isImageAvatar = /^(https?:\/\/|\/|data:image)/.test(avatar);

  if (isImageAvatar) {
    return (
      <img
        src={avatar}
        alt={opt.label}
        className="w-[18px] h-[18px] rounded-full shrink-0 object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ backgroundColor: opt.color || '#7AAEFF' }}
    >
      {avatar || catInitial(opt.label)}
    </span>
  );
}

export function ChatInputMenus({
  agentOptions,
  showMentions,
  mentionFilter,
  onMentionFilterChange,
  onCloseMentionMenu,
  selectedIdx,
  onSelectIdx,
  onInsertMention,
  menuRef,
  mentionMenuStyle,
}: ChatInputMenusProps) {
  const { handleMentionFilterChange, handleMentionFilterKeyDown } = useMentionMenuInput({
    agentOptions,
    selectedIdx,
    onSelectIdx,
    onInsertMention,
    onCloseMentionMenu,
    onMentionFilterChange,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // Auto-scroll selected item into view on keyboard navigation
  const selectedRef = useCallback((node: HTMLButtonElement | null) => {
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  // Detect if more items are hidden below
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollDown(false);
      return;
    }
    const check = () => setCanScrollDown(el.scrollHeight > el.clientHeight + el.scrollTop + 4);
    check();
    el.addEventListener('scroll', check);
    return () => el.removeEventListener('scroll', check);
  }, []);

  return (
    <>
      {showMentions && (
        <div
          ref={menuRef}
          className="fixed bg-white rounded-xl shadow-lg overflow-hidden w-[200px] z-20 flex flex-col p-2"
          style={mentionMenuStyle}
        >
          <div className="px-1 pt-0 pb-2">
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                value={mentionFilter}
                onChange={(e) => handleMentionFilterChange(e.target.value)}
                onKeyDown={handleMentionFilterKeyDown}
                placeholder="请输入关键字搜索"
                className="ui-input ui-input-underline w-full py-1 pl-6 pr-0 text-[12px]"
              />
            </div>
          </div>
          <div ref={scrollRef} className="max-h-[220px] overflow-y-auto flex-1 border-0">
            {agentOptions.map((opt, i) => (
              <button
                key={opt.id}
                ref={i === selectedIdx ? selectedRef : undefined}
                className={`w-full h-[34px] text-left p-2 rounded-[6px] flex items-center gap-2 transition-colors ${i === selectedIdx ? 'bg-[rgba(245,245,245,1)]' : 'hover:bg-[rgba(245,245,245,1)]'}`}
                onMouseEnter={() => onSelectIdx(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onInsertMention(opt);
                }}
                title={opt.label}
              >
                {renderMentionAvatar(opt)}
                <div className="min-w-0 flex-1 truncate text-[12px] leading-[18px] font-normal text-[#191919]">
                  {opt.label}
                </div>
              </button>
            ))}
          </div>
           {canScrollDown && (
            <div className="px-4 py-1 text-[10px] text-gray-400 text-center bg-gradient-to-t from-white shrink-0">
              ↓ 还有更多智能体
            </div>
          )}
          {agentOptions.length === 0 && <div className="px-4 py-2.5 text-xs text-gray-400">无匹配智能体</div>}
        </div>
      )}
    </>
  );
}


