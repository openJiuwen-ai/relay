/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { MarkdownContent } from './MarkdownContent';
import { NoSearchResultsState } from './shared/NoSearchResultsState';
import { Button } from './shared/Button';
import { SearchInput } from './shared/SearchInput';

export interface PromptSelectionItem {
  id: string;
  title: string;
  description: string;
  content: string;
}

interface PromptSelectionModalProps {
  open: boolean;
  items: PromptSelectionItem[];
  initialSelectedId?: string | null;
  title?: string;
  searchPlaceholder?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (item: PromptSelectionItem) => void;
}

const MODAL_WIDTH = 900;
const MODAL_VIEWPORT_OFFSET = 150;
const CARD_DETAIL_GAP = 16;
const LIST_SCROLLBAR_SLOT = 8;
const CONTENT_GAP = CARD_DETAIL_GAP - LIST_SCROLLBAR_SLOT;
const LIST_WIDTH = 240;
const LIST_SCROLL_CONTAINER_WIDTH = LIST_WIDTH + LIST_SCROLLBAR_SLOT;
const DETAIL_WIDTH = 596;

function RefreshIcon() {
  return <MaskIcon name="refresh" className="h-[18px] w-[18px]" />;
}

function CloseIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6L18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function PromptDetailContent({ item }: { item: PromptSelectionItem }) {
  return (
    <div className="h-full overflow-y-auto">
      <MarkdownContent
        content={item.content}
        className="text-[12px] leading-7 text-[var(--modal-text)] [&_h1]:mb-3 [&_h1]:text-[16px] [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-[16px] [&_h3]:font-semibold [&_ul]:mb-3 [&_li]:text-[var(--modal-text)] [&_p]:text-[var(--modal-text)]"
        disableCommandPrefix
      />
    </div>
  );
}

function buildItemSummary(item: PromptSelectionItem): string {
  const summary = item.description.trim();
  if (summary) return summary;

  return item.content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchFields(item: PromptSelectionItem): string[] {
  return [item.id, item.title, item.description, item.content];
}

function promptItemMatchesQuery(item: PromptSelectionItem, query: string): boolean {
  const lowered = query.toLowerCase();
  return buildSearchFields(item).some((field) => field.toLowerCase().includes(lowered));
}

export function PromptSelectionModal({
  open,
  items,
  initialSelectedId = null,
  title = '灵魂模板',
  searchPlaceholder = '输入关键字搜索',
  cancelLabel = '取消',
  confirmLabel = '插入',
  onClose,
  onConfirm,
}: PromptSelectionModalProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedId(initialSelectedId ?? items[0]?.id ?? null);
  }, [initialSelectedId, items, open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  const filteredItems = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return items;

    return items.filter((item) => promptItemMatchesQuery(item, normalized));
  }, [items, query]);
  const hasNoMatches = filteredItems.length === 0;

  const selectedItem = useMemo(() => {
    if (hasNoMatches) return null;
    return filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];
  }, [filteredItems, hasNoMatches, selectedId]);

  useEffect(() => {
    if (!open) return;
    if (!selectedItem) {
      setSelectedId(null);
      return;
    }
    if (selectedItem.id !== selectedId) {
      setSelectedId(selectedItem.id);
    }
  }, [open, selectedId, selectedItem]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--overlay-backdrop-strong)] px-6 pb-[50px] pt-[100px]"
      data-testid="prompt-selection-modal"
    >
      <div
        className="flex w-full max-w-[900px] flex-col overflow-y-auto rounded-[8px] border border-[var(--modal-border)] bg-[var(--modal-surface)] p-6 shadow-[var(--modal-shadow)]"
        style={{ width: MODAL_WIDTH, maxHeight: `calc(100vh - ${MODAL_VIEWPORT_OFFSET}px)` }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold leading-none text-[var(--modal-title-text)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--text-label-secondary)] transition-colors hover:text-[var(--text-primary)]"
            aria-label="关闭提示词选择"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-col">
          <div className="flex items-center gap-3">
            <SearchInput
              wrapperClassName="min-w-0 flex-1"
              value={query}
              onChange={(value) => setQuery(value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              data-testid="prompt-search-input"
            />
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex h-8 w-8 items-center justify-center rounded-[6px] border border-[var(--modal-muted-border)] bg-[var(--modal-surface)] transition hover:bg-[var(--modal-muted-surface-hover)]"
              aria-label="清空搜索"
            >
              <RefreshIcon />
            </button>
          </div>

          <div className="mt-4 flex min-h-0" style={{ gap: CONTENT_GAP }}>
            {hasNoMatches ? (
              <section
                data-testid="prompt-empty-state"
                className="flex min-h-[420px] flex-1 items-center justify-center rounded-[10px] border border-[var(--modal-muted-border)] bg-[var(--modal-surface)] px-8 py-10"
              >
                <NoSearchResultsState
                  onClear={() => setQuery('')}
                  title="暂未匹配到数据"
                  description="没有匹配到符合条件的数据"
                  clearLabel="清除筛选器"
                />
              </section>
            ) : (
              <>
                <aside
                  className="flex shrink-0 flex-col gap-2 overflow-x-hidden overflow-y-auto bg-[var(--modal-surface)] pr-2"
                  style={{ width: LIST_SCROLL_CONTAINER_WIDTH }}
                >
                  {filteredItems.map((item) => {
                    const isSelected = item.id === selectedItem?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`block h-[68px] min-h-[68px] shrink-0 overflow-hidden rounded-[8px] p-3 text-left transition ${
                          isSelected
                            ? 'border border-[var(--modal-selected-border)] bg-[var(--modal-surface)] shadow-[var(--modal-selected-shadow)]'
                            : 'border border-[var(--modal-muted-border)] bg-[var(--modal-muted-surface)] hover:bg-[var(--modal-surface)]'
                        }`}
                        data-testid={`prompt-list-item-${item.id}`}
                      >
                        <div className="flex h-full min-w-0 w-full flex-col justify-center overflow-hidden">
                          <div className="h-[22px] w-full truncate text-[14px] font-semibold leading-[22px] text-[var(--modal-text)]">
                            {item.title}
                          </div>
                          <div className="mt-1 h-[18px] w-full truncate overflow-hidden text-[12px] leading-[18px] text-[var(--modal-text-muted)]">
                            {buildItemSummary(item)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </aside>

                <section
                  data-testid="prompt-detail-panel"
                  className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-[var(--modal-muted-border)] bg-[var(--modal-surface)] p-4"
                  style={{ width: DETAIL_WIDTH }}
                >
                  {selectedItem ? (
                    <PromptDetailContent item={selectedItem} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[13px] text-[var(--modal-empty-text)]">请选择左侧提示词</div>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="mt-3 flex justify-end gap-3">
            <Button
              onClick={onClose}
              color="default"
            >
              {cancelLabel}
            </Button>
            <Button
              onClick={() => selectedItem && onConfirm(selectedItem)}
              color="major"
              disabled={!selectedItem}
              data-testid="prompt-confirm-button"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
