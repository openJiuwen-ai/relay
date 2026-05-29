/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo, useState } from 'react';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';
import { SearchInput } from '@/components/shared/SearchInput';

const DEFAULT_MODEL_ICON = '/avatars/assistant.svg';

export interface ModelOption {
  id: string;
  name: string;
  icon?: string;
  providerGroup?: string;
  experienceText?: string;
  statusText?: string;
  rightLabel?: string;
}

export interface ModelOptionGroup {
  id: string;
  label: string;
  items: ModelOption[];
}

interface ModelSelectDropdownProps {
  groups: ModelOptionGroup[];
  selectedId?: string | null;
  searchPlaceholder?: string;
  onSelect?: (item: ModelOption) => void;
}

interface ModelSelectValueProps {
  item?: ModelOption | null;
  placeholder?: string;
  loading?: boolean;
}

function ChevronDownIcon() {
  return (
    <svg className="h-4 w-4 text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 10L12 15L17 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModelIcon({ item }: { item: ModelOption }) {
  const imageSrc = item.icon?.trim() || DEFAULT_MODEL_ICON;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt={`${item.name} icon`}
      data-testid={`model-logo-${item.name}`}
      className="h-[18px] w-[18px] shrink-0 object-contain"
    />
  );
}

export function ModelSelectValueDraft({
  item,
  placeholder = '请选择模型',
  loading = false,
}: ModelSelectValueProps) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {item && !loading ? <ModelIcon item={item} /> : null}
      <OverflowTooltip content={loading ? '加载模型中...' : (item?.name ?? placeholder)} className="min-w-0">
        <span
          className={`block min-w-0 truncate text-[12px] ${item ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}
          style={{
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            wordBreak: 'break-all',
          }}
        >
          {loading ? '加载模型中...' : (item?.name ?? placeholder)}
        </span>
      </OverflowTooltip>
    </span>
  );
}

export function ModelSelectTriggerIcon() {
  return <ChevronDownIcon />;
}

export function ModelSelectDropdown({
  groups,
  selectedId = null,
  searchPlaceholder = '输入关键字搜索',
  onSelect,
}: ModelSelectDropdownProps) {
  const [query, setQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return groups;

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = [item.name, item.providerGroup, item.experienceText, item.statusText, item.rightLabel]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalized);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <div
      className="ui-panel flex max-h-[335px] w-full py-2 flex-col overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-panel)] shadow-[0_10px_24px_rgba(0,0,0,0.09)]"
      data-testid="model-select-dropdown"
    >
      <div className="px-4 py-1">
        <SearchInput
          aria-label="搜索模型"
          value={query}
          onChange={(value) => setQuery(value)}
          onClear={() => setQuery('')}
          placeholder={searchPlaceholder}
          wrapperClassName="w-full"
          inputClassName="rounded-[var(--radius-pill)]"
        />
      </div>
      <div aria-hidden="true" className="my-[6px] h-px w-full bg-[var(--panel-border-outer)]" />

      <div role="listbox" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {filteredGroups.map((group) => (
          <div key={group.id}>
            <div className="px-4 text-[12px] font-medium leading-[32px] text-[var(--text-label-secondary)]">{group.label}</div>
            {group.items.map((item) => {
              const isSelected = item.id === selectedId;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`model-row-${item.id}`}
                  onClick={() => onSelect?.(item)}
                  className={`flex min-h-[34px] w-full items-center border-0 px-4 py-1.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-[var(--menu-active-bg)] text-[var(--text-accent)]'
                      : 'bg-[var(--surface-panel)] text-[var(--modal-text)] hover:bg-[var(--menu-hover-bg)] hover:text-[var(--text-accent)]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ModelIcon item={item} />
                    <div className="min-w-0">
                      <OverflowTooltip content={item.name} className="w-full">
                        <div
                          className="block min-w-0 truncate text-[14px] leading-[20px] font-normal text-current"
                          style={{
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {item.name}
                        </div>
                      </OverflowTooltip>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}

        {filteredGroups.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">没有匹配的模型</div>
        ) : null}
      </div>
    </div>
  );
}
