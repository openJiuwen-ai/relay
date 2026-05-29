/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { AppModal } from '../../AppModal';
import type { ScheduledTaskItem } from '../types';

type DeleteModalProps = {
  task: ScheduledTaskItem | null;
  isDeleting: boolean;
  sourceView: 'card' | 'calendar';
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteModal({ task, isDeleting, sourceView, onClose, onConfirm }: DeleteModalProps) {
  return (
    <AppModal
      open={!!task}
      onClose={() => {
        if (isDeleting) return;
        onClose();
      }}
      disableBackdropClose={isDeleting}
      title={
        <div className="flex items-center gap-2">
          <svg className="h-6 w-6 text-[#FAAD14]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.866 3.5a1 1 0 0 0-1.732 0l-8.25 14.5A1 1 0 0 0 3.75 19.5h16.5a1 1 0 0 0 .866-1.5l-8.25-14.5ZM12 8a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm0 9a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 12 17Z" />
          </svg>
          <h3 className="text-[16px] font-bold text-gray-900">确认删除任务</h3>
        </div>
      }
      panelClassName="w-[500px]"
      bodyClassName="pt-5"
    >
      <div className="flex flex-col gap-5">
        <div className="space-y-1">
          <p className="text-sm text-gray-600">
            {sourceView === 'calendar'
              ? '删除后，该任务在后续所有日期的计划都会一并删除，且不可恢复。'
              : '删除后，该任务将不可恢复。'}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="ui-button-default"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="ui-button-primary"
          >
            {isDeleting ? '删除中...' : '删除'}
          </button>
        </div>
      </div>
    </AppModal>
  );
}
