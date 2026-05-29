/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { AppModal } from '../../AppModal';
import { OverflowTooltip } from '../../shared/OverflowTooltip';
import { ScheduledTaskUnsupportedEditTooltip } from './ScheduleUnsupportedEditTooltip';
import { SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON } from '../utils';
import type { ScheduledTaskItem } from '../types';
import type { ScheduleTaskEditability } from '../utils';

type DetailModalProps = {
  task: ScheduledTaskItem | null;
  editability: ScheduleTaskEditability | null;
  onClose: () => void;
  onEdit: (task: ScheduledTaskItem) => void;
  onEditInConversation: (task: ScheduledTaskItem) => void;
};

export function DetailModal({ task, editability, onClose, onEdit, onEditInConversation }: DetailModalProps) {
  return (
    <AppModal
      open={!!task}
      onClose={onClose}
      title={task?.taskName ?? '任务详情'}
      panelClassName="w-[520px] max-w-[92vw] rounded-[12px] border border-[#E6EAF0] bg-white"
      bodyClassName="pt-4 text-left"
    >
      {task ? (
        <div className="space-y-4 text-left text-[14px] text-[#4B5565]">
          <div className="flex items-start gap-6">
            <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">执行频率</div>
            <div className="min-w-0 flex-1 leading-6">{task.frequency}</div>
          </div>
          <div className="flex items-start gap-6">
            <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">生效时间</div>
            <div className="min-w-0 flex-1 leading-6">{task.effectiveTime}</div>
          </div>
          <div className="flex items-start gap-6">
            <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">描述</div>
            <div className="min-w-0 flex-1">
              <OverflowTooltip content={task.prompt} className="inline-flex max-w-full align-top">
                <div className="min-w-0 leading-6 line-clamp-2">{task.prompt}</div>
              </OverflowTooltip>
            </div>
          </div>
          <div className="flex items-start gap-6">
            <div className="w-[72px] shrink-0 text-[12px] leading-6 text-[#98A1AF]">执行会话</div>
            <div className="min-w-0 flex-1">
              <OverflowTooltip content={task.sessionName} className="inline-flex max-w-full align-top">
                <div className="min-w-0 max-w-full truncate text-[14px] leading-6 text-[#2F3A4B]">
                  {task.sessionName}
                </div>
              </OverflowTooltip>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            {task.source === 'dynamic' ? (
              editability?.editable ? (
                <button
                  type="button"
                  onClick={() => onEdit(task)}
                  className="ui-button-default"
                  data-testid="scheduled-task-detail-edit"
                >
                  编辑
                </button>
              ) : (
                <ScheduledTaskUnsupportedEditTooltip
                  reason={editability?.reason}
                  onGoEdit={() => onEditInConversation(task)}
                  className="inline-flex"
                  buttonTestId="scheduled-task-detail-go-edit"
                >
                  <span className="inline-flex">
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="ui-button-default cursor-not-allowed opacity-45"
                      data-testid="scheduled-task-detail-edit"
                    >
                      编辑
                    </button>
                  </span>
                </ScheduledTaskUnsupportedEditTooltip>
              )
            ) : null}
            <button type="button" onClick={onClose} className="ui-button-primary">
              确定
            </button>
          </div>
        </div>
      ) : null}
    </AppModal>
  );
}
