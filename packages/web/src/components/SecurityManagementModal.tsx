/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { AppModal } from './AppModal';
import { Tab } from './shared/Tab';
import { ApprovalRecordsTab } from './security-management/ApprovalRecordsTab';
import { SecurityApprovalSettingsTab } from './security-management/SecurityApprovalSettingsTab';
import { useApprovalRecordSettings } from './security-management/useApprovalRecordSettings';
import { useApprovalRecords } from './security-management/useApprovalRecords';
import { useSecurityApprovalSettings } from './security-management/useSecurityApprovalSettings';

export interface SecurityManagementModalProps {
  open: boolean;
  onClose: () => void;
}

type SecurityManagementTab = 'approval' | 'records';

const TAB_ITEMS = [
  { value: 'approval', label: '安全审批' },
  { value: 'records', label: '审批记录' },
];

export default function SecurityManagementModal({ open, onClose }: SecurityManagementModalProps) {
  const [activeTab, setActiveTab] = useState<SecurityManagementTab>('approval');
  const approvalSettings = useSecurityApprovalSettings(open);
  const approvalRecordSettings = useApprovalRecordSettings(open, activeTab === 'records');
  const approvalRecords = useApprovalRecords(open, activeTab === 'records');

  useEffect(() => {
    if (!open) {
      setActiveTab('approval');
    }
  }, [open]);

  useEscapeKey({
    enabled: open,
    onEscape: onClose,
  });

  return (
    <AppModal
      open={open}
      onClose={onClose}
      disableBackdropClose
      title="安全管理"
      closeButtonAriaLabel="关闭安全管理弹窗"
      backdropTestId="security-management-modal-backdrop"
      panelTestId="security-management-modal"
      bodyTestId="security-management-modal-body"
      panelClassName="min-h-[480px] w-[700px] max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] overflow-hidden"
      headerClassName="p-0 pb-4"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mb-4" data-testid="security-management-tabs">
        <Tab
          items={TAB_ITEMS}
          value={activeTab}
          onChange={(value) => setActiveTab(value as SecurityManagementTab)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="security-management-scroll-region">
        {activeTab === 'approval' ? (
          <SecurityApprovalSettingsTab
            loading={approvalSettings.loading}
            loadFailed={approvalSettings.loadFailed}
            approvalBarEnabled={approvalSettings.approvalBarEnabled}
            workspaceRwEnabled={approvalSettings.workspaceRwEnabled}
            savingApprovalBar={approvalSettings.savingApprovalBar}
            savingWorkspaceRw={approvalSettings.savingWorkspaceRw}
            savingPolicyIds={approvalSettings.savingPolicyIds}
            hasPolicies={approvalSettings.hasPolicies}
            paginatedPolicies={approvalSettings.paginatedPolicies}
            page={approvalSettings.page}
            totalPages={approvalSettings.totalPages}
            paginationItems={approvalSettings.paginationItems}
            showPagination={approvalSettings.showPagination}
            searchQuery={approvalSettings.searchQuery}
            onPageChange={approvalSettings.setPage}
            onSearchChange={approvalSettings.handleSearchChange}
            onToggleApprovalBar={() => void approvalSettings.handleToggleApprovalBar()}
            onToggleWorkspaceRw={() => void approvalSettings.handleToggleWorkspaceRw()}
            onTogglePolicy={(id) => void approvalSettings.handleTogglePolicy(id)}
          />
        ) : (
          <ApprovalRecordsTab
            records={approvalRecords.records}
            autoCleanupEnabled={approvalRecordSettings.autoCleanupEnabled}
            loadingAutoCleanupSetting={approvalRecordSettings.loading}
            autoCleanupSettingLoadFailed={approvalRecordSettings.loadFailed}
            savingAutoCleanupSetting={approvalRecordSettings.saving}
            searchQuery={approvalRecords.searchQuery}
            page={approvalRecords.page}
            totalPages={approvalRecords.totalPages}
            paginationItems={approvalRecords.paginationItems}
            showPagination={approvalRecords.showPagination}
            loadingPage={approvalRecords.loadingPage}
            showSearchInput={approvalRecords.showSearchInput}
            showSearchLoading={approvalRecords.showSearchLoading}
            showInitialLoading={approvalRecords.showInitialLoading}
            showEmptyState={approvalRecords.showEmptyState}
            showNoSearchResults={approvalRecords.showNoSearchResults}
            onToggleAutoCleanup={() => void approvalRecordSettings.handleToggleAutoCleanup()}
            onSearchChange={approvalRecords.setSearchQuery}
            onPageChange={(page) => void approvalRecords.handlePageChange(page)}
          />
        )}
      </div>
    </AppModal>
  );
}
