/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F080-P2: Path completion dropdown menu.
 * Displays file/directory candidates from the API.
 */

'use client';

import type { PathEntry } from '@/hooks/usePathCompletion';

interface PathCompletionMenuProps {
  entries: PathEntry[];
  selectedIdx: number;
  onSelectIdx: (i: number) => void;
  onSelect: (entry: PathEntry) => void;
}

export function PathCompletionMenu({ entries, selectedIdx, onSelectIdx, onSelect }: PathCompletionMenuProps) {
  if (entries.length === 0) return null;

  return (
    <div
      data-testid="path-completion-menu"
      className="absolute bottom-full left-4 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden w-80 z-10 max-h-64 flex flex-col"
    >
      <div className="overflow-y-auto flex-1">
        {entries.map((entry, i) => (
          <button
            key={entry.path}
            className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-sm ${
              i === selectedIdx ? 'bg-gray-50' : 'hover:bg-gray-50'
            }`}
            onMouseEnter={() => onSelectIdx(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(entry);
            }}
          >
            <span className="text-base w-5 text-center shrink-0">
              {entry.isDirectory ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}
            </span>
            <span className="truncate font-mono text-xs text-gray-700">{entry.name}</span>
          </button>
        ))}
      </div>
      <div className="px-3 py-1 text-[10px] text-gray-400 border-t border-gray-100 shrink-0">
        Tab/Enter 选择 · Esc 关闭
      </div>
    </div>
  );
}
