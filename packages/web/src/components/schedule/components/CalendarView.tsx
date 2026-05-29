/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿'use client';

import { useEffect, useState } from 'react';
import type { ScheduledTaskItem } from '../types';
import type { ScheduleRunItem } from '../types';
import type { CalendarDayColumn, CalendarOccurrence, CalendarTaskState, ScheduleTaskEditability } from '../utils';
import { buildCalendarWeek, SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON } from '../utils';
import { MaskIcon } from '@/components/shared/MaskIcon';
import { ScheduledTaskUnsupportedEditTooltip } from './ScheduleUnsupportedEditTooltip';
import { OverflowTooltip } from '../../shared/OverflowTooltip';

type CalendarViewProps = {
  tasks: ScheduledTaskItem[];
  runs: ScheduleRunItem[];
  baseDate: Date;
  weekOffset: number;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  togglingTaskIds: Set<string>;
  taskEditabilityById: Map<string, ScheduleTaskEditability>;
};

type MenuPosition = {
  top: number;
  left: number;
};

const MENU_WIDTH = 140;
const MENU_HEIGHT = 128;
const MENU_OFFSET = 4;
const MENU_VIEWPORT_PADDING = 12;
const SCHEDULE_TASK_EDIT_ENTRANCE_ENABLED = true;

const ACTION_MENU_ITEM_CLASS =
  'group flex h-8 w-full items-center gap-2 rounded-[6px] px-[16px] py-[7px] text-left text-[12px] font-medium text-[var(--overlay-text)] transition-colors enabled:hover:bg-[var(--overlay-item-hover-bg)]';
const ACTION_MENU_DELETE_ITEM_CLASS = `${ACTION_MENU_ITEM_CLASS} enabled:hover:text-[var(--state-error-text)]`;
const AGENT_CARD_MENU_BUTTON_CLASS = 'inline-flex h-6 w-6 items-center justify-center rounded-[4px] transition-colors';
const AGENT_CARD_MENU_BUTTON_ACTIVE_CLASS = 'bg-[var(--overlay-item-hover-bg)] text-[var(--text-accent)]';
const AGENT_CARD_MENU_BUTTON_IDLE_CLASS =
  'text-[var(--text-muted)] hover:bg-[var(--overlay-item-hover-bg)] hover:text-[var(--text-accent)]';

function stateConfig(state: CalendarTaskState): { label: string; dot: string; showTimeIcon: boolean } {
  if (state === 'completed') return { label: '已完成', dot: 'rgba(173,217,127,1)', showTimeIcon: false };
  if (state === 'failed') return { label: '已失败', dot: '#C62828', showTimeIcon: false };
  if (state === 'skipped') return { label: '已跳过', dot: '#C2C2C2', showTimeIcon: false };
  if (state === 'paused') return { label: '已暂停', dot: '#C2C2C2', showTimeIcon: false };
  return { label: '待执行', dot: '#C2C2C2', showTimeIcon: true };
}

type CardActionsProps = {
  item: CalendarOccurrence;
  occurrenceKey: string;
  taskById: Map<string, ScheduledTaskItem>;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  togglingTaskIds: Set<string>;
  taskEditabilityById: Map<string, ScheduleTaskEditability>;
  openMenuKey: string | null;
  menuPosition: MenuPosition | null;
  onOpenMenu: (key: string, triggerRect: DOMRect) => void;
  onCloseMenu: () => void;
};

