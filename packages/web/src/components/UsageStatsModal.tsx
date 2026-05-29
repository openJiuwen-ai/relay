/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import {
  buildUsageStatsPageFromDataset,
  fetchUsageStatsDataset,
  type UsageRange,
  type UsageStatsFetchOptions,
  type UsageStatsDataset,
  type UsageStatsPageResult,
} from '@/services/usageStats';
import { AppModal } from './AppModal';
import { CenteredLoadingState } from './shared/CenteredLoadingState';
import { EmptyDataState } from './shared/EmptyDataState';
import { OverflowTooltip } from './shared/OverflowTooltip';
import { RefreshButton } from './shared/RefreshButton';
import { formatTokenCount } from './status-helpers';

interface UsageStatsModalProps {
  open: boolean;
  onClose: () => void;
  fetchDataset?: (options?: UsageStatsFetchOptions) => Promise<UsageStatsDataset>;
}

const PAGE_SIZE = 5;
const MIN_LOADING_MS = 300;

const RANGE_OPTIONS: Array<{ value: UsageRange; label: string }> = [
  { value: 'today', label: '今日' },
  { value: '3d', label: '近3日' },
  { value: '7d', label: '近7日' },
  { value: '30d', label: '近30日' },
];

const EMPTY_RESULT: UsageStatsPageResult = {
  items: [],
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
};

const TABLE_STATE_ROW_HEIGHT_CLASS = 'h-40';

export function formatPaginationPages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 8) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([
    1,
    2,
    totalPages - 1,
    totalPages,
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ]);
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  for (let index = 0; index < sortedPages.length; index += 1) {
    const page = sortedPages[index];
    const previous = sortedPages[index - 1];
    if (previous != null && page - previous > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }

  return result;
}

function renderTokenValue(value: number | null): string {
  if (value == null) return '';
  return formatTokenCount(value);
}

