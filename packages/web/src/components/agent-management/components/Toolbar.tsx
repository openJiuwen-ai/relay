/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useState } from 'react';
import { Button } from '@/components/shared/Button';
import { SearchInput } from '@/components/shared/SearchInput';
import { RefreshButton } from '@/components/shared/RefreshButton';
import type { AgentSourceFilter } from '../utils';

export interface ToolbarProps {
  searchQuery: string;
  sourceFilter: AgentSourceFilter;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
  onSourceFilterChange: (filter: AgentSourceFilter) => void;
  onRefresh: () => void;
  loading?: boolean;
}

const SOURCE_FILTER_OPTIONS: Array<{ value: AgentSourceFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'seed', label: '预置智能体' },
  { value: 'runtime', label: '自定义' },
  { value: 'experts-plaza', label: '智能体广场' },
];

export function Toolbar({
  searchQuery,
  sourceFilter,
  onSearchChange,
  onClearSearch,
  onSourceFilterChange,
  onRefresh,
  loading,
}: ToolbarProps) {
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);

  const activeSourceLabel = SOURCE_FILTER_OPTIONS.find((opt) => opt.value === sourceFilter)?.label ?? '全部';

  return (
    <div className="flex w-full items-center gap-3">
      <div className="relative w-[120px] shrink-0">
        <select
          aria-label="筛选来源"
          value={sourceFilter}
          onChange={(e) => onSourceFilterChange(e.target.value as AgentSourceFilter)}
          className="sr-only"
          tabIndex={-1}
        >
          {SOURCE_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSourceMenuOpen((prev) => !prev)}
          className={`ui-field flex h-[28px] w-[120px] items-center justify-between rounded-[6px] px-[12px] py-[5px] text-xs transition-colors ${sourceMenuOpen ? 'border-[#191919]' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={sourceMenuOpen}
        >
          <span className="truncate text-[var(--text-primary)]">{activeSourceLabel}</span>
          <svg
            className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform duration-200 ${sourceMenuOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {sourceMenuOpen ? (
          <div
            role="listbox"
            className="absolute left-0 top-[calc(100%+4px)] z-30 w-[120px] rounded-[6px] bg-[var(--surface-panel)] py-[8px] shadow-[0_2px_12px_0_var(--tooltip-shadow-color)]"
          >
            {SOURCE_FILTER_OPTIONS.map((opt) => {
              const isSelected = opt.value === sourceFilter;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSourceFilterChange(opt.value);
                    setSourceMenuOpen(false);
                  }}
                  className={`flex h-[32px] w-full items-center px-[16px] py-[7px] text-left text-xs transition-colors hover:bg-[var(--tag-bg)] ${isSelected ? 'text-[var(--text-accent)]' : 'text-[var(--text-primary)]'}`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <SearchInput
        value={searchQuery}
        onChange={onSearchChange}
        onClear={onClearSearch}
        placeholder="搜索智能体"
        aria-label="搜索智能体"
        clearAriaLabel="清除搜索"
        wrapperClassName="flex-1"
      />
      <RefreshButton
        onClick={onRefresh}
        disabled={loading}
        aria-label="刷新列表"
      />
    </div>
  );
}