function CardActions({
  item,
  occurrenceKey,
  taskById,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  togglingTaskIds,
  taskEditabilityById,
  openMenuKey,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}: CardActionsProps) {
  if (item.state !== 'pending' && item.state !== 'paused') return null;
  const task = taskById.get(item.sourceTaskId);
  if (!task) return null;
  const canOperate = task.source === 'dynamic';
  const editability = taskEditabilityById.get(task.taskId);
  const isToggling = togglingTaskIds.has(task.taskId);
  const menuOpen = openMenuKey === occurrenceKey;

  return (
    <div data-schedule-menu-root="1" className="shrink-0">
      <button
        type="button"
        aria-label={`操作 ${task.taskName}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          if (menuOpen) {
            onCloseMenu();
            return;
          }
          onOpenMenu(occurrenceKey, event.currentTarget.getBoundingClientRect());
        }}
        className={`${AGENT_CARD_MENU_BUTTON_CLASS} ${
          menuOpen ? AGENT_CARD_MENU_BUTTON_ACTIVE_CLASS : AGENT_CARD_MENU_BUTTON_IDLE_CLASS
        }`}
      >
        <MaskIcon name="more" className="h-4 w-4" />
      </button>
      {menuOpen && menuPosition ? (
        <div
          role="menu"
          className="ui-overlay-card fixed z-40 w-[140px] rounded-[6px] px-0 py-2 shadow-[0_12px_28px_rgba(15,23,42,0.18)]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <div className={`${ACTION_MENU_ITEM_CLASS} justify-between`}>
            <span className={canOperate ? '' : 'text-[var(--text-disabled)]'}>启停用</span>
            <button
              type="button"
              role="switch"
              aria-checked={task.effectiveEnabled}
              aria-label={`${task.taskName}开关`}
              disabled={!canOperate || isToggling}
              onClick={async (event) => {
                event.stopPropagation();
                if (!canOperate) return;
                await onToggleTask(task);
                onCloseMenu();
              }}
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
          </div>
          {SCHEDULE_TASK_EDIT_ENTRANCE_ENABLED && canOperate ? (
            editability?.editable ? (
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditTask(task);
                  onCloseMenu();
                }}
                className={ACTION_MENU_ITEM_CLASS}
                data-testid={`scheduled-task-calendar-edit-${task.taskId}`}
              >
                编辑
              </button>
            ) : (
              <ScheduledTaskUnsupportedEditTooltip
                reason={editability?.reason ?? SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON}
                onGoEdit={() => onEditTaskInConversation(task)}
                className="block"
                buttonTestId={`scheduled-task-calendar-go-edit-${task.taskId}`}
              >
                <span className="block">
                  <button
                    type="button"
                    role="menuitem"
                    disabled
                    aria-disabled="true"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    className={`${ACTION_MENU_ITEM_CLASS} cursor-not-allowed text-[var(--text-disabled)]`}
                    data-testid={`scheduled-task-calendar-edit-${task.taskId}`}
                  >
                    编辑
                  </button>
                </span>
              </ScheduledTaskUnsupportedEditTooltip>
            )
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={!canOperate}
            onClick={(event) => {
              event.stopPropagation();
              if (!canOperate) return;
              onDeleteTask(task);
              onCloseMenu();
            }}
            className={`${ACTION_MENU_DELETE_ITEM_CLASS} ${
              canOperate ? '' : 'cursor-not-allowed text-[var(--text-disabled)]'
            }`}
          >
            删除
          </button>
        </div>
      ) : null}
    </div>
  );
}

type RecurringTaskCardProps = {
  item: CalendarOccurrence;
  occurrenceKey: string;
  taskById: Map<string, ScheduledTaskItem>;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  togglingTaskIds: Set<string>;
  taskEditabilityById: Map<string, ScheduleTaskEditability>;
  openMenuKey: string | null;
  menuPosition: MenuPosition | null;
  onOpenMenu: (key: string, triggerRect: DOMRect) => void;
  onCloseMenu: () => void;
};

function RecurringTaskCard({
  item,
  occurrenceKey,
  taskById,
  onSelectTask,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  togglingTaskIds,
  taskEditabilityById,
  openMenuKey,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}: RecurringTaskCardProps) {
  const cfg = stateConfig(item.state);
  const task = taskById.get(item.sourceTaskId);
  const canSelect = !!task;
  return (
    <article
      role={canSelect ? 'button' : undefined}
      tabIndex={canSelect ? 0 : undefined}
      onClick={() => {
        if (task) onSelectTask(task);
      }}
      onKeyDown={(event) => {
        if (!task) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectTask(task);
        }
      }}
      className={`relative flex w-full flex-col gap-2 rounded-[8px] border p-3 ${
        item.state === 'pending' ? 'border-[#B6D4F2] bg-[#F4F9FF]' : 'border-[#E9E9E9] bg-white'
      }`}
    >
      <div className="text-[12px] font-semibold text-[#C2C2C2]">{item.timeLabel}</div>
      <OverflowTooltip content={item.taskName}>
        <div
          className={`text-[14px] font-normal ${
            item.state === 'pending' ? 'text-[rgba(25,25,25,1)]' : 'text-[#808080]'
          }`}
          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
        >
          {item.taskName}
        </div>
      </OverflowTooltip>
      <div className="space-y-2 text-[10px] text-[#C2C2C2]">
        <div className={`flex items-center gap-1 ${item.nextExecutionText ? '' : 'justify-between'}`}>
          <div className="flex min-w-0 items-center gap-1">
            <span className="h-2 w-2 rounded-full " style={{ backgroundColor: cfg.dot }} />
            <span className='text-[12px]'>{item.lastExecutionText}</span>
          </div>
          {!item.nextExecutionText ? (
            <CardActions
              item={item}
              occurrenceKey={occurrenceKey}
              taskById={taskById}
              onSelectTask={onSelectTask}
              onEditTask={onEditTask}
              onEditTaskInConversation={onEditTaskInConversation}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
              togglingTaskIds={togglingTaskIds}
              taskEditabilityById={taskEditabilityById}
              openMenuKey={openMenuKey}
              menuPosition={menuPosition}
              onOpenMenu={onOpenMenu}
              onCloseMenu={onCloseMenu}
            />
          ) : null}
        </div>
        {item.nextExecutionText ? (
          <div className="flex items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <img src="/icons/schedule.svg" alt="" className="h-3 w-3" />
              <span className='text-[12px]'>{item.nextExecutionText}</span>
            </div>
            <CardActions
              item={item}
              occurrenceKey={occurrenceKey}
              taskById={taskById}
              onSelectTask={onSelectTask}
              onEditTask={onEditTask}
              onEditTaskInConversation={onEditTaskInConversation}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
              togglingTaskIds={togglingTaskIds}
              taskEditabilityById={taskEditabilityById}
              openMenuKey={openMenuKey}
              menuPosition={menuPosition}
              onOpenMenu={onOpenMenu}
              onCloseMenu={onCloseMenu}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

type SingleTaskCardProps = {
  item: CalendarOccurrence;
  occurrenceKey: string;
  taskById: Map<string, ScheduledTaskItem>;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  togglingTaskIds: Set<string>;
  taskEditabilityById: Map<string, ScheduleTaskEditability>;
  openMenuKey: string | null;
  menuPosition: MenuPosition | null;
  onOpenMenu: (key: string, triggerRect: DOMRect) => void;
  onCloseMenu: () => void;
};

function SingleTaskCard({
  item,
  occurrenceKey,
  taskById,
  onSelectTask,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  togglingTaskIds,
  taskEditabilityById,
  openMenuKey,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}: SingleTaskCardProps) {
  const cfg = stateConfig(item.state);
  const task = taskById.get(item.sourceTaskId);
  const canSelect = !!task;
  return (
    <article
      role={canSelect ? 'button' : undefined}
      tabIndex={canSelect ? 0 : undefined}
      onClick={() => {
        if (task) onSelectTask(task);
      }}
      onKeyDown={(event) => {
        if (!task) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectTask(task);
        }
      }}
      className={`relative flex w-full flex-col gap-2 rounded-[8px] border p-3 ${item.state === 'pending' ? 'border-[#B6D4F2] bg-[#F4F9FF]' : 'border-[#E9E9E9] bg-white'}`}
    >
      <div className="text-[12px] font-semibold text-[#C2C2C2]">{item.timeLabel}</div>
      <OverflowTooltip content={item.taskName}>
        <div
          className={`text-[14px] font-normal ${
            item.state === 'pending' ? 'text-[rgba(25,25,25,1)]' : 'text-[#808080]'
          }`}
          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}
        >
          {item.taskName}
        </div>
      </OverflowTooltip>
      <div className="flex items-center justify-between gap-1 text-[12px] font-normal text-[#C2C2C2]">
        <div className="flex min-w-0 items-center gap-1">
          {cfg.showTimeIcon ? (
            <img src="/icons/schedule.svg" alt="" className="h-3 w-3" />
          ) : (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.dot }} />
          )}
          <span>{cfg.label}</span>
        </div>
        <CardActions
          item={item}
          occurrenceKey={occurrenceKey}
          taskById={taskById}
          onSelectTask={onSelectTask}
          onEditTask={onEditTask}
          onEditTaskInConversation={onEditTaskInConversation}
          onToggleTask={onToggleTask}
          onDeleteTask={onDeleteTask}
          togglingTaskIds={togglingTaskIds}
          taskEditabilityById={taskEditabilityById}
          openMenuKey={openMenuKey}
          menuPosition={menuPosition}
          onOpenMenu={onOpenMenu}
          onCloseMenu={onCloseMenu}
        />
      </div>
    </article>
  );
}

type DayColumnProps = {
  day: CalendarDayColumn;
  taskById: Map<string, ScheduledTaskItem>;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  togglingTaskIds: Set<string>;
  taskEditabilityById: Map<string, ScheduleTaskEditability>;
  openMenuKey: string | null;
  menuPosition: MenuPosition | null;
  onOpenMenu: (key: string, triggerRect: DOMRect) => void;
  onCloseMenu: () => void;
};

function DayColumn({
  day,
  taskById,
  onSelectTask,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  togglingTaskIds,
  taskEditabilityById,
  openMenuKey,
  menuPosition,
  onOpenMenu,
  onCloseMenu,
}: DayColumnProps) {
  const today = new Date();
  const isToday =
    day.date.getFullYear() === today.getFullYear() &&
    day.date.getMonth() === today.getMonth() &&
    day.date.getDate() === today.getDate();

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-[#E9E9E9] last:border-r-0">
      <div className={`border-b border-[#E9E9E9] px-3 py-2 ${isToday ? 'bg-[#F5F5F5]' : 'bg-[#F9F9F9]'}`}>
        <div className="flex items-center gap-1 text-[12px] font-semibold text-[#4C5563]">
          {day.labelZh}/{day.labelEn}
          {isToday ? <span className="text-[12px] font-normal text-[#5cb300]">今日</span> : null}
        </div>
        <div className="text-[20px] font-semibold text-[#4C5563]">{day.dayOfMonth}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {day.occurrences.map((item) => {
          const occurrenceKey = `${day.dayIndex}-${item.taskId}`;
          return (
          item.mode === 'recurring' ? (
            <RecurringTaskCard
              key={item.taskId}
              item={item}
              occurrenceKey={occurrenceKey}
              taskById={taskById}
              onSelectTask={onSelectTask}
              onEditTask={onEditTask}
              onEditTaskInConversation={onEditTaskInConversation}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
              togglingTaskIds={togglingTaskIds}
              taskEditabilityById={taskEditabilityById}
              openMenuKey={openMenuKey}
              menuPosition={menuPosition}
              onOpenMenu={onOpenMenu}
              onCloseMenu={onCloseMenu}
            />
          ) : (
            <SingleTaskCard
              key={item.taskId}
              item={item}
              occurrenceKey={occurrenceKey}
              taskById={taskById}
              onSelectTask={onSelectTask}
              onEditTask={onEditTask}
              onEditTaskInConversation={onEditTaskInConversation}
              onToggleTask={onToggleTask}
              onDeleteTask={onDeleteTask}
              togglingTaskIds={togglingTaskIds}
              taskEditabilityById={taskEditabilityById}
              openMenuKey={openMenuKey}
              menuPosition={menuPosition}
              onOpenMenu={onOpenMenu}
              onCloseMenu={onCloseMenu}
            />
          )
          );
        })}
      </div>
    </div>
  );
}

export function CalendarView({
  tasks,
  runs,
  baseDate,
  weekOffset,
  onSelectTask,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  togglingTaskIds,
  taskEditabilityById,
}: CalendarViewProps) {
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const days = buildCalendarWeek(baseDate, weekOffset, tasks, runs);
  const taskById = new Map(tasks.map((task) => [task.taskId, task]));

  const computeMenuPosition = (triggerRect: DOMRect): MenuPosition => {
    const preferredLeft = triggerRect.right;
    const canOpenRight = preferredLeft + MENU_WIDTH <= window.innerWidth - MENU_VIEWPORT_PADDING;
    const fallbackLeft = triggerRect.left - MENU_WIDTH;
    const desiredLeft = canOpenRight ? preferredLeft : fallbackLeft;
    const minLeft = MENU_VIEWPORT_PADDING;
    const maxLeft = Math.max(minLeft, window.innerWidth - MENU_WIDTH - MENU_VIEWPORT_PADDING);
    const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft);

    const belowTop = triggerRect.top + MENU_OFFSET;
    const canOpenBelow = belowTop + MENU_HEIGHT <= window.innerHeight - MENU_VIEWPORT_PADDING;
    const preferredTop = canOpenBelow ? belowTop : triggerRect.top - MENU_HEIGHT - MENU_OFFSET;
    const minTop = MENU_VIEWPORT_PADDING;
    const maxTop = Math.max(minTop, window.innerHeight - MENU_HEIGHT - MENU_VIEWPORT_PADDING);
    const top = Math.min(Math.max(preferredTop, minTop), maxTop);

    return { top, left };
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-schedule-menu-root="1"]')) return;
      if (target?.closest('[data-schedule-unsupported-edit-tooltip="1"]')) return;
      setOpenMenuKey(null);
      setMenuPosition(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuKey(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    setOpenMenuKey(null);
    setMenuPosition(null);
  }, [weekOffset]);

  return (
    <div className="h-full min-h-0 w-full overflow-x-auto">
      <div className="mx-auto h-full w-full min-w-[1248px]">
        <div className="h-full overflow-hidden rounded-[12px] border border-[#E6EAF0]">
          <div className="grid h-full min-h-0 grid-cols-7">
            {days.map((day) => (
              <DayColumn
                key={day.dayIndex}
                day={day}
                taskById={taskById}
                onSelectTask={onSelectTask}
                onEditTask={onEditTask}
                onEditTaskInConversation={onEditTaskInConversation}
                onToggleTask={onToggleTask}
                onDeleteTask={onDeleteTask}
                togglingTaskIds={togglingTaskIds}
                taskEditabilityById={taskEditabilityById}
                openMenuKey={openMenuKey}
                menuPosition={menuPosition}
                onOpenMenu={(key, triggerRect) => {
                  setOpenMenuKey(key);
                  setMenuPosition(computeMenuPosition(triggerRect));
                }}
                onCloseMenu={() => {
                  setOpenMenuKey(null);
                  setMenuPosition(null);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