export function UsageStatsModal({ open, onClose, fetchDataset = fetchUsageStatsDataset }: UsageStatsModalProps) {
  const rangeMenuRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState<UsageRange>('7d');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRangeMenuOpen, setIsRangeMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<UsageStatsDataset | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const controller = new AbortController();
    let loadingDelayId: ReturnType<typeof setTimeout> | null = null;

    const waitForMinimumLoadingTime = async (elapsed: number) => {
      if (cancelled || elapsed >= MIN_LOADING_MS) return;

      await new Promise<void>((resolve) => {
        const cleanupDelay = () => {
          if (loadingDelayId != null) {
            clearTimeout(loadingDelayId);
            loadingDelayId = null;
          }
          controller.signal.removeEventListener('abort', handleAbort);
        };

        const handleAbort = () => {
          cleanupDelay();
          resolve();
        };

        loadingDelayId = setTimeout(() => {
          cleanupDelay();
          resolve();
        }, MIN_LOADING_MS - elapsed);

        controller.signal.addEventListener('abort', handleAbort, { once: true });
      });
    };

    const load = async () => {
      const startedAt = Date.now();
      setIsLoading(true);
      setError(null);

      try {
        const next = await fetchDataset({ signal: controller.signal });
        if (cancelled) return;
        setDataset(next);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setError('用量数据加载失败，请稍后重试');
        setDataset(null);
      } finally {
        const elapsed = Date.now() - startedAt;
        await waitForMinimumLoadingTime(elapsed);

        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      controller.abort();
      if (loadingDelayId != null) {
        clearTimeout(loadingDelayId);
        loadingDelayId = null;
      }
    };
  }, [fetchDataset, open, refreshKey]);

  useEscapeKey({
    enabled: open,
    onEscape: onClose,
  });

  useEffect(() => {
    if (!open) {
      setIsRangeMenuOpen(false);
      setDataset(null);
      setError(null);
      setPage(1);
      setRange('7d');
    }
  }, [open]);

  useEffect(() => {
    if (!isRangeMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (rangeMenuRef.current?.contains(event.target as Node)) return;
      setIsRangeMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isRangeMenuOpen]);

  const result =
    dataset == null ? EMPTY_RESULT : buildUsageStatsPageFromDataset(dataset, { page, pageSize: PAGE_SIZE, range });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const showPagination = result.total > PAGE_SIZE;
  const paginationItems = showPagination ? formatPaginationPages(page, totalPages) : [];

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handleRefresh = () => {
    if (isLoading) return;
    setRefreshKey((current) => current + 1);
  };

  const handleChangeRange = (nextRange: UsageRange) => {
    if (isLoading) return;
    setRange(nextRange);
    setPage(1);
    setIsRangeMenuOpen(false);
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="用量统计"
      backdropRole="dialog"
      backdropAriaModal
      backdropAriaLabel="用量统计弹窗"
      panelClassName="w-full max-w-[900px] overflow-x-auto"
      bodyClassName="pt-6"
      disableBackdropClose
      panelTestId="usage-stats-modal-panel"
      bodyTestId="usage-stats-modal-body"
      closeButtonAriaLabel="关闭用量统计弹窗"
    >
      <div className="space-y-4 min-w-[300px]">
        <div className="flex items-center justify-between">
          <h4 className="text-[14px] font-semibold leading-none text-[var(--modal-title-text)]">Tokens消耗</h4>

          <div className="flex items-center gap-2">
            <div className="relative" ref={rangeMenuRef}>
              <button
                type="button"
                className="flex items-center gap-1 text-[12px] font-medium text-[var(--modal-text)]"
                onClick={() => {
                  if (isLoading) return;
                  setIsRangeMenuOpen((current) => !current);
                }}
                disabled={isLoading}
                data-testid="usage-stats-range-trigger"
              >
                {RANGE_OPTIONS.find((option) => option.value === range)?.label ?? '近7日'}
                <svg className="h-4 w-4 text-[var(--modal-text-subtle)]" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>

              {isRangeMenuOpen ? (
                <div
                  className="absolute right-0 top-full z-10 mt-2 min-w-[104px] rounded-xl border border-[var(--modal-border)] bg-[var(--modal-surface)] p-1.5 shadow-[var(--modal-shadow)]"
                  data-testid="usage-stats-range-menu"
                >
                  {RANGE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex w-full rounded-lg px-3 py-2 text-left text-[12px] ${
                        option.value === range
                          ? 'text-[var(--modal-accent-text)]'
                          : 'text-[var(--modal-text)] hover:bg-[var(--modal-muted-surface)]'
                      }`}
                      onClick={() => handleChangeRange(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="h-4 w-px bg-[var(--modal-table-divider)]" aria-hidden="true" />

            <RefreshButton
              bordered={false}
              onClick={handleRefresh}
              aria-label="刷新"
              disabled={isLoading}
              data-testid="usage-stats-refresh"
            >
              <img
                src="/images/agent-management-icons/agent-refresh.svg"
                alt=""
                aria-hidden="true"
                width={16}
                height={16}
                className="shrink-0"
              />
            </RefreshButton>
          </div>
        </div>

        <div className="relative overflow-x-auto overflow-y-hidden rounded-[0.5rem] border border-[var(--modal-muted-border)] bg-[var(--modal-surface)] [scrollbar-gutter:auto]">
          <div className="w-full rounded-[0.5rem]">
            <table className="w-full border-collapse table-fixed min-w-[49.5rem]">
              <thead className="bg-[var(--modal-table-header-bg)]">
                <tr className="text-left text-[12px] text-[var(--modal-text-muted)]">
                  <th className="relative h-12 border-b border-[var(--modal-table-divider)] px-4 py-0">
                    会话
                    <span
                      className="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-[var(--modal-table-divider)]"
                      aria-hidden="true"
                    />
                  </th>
                  <th className="relative h-12 w-[150px] border-b border-[var(--modal-table-divider)] px-4 py-0">
                    Input Tokens消耗
                    <span
                      className="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-[var(--modal-table-divider)]"
                      aria-hidden="true"
                    />
                  </th>
                  <th className="relative h-12 w-[150px] border-b border-[var(--modal-table-divider)] px-4 py-0">
                    Output Tokens消耗
                    <span
                      className="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-[var(--modal-table-divider)]"
                      aria-hidden="true"
                    />
                  </th>
                  <th className="relative h-12 w-[132px] border-b border-[var(--modal-table-divider)] px-4 py-0">
                    总Tokens消耗
                    <span
                      className="absolute right-0 top-1/2 h-4 w-px -translate-y-1/2 bg-[var(--modal-table-divider)]"
                      aria-hidden="true"
                    />
                  </th>
                  <th className="h-12 w-[200px] border-b border-[var(--modal-table-divider)] px-4 py-0">时间</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr>
                    <td colSpan={5} className={`${TABLE_STATE_ROW_HEIGHT_CLASS} px-4 py-0`}>
                      <div className="flex h-full items-center justify-center">
                        <EmptyDataState />
                      </div>
                    </td>
                  </tr>
                ) : isLoading && result.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`${TABLE_STATE_ROW_HEIGHT_CLASS} px-4 py-0`} />
                  </tr>
                ) : !isLoading && result.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`${TABLE_STATE_ROW_HEIGHT_CLASS} px-4 py-0`}>
                      <div className="flex h-full items-center justify-center">
                        <EmptyDataState />
                      </div>
                    </td>
                  </tr>
                ) : (
                  result.items.map((item) => (
                    <tr key={item.id} className="border-t border-[var(--modal-table-divider)]" data-testid={`usage-stats-row-${item.id}`}>
                      <td className="h-16 px-4 py-0 text-[14px] text-[var(--modal-text)]">
                        <OverflowTooltip content={item.sessionName} className="w-full">
                          <span className="block truncate">{item.sessionName}</span>
                        </OverflowTooltip>
                      </td>
                      <td
                        className="h-16 px-4 py-0 text-[14px] text-[var(--modal-text)]"
                        title={item.inputTokensUsed != null ? item.inputTokensUsed.toLocaleString() : undefined}
                      >
                        {renderTokenValue(item.inputTokensUsed)}
                      </td>
                      <td
                        className="h-16 px-4 py-0 text-[14px] text-[var(--modal-text)]"
                        title={item.outputTokensUsed != null ? item.outputTokensUsed.toLocaleString() : undefined}
                      >
                        {renderTokenValue(item.outputTokensUsed)}
                      </td>
                      <td
                        className="h-16 px-4 py-0 text-[14px] text-[var(--modal-text)]"
                        title={item.totalTokensUsed != null ? item.totalTokensUsed.toLocaleString() : undefined}
                      >
                        {renderTokenValue(item.totalTokensUsed)}
                      </td>
                      <td className="h-16 px-4 py-0 text-[12px] text-[var(--modal-text)]">{item.occurredAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {isLoading ? (
            <div
              className="absolute inset-x-0 bottom-0 top-12 flex items-center justify-center bg-[var(--modal-loading-overlay)]"
              data-testid="usage-stats-loading-overlay"
            >
              <CenteredLoadingState />
            </div>
          ) : null}
        </div>

        {showPagination ? (
          <div className="flex items-center justify-end gap-1" data-testid="usage-stats-pagination">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                if (isLoading) return;
                setPage((current) => Math.max(1, current - 1));
              }}
              disabled={isLoading || page <= 1}
              aria-label="上一页"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M11.5 5L6.5 10L11.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>

            {paginationItems.map((item, index) =>
              item === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="px-2 text-[14px] text-[var(--modal-text-subtle)]">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[12px] ${
                    item === page
                      ? 'bg-[var(--modal-muted-surface)] text-[var(--modal-text)]'
                      : 'text-[var(--modal-text-muted)] hover:bg-[var(--modal-muted-surface)]'
                  }`}
                  onClick={() => {
                    if (isLoading) return;
                    setPage(item);
                  }}
                  disabled={isLoading}
                >
                  {item}
                </button>
              ),
            )}

            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                if (isLoading) return;
                setPage((current) => Math.min(totalPages, current + 1));
              }}
              disabled={isLoading || page >= totalPages}
              aria-label="下一页"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M8.5 5L13.5 10L8.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    </AppModal>
  );
}
