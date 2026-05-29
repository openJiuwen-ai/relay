/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { CenteredLoadingState } from '../shared/CenteredLoadingState';
import { EmptyDataState } from '../shared/EmptyDataState';
import { NoSearchResultsState } from '../shared/NoSearchResultsState';
import { OverflowTooltip } from '../shared/OverflowTooltip';
import { SearchInput } from '../shared/SearchInput';
import { ToggleSwitch } from '../shared/ToggleSwitch';
import type { ApprovalRecord } from './types';
import { formatApprovalRecordTime } from './useApprovalRecords';

interface ApprovalRecordsTabProps {
  records: ApprovalRecord[];
  autoCleanupEnabled: boolean;
  loadingAutoCleanupSetting: boolean;
  autoCleanupSettingLoadFailed: boolean;
  savingAutoCleanupSetting: boolean;
  searchQuery: string;
  page: number;
  totalPages: number;
  paginationItems: Array<number | 'ellipsis'>;
  showPagination: boolean;
  loadingPage: boolean;
  showSearchInput: boolean;
  showSearchLoading: boolean;
  showInitialLoading: boolean;
  showEmptyState: boolean;
  showNoSearchResults: boolean;
  onToggleAutoCleanup: () => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
}

export function ApprovalRecordsTab({
  records,
  autoCleanupEnabled,
  loadingAutoCleanupSetting,
  autoCleanupSettingLoadFailed,
  savingAutoCleanupSetting,
  searchQuery,
  page,
  totalPages,
  paginationItems,
  showPagination,
  loadingPage,
  showSearchInput,
  showSearchLoading,
  showInitialLoading,
  showEmptyState,
  showNoSearchResults,
  onToggleAutoCleanup,
  onSearchChange,
  onPageChange,
}: ApprovalRecordsTabProps) {
  return (
    <div className="space-y-4" data-testid="approval-records-tab">
      <section>
        <div className="flex items-center justify-between gap-4" data-testid="approval-records-auto-cleanup-header">
          <h4 className="text-[12px] text-[var(--text-primary)]">自动清理安全审批记录</h4>
          <ToggleSwitch
            checked={autoCleanupEnabled}
            onToggle={onToggleAutoCleanup}
            ariaLabel="自动清理安全审批记录"
            disabled={loadingAutoCleanupSetting || autoCleanupSettingLoadFailed || savingAutoCleanupSetting}
            testId="approval-records-auto-cleanup-toggle"
          />
        </div>
        <p
          className="mt-1 block w-full text-[12px] text-[color:rgba(128,128,128,1)]"
          data-testid="approval-records-auto-cleanup-description"
        >
          开启后，将仅保存近30天的审批数据；关闭则保存历史全部的审批记录
        </p>
      </section>

      <section className="space-y-3">
        <h4 className="text-[12px] text-[var(--text-primary)]" data-testid="approval-records-title">
          审批记录
        </h4>

        {showInitialLoading ? (
          <div
            className="flex min-h-[220px] flex-1 items-center justify-center"
            data-testid="approval-records-loading"
          >
            <CenteredLoadingState />
          </div>
        ) : null}

        {!showInitialLoading && showEmptyState && !showSearchInput ? (
          <div
            className="flex min-h-[220px] flex-1 items-center justify-center"
            data-testid="approval-records-empty-state"
          >
            <EmptyDataState title="暂无审批记录"/>
          </div>
        ) : null}

        {!showInitialLoading && showSearchInput ? (
          <SearchInput
            value={searchQuery}
            onChange={(value) => onSearchChange(value)}
            onClear={() => onSearchChange('')}
            placeholder="请输入会话名称搜索"
            data-testid="approval-records-search-input"
          />
        ) : null}

        {!showInitialLoading && showSearchLoading ? (
          <div
            className="flex min-h-[180px] items-center justify-center"
            data-testid="approval-records-search-loading"
          >
            <CenteredLoadingState />
          </div>
        ) : null}

        {!showInitialLoading && !showSearchLoading && showNoSearchResults ? (
          <div className="flex min-h-[180px] items-center justify-center" data-testid="approval-records-no-results">
            <NoSearchResultsState onClear={() => onSearchChange('')} />
          </div>
        ) : null}

        {!showInitialLoading && !showSearchLoading && !showNoSearchResults && records.length > 0 ? (
          <>
            <div
              className="overflow-hidden rounded-[12px] border border-[var(--modal-muted-border)]"
              data-testid="approval-records-table"
            >
              <div className="grid grid-cols-[1.8fr_1fr_0.8fr_0.9fr] border-b border-[var(--modal-muted-border)] bg-[var(--modal-table-header-bg)] px-5 py-4 text-[12px] font-medium text-[var(--modal-text-muted)]">
                <div>会话名称</div>
                <div>敏感操作</div>
                <div>审批结果</div>
                <div>时间</div>
              </div>
              <div className="bg-[var(--modal-surface)]">
                {records.map((record) => (
                  (() => {
                    const threadLabel = record.threadTitle || record.threadId || '--';
                    const timeLabel = formatApprovalRecordTime(record.decidedAt);

                    return (
                      <div
                        key={record.id}
                        className="grid grid-cols-[1.8fr_1fr_0.8fr_0.9fr] items-center border-b border-[var(--modal-table-divider)] px-5 py-4 text-[12px] text-[var(--modal-title-text)] last:border-b-0"
                        data-testid={`approval-record-row-${record.id}`}
                      >
                        <div className="min-w-0 pr-4" data-testid={`approval-record-cell-${record.id}-thread`}>
                          <OverflowTooltip content={threadLabel} className="min-w-0">
                            <span className="block truncate text-[var(--modal-text)]">{threadLabel}</span>
                          </OverflowTooltip>
                        </div>
                        <div className="min-w-0 pr-4" data-testid={`approval-record-cell-${record.id}-action`}>
                          <OverflowTooltip content={record.action} className="min-w-0">
                            <span className="block truncate text-[var(--modal-text)]">{record.action}</span>
                          </OverflowTooltip>
                        </div>
                        <div className="min-w-0 pr-4" data-testid={`approval-record-cell-${record.id}-result`}>
                          <OverflowTooltip content={record.approvalLabel} className="min-w-0">
                            <span className="block truncate">{record.approvalLabel}</span>
                          </OverflowTooltip>
                        </div>
                        <div className="min-w-0" data-testid={`approval-record-cell-${record.id}-time`}>
                          <OverflowTooltip content={timeLabel} className="min-w-0">
                            <span className="block truncate tabular-nums">{timeLabel}</span>
                          </OverflowTooltip>
                        </div>
                      </div>
                    );
                  })()
                ))}
              </div>
            </div>

            {showPagination ? (
              <div className="flex items-center justify-end gap-1 pt-1" data-testid="approval-records-pagination">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={loadingPage || page <= 1}
                  aria-label="上一页"
                  data-testid="approval-records-pagination-prev"
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
                      onClick={() => onPageChange(item)}
                      disabled={loadingPage}
                      data-testid={`approval-records-pagination-page-${item}`}
                    >
                      {item}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={loadingPage || page >= totalPages}
                  aria-label="下一页"
                  data-testid="approval-records-pagination-next"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path d="M8.5 5L13.5 10L8.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
