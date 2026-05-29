/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { CSSProperties } from 'react';
import { SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON, type ScheduleTaskEditability } from '../utils';
import { ScheduledTaskUnsupportedEditTooltip } from './ScheduleUnsupportedEditTooltip';
import type { ScheduledTaskItem } from '../types';

type TaskCardProps = {
  task: ScheduledTaskItem;
  taskIconMaskStyle: CSSProperties;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  isToggling: boolean;
  editability: ScheduleTaskEditability;
  modalOpen?: boolean;
};

export function TaskCard({
  task,
  taskIconMaskStyle,
  onSelectTask,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  isToggling,
  editability,
  modalOpen = false,
}: TaskCardProps) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelectTask(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectTask(task);
        }
      }}
      className={`group h-[194px] cursor-pointer rounded-[16px] border border-[var(--card-border)] bg-[var(--card-bg)] p-6 transition-shadow hover:bg-[var(--card-hover-bg)] hover:shadow-[0_4px_16px_0_rgba(0,0,0,0.08)] ${modalOpen ? 'force-hover' : ''}`}
    >
      <div className="flex h-full flex-col gap-4">
        <div className="flex h-[48px] items-center justify-between gap-3">
          <div className="flex h-full min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-card-muted)]">
              <img src="/icons/schedule.svg" alt="" aria-hidden="true" className="h-6 w-6 shrink-0" />
            </div>
            <h3 className="line-clamp-1 min-w-0 text-[16px] font-semibold text-[var(--text-primary)]">{task.taskName}</h3>
          </div>
          {task.source === 'dynamic' ? (
            <button
              type="button"
              role="switch"
              aria-checked={task.effectiveEnabled}
              aria-label={`${task.taskName}开关`}
              onClick={async (event) => {
                event.stopPropagation();
                await onToggleTask(task);
              }}
              disabled={isToggling}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-60 ${
                task.effectiveEnabled ? 'bg-[var(--text-accent)]' : 'bg-[var(--border-default)]'
              }`}
            >
              <span
                className={`absolute left-1 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-transform duration-200 ease-out motion-reduce:transition-none ${
                  task.effectiveEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          ) : null}
        </div>

        <p className="line-clamp-2 h-[44px] text-[14px] leading-[22px] text-[var(--text-secondary)]">{task.prompt}</p>

        <div className="relative h-[24px]">
          <div className={`absolute inset-0 flex items-center gap-1.5 text-[12px] leading-6 text-[var(--text-muted)] transition-opacity ${modalOpen ? '' : 'group-hover:opacity-0 group-hover:pointer-events-none'}`}>
            <span aria-hidden="true" className="h-4 w-4 shrink-0" style={taskIconMaskStyle} />
            <span>{task.frequency}</span>
          </div>
          <div className={`absolute inset-0 flex items-center transition-opacity ${modalOpen ? 'opacity-0 pointer-events-none' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'}`}>
            {task.source === 'dynamic' ? (
              <div className="flex items-center gap-4">
                {editability.editable ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onEditTask(task);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.stopPropagation();
                        onEditTask(task);
                      }
                    }}
                    className="bg-transparent p-0 text-[14px] font-normal leading-6 text-[var(--text-accent)] hover:underline"
                    data-testid={`scheduled-task-card-edit-${task.taskId}`}
                  >
                    编辑
                  </div>
                ) : (
                  <ScheduledTaskUnsupportedEditTooltip
                    reason={editability.reason ?? SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON}
                    onGoEdit={() => onEditTaskInConversation(task)}
                    className="inline-flex"
                    buttonTestId={`scheduled-task-card-go-edit-${task.taskId}`}
                  >
                    <span className="inline-flex">
                      <div
                        role="button"
                        tabIndex={0}
                        aria-disabled="true"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.stopPropagation();
                          }
                        }}
                        className="cursor-not-allowed bg-transparent p-0 text-[14px] font-normal leading-6 text-[var(--text-disabled)]"
                        data-testid={`scheduled-task-card-edit-${task.taskId}`}
                      >
                        编辑
                      </div>
                    </span>
                  </ScheduledTaskUnsupportedEditTooltip>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteTask(task);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                      onDeleteTask(task);
                    }
                  }}
                  className="bg-transparent p-0 text-[14px] font-normal leading-6 text-[var(--text-accent)] hover:underline"
                >
                  删除
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div
                  role="button"
                  tabIndex={0}
                  aria-disabled="true"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.stopPropagation();
                    }
                  }}
                  className="cursor-not-allowed bg-transparent p-0 text-[14px] font-normal leading-6 text-[var(--text-disabled)]"
                >
                  删除
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
