/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { CenteredLoadingState } from '../shared/CenteredLoadingState';
import { NoSearchResultsState } from '../shared/NoSearchResultsState';
import { SearchInput } from '../shared/SearchInput';
import { ToggleSwitch } from '../shared/ToggleSwitch';
import type { SecurityPolicyItem } from './types';

interface SecurityApprovalSettingsTabProps {
  loading: boolean;
  loadFailed: boolean;
  approvalBarEnabled: boolean;
  workspaceRwEnabled: boolean;
  savingApprovalBar: boolean;
  savingWorkspaceRw: boolean;
  savingPolicyIds: Record<string, boolean>;
  hasPolicies: boolean;
  paginatedPolicies: SecurityPolicyItem[];
  page: number;
  totalPages: number;
  paginationItems: Array<number | 'ellipsis'>;
  showPagination: boolean;
  searchQuery: string;
  onPageChange: (page: number) => void;
  onSearchChange: (value: string) => void;
  onToggleApprovalBar: () => void;
  onToggleWorkspaceRw: () => void;
  onTogglePolicy: (id: string) => void;
}

export function SecurityApprovalSettingsTab({
  loading,
  loadFailed,
  approvalBarEnabled,
  workspaceRwEnabled,
  savingApprovalBar,
  savingWorkspaceRw,
  savingPolicyIds,
  hasPolicies,
  paginatedPolicies,
  page,
  totalPages,
  paginationItems,
  showPagination,
  searchQuery,
  onPageChange,
  onSearchChange,
  onToggleApprovalBar,
  onToggleWorkspaceRw,
  onTogglePolicy,
}: SecurityApprovalSettingsTabProps) {
  if (loading) {
    return (
      <div
        className="flex min-h-[220px] flex-1 items-center justify-center"
        data-testid="security-management-loading"
      >
        <CenteredLoadingState />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="flex flex-col justify-center" data-testid="security-management-load-failed">
        <p className="text-[14px] text-[var(--text-secondary)]">加载安全权限配置失败</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between gap-4" data-testid="security-management-approval-header">
          <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">是否开启审批护栏</h4>
          <ToggleSwitch
            checked={approvalBarEnabled}
            onToggle={onToggleApprovalBar}
            ariaLabel="是否开启审批护栏"
            disabled={savingApprovalBar}
            testId="security-management-approval-bar-toggle"
          />
        </div>
        <p
          className="mt-1 block w-full text-[12px] text-[color:rgba(128,128,128,1)]"
          data-testid="security-management-approval-description"
        >
          开启后，若对话中触发相关权限时按安全策略展示确认卡片；若关闭，则所有敏感操作无需用户执行风险审批。
        </p>
      </section>

      {approvalBarEnabled && hasPolicies ? (
        <section data-testid="security-management-workspace-rw-section">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-[12px] text-[var(--text-primary)]">信任工作空间内文件读写</h4>
              <ToggleSwitch
                checked={workspaceRwEnabled}
                onToggle={onToggleWorkspaceRw}
                ariaLabel="是否信任会话空间内读写"
                disabled={savingWorkspaceRw}
                testId="security-management-workspace-rw-toggle"
              />
            </div>
            <p
              className="mt-1 block w-full text-[12px] text-[color:rgba(128,128,128,1)]"
              data-testid="security-management-workspace-rw-description"
            >
              开启后，将允许工作空间内可以自由读写所有本地文件，不对工作空间下发生的敏感操作进行拦截审批。
            </p>
          </div>
        </section>
      ) : null}

      {approvalBarEnabled ? (
        <section className="space-y-2" data-testid="security-management-policy-section">
          <h4 className="text-[12px] text-[var(--text-primary)]">安全策略配置</h4>

          <SearchInput
            value={searchQuery}
            onChange={(value) => onSearchChange(value)}
            onClear={() => onSearchChange('')}
            placeholder="搜索敏感操作"
            wrapperClassName="mb-3"
            data-testid="security-policy-search-input"
          />

          <div className="overflow-hidden rounded-[12px] border border-[var(--modal-muted-border)]">
            <div className="grid grid-cols-[1.6fr_1.4fr] border-b border-[var(--modal-muted-border)] bg-[var(--modal-table-header-bg)] px-5 py-4 text-[12px] font-medium text-[var(--modal-text-muted)]">
              <div>敏感操作</div>
              <div>在对话中是否需要审批</div>
            </div>

            <div className="bg-[var(--modal-surface)]">
              {paginatedPolicies.length === 0 ? (
                <div className="flex items-center justify-center px-5 py-8">
                  <NoSearchResultsState
                    onClear={() => onSearchChange('')}
                    title="暂未匹配到数据"
                    description="没有匹配到符合条件的敏感操作"
                    clearLabel="清空筛选器"
                  />
                </div>
              ) : (
                paginatedPolicies.map((policy) => (
                  <div
                    key={policy.id}
                    data-testid={`security-policy-row-${policy.id}`}
                    className="grid grid-cols-[1.6fr_1.4fr] items-center border-b border-[var(--modal-table-divider)] px-5 py-5 text-[12px] text-[var(--modal-title-text)] last:border-b-0"
                  >
                    <div className="font-normal leading-5 text-[var(--modal-text)]">{policy.action}</div>
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={policy.approvalRequired}
                        onToggle={() => onTogglePolicy(policy.id)}
                        ariaLabel={`${policy.action} 执行前审批开关`}
                        disabled={Boolean(savingPolicyIds[policy.id])}
                        testId={`security-policy-toggle-${policy.id}`}
                      />
                      <span className="text-[12px] text-[var(--modal-title-text)]">
                        {policy.approvalRequired ? '是' : '否'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {showPagination ? (
            <div className="flex items-center justify-end gap-1" data-testid="security-management-pagination">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
                aria-label="上一页"
                data-testid="security-management-pagination-prev"
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
                    data-testid={`security-management-pagination-page-${item}`}
                  >
                    {item}
                  </button>
                ),
              )}

              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--modal-text-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                aria-label="下一页"
                data-testid="security-management-pagination-next"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M8.5 5L13.5 10L8.5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
