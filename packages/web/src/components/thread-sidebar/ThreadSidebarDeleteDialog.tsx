/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React from 'react';
import { Button } from '../shared/Button';
import { AppModal } from '../AppModal';
import type { Thread } from '@/stores/chatStore';

interface ThreadSidebarDeleteDialogProps {
  deleteTarget: Thread | null;
  deleteTargetSharedCount: number;
  deleteTargetIsShared: boolean;
  deleteWorkspace: boolean;
  setDeleteWorkspace: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ThreadSidebarDeleteDialog({
  deleteTarget,
  deleteTargetSharedCount,
  deleteTargetIsShared,
  deleteWorkspace,
  setDeleteWorkspace,
  onClose,
  onConfirm,
}: ThreadSidebarDeleteDialogProps) {
  return (
    <AppModal
      open={!!deleteTarget}
      onClose={onClose}
      disableBackdropClose
      title={
        <div className="flex items-center gap-2">
          <svg className="h-6 w-6 text-[var(--state-warning-text)]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.866 3.5a1 1 0 0 0-1.732 0l-8.25 14.5A1 1 0 0 0 3.75 19.5h16.5a1 1 0 0 0 .866-1.5l-8.25-14.5ZM12 8a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 9a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 12 17Z" />
          </svg>
          <h3 className="text-[16px] font-bold text-[var(--modal-title-text)]">确认删除会话</h3>
        </div>
      }
      panelClassName="w-[500px]"
      bodyClassName="pt-5"
      backdropTestId="thread-delete-modal"
      panelTestId="thread-delete-modal-panel"
    >
      <div className="flex flex-col gap-5" data-testid="thread-delete-modal-content">
        <div className="space-y-1">
          <p className="text-sm text-[var(--modal-text-muted)]">删除后，该会话及相关聊天记录将全部清空且不可恢复，关联的定时任务也会一并删除。</p>
        </div>

        <div className="space-y-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-3">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">工作目录</div>
          <div className="break-all font-mono text-xs text-[var(--text-primary)]" data-testid="thread-delete-project-path">
            {deleteTarget?.projectPath ?? '未设置'}
          </div>
        </div>

        <div className="space-y-1" data-testid="thread-delete-shared-status">
          <div className="text-xs font-semibold text-[var(--text-secondary)]">共享状态</div>
          <p className={`text-sm ${deleteTargetIsShared ? 'text-[var(--state-warning-text)]' : 'text-[var(--text-muted)]'}`}>
            {deleteTargetIsShared
              ? `该工作目录当前被 ${deleteTargetSharedCount} 个其他会话共享，不能在删除会话时一并删除。`
              : '该工作目录当前未发现其他会话共享。'}
          </p>
        </div>

        <label className={`flex items-start gap-3 ${deleteTargetIsShared ? 'cursor-not-allowed opacity-70' : ''}`} data-testid="thread-delete-workspace-option">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-[var(--border-strong)]"
            checked={deleteTargetIsShared ? false : deleteWorkspace}
            disabled={deleteTargetIsShared}
            onChange={(event) => setDeleteWorkspace(event.target.checked)}
          />
          <div className="space-y-1">
            <div className="text-sm font-medium text-[var(--text-primary)]">同时删除工作目录（危险操作）</div>
            <p className="text-xs text-[var(--text-muted)]">
              危险操作：将永久删除该目录及其中所有文件，请确认这不是需要保留的重要目录。
            </p>
            {deleteTargetIsShared && (
              <p className="text-xs text-[var(--state-warning-text)]">
                共享工作目录不可在这里删除，请先处理其他会话后再手动清理该目录。
              </p>
            )}
          </div>
        </label>

        <div className="flex items-center justify-end gap-2">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onConfirm}>确定</Button>
        </div>
      </div>
    </AppModal>
  );
}
