/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ScheduledTaskItem } from '../types';
import type { ScheduleTaskEditability } from '../utils';
import { getNextExecutionAt } from '../utils';
import { TaskCard } from './TaskCard';

type TaskListProps = {
  tasks: ScheduledTaskItem[];
  taskIconMaskStyle: CSSProperties;
  togglingTaskIds: Set<string>;
  taskEditabilityById: Map<string, ScheduleTaskEditability>;
  onSelectTask: (task: ScheduledTaskItem) => void;
  onEditTask: (task: ScheduledTaskItem) => void;
  onEditTaskInConversation: (task: ScheduledTaskItem) => void;
  onToggleTask: (task: ScheduledTaskItem) => Promise<void> | void;
  onDeleteTask: (task: ScheduledTaskItem) => void;
  isModalOpen?: boolean;
};

function taskSortMeta(task: ScheduledTaskItem, now: Date): { bucket: 0 | 1; timeKey: number } {
  if (task.trigger.type === 'interval') {
    return { bucket: 1, timeKey: Number.POSITIVE_INFINITY };
  }
  const nextExecution = getNextExecutionAt(task.trigger, now);
  return { bucket: 0, timeKey: nextExecution ? nextExecution.getTime() : Number.POSITIVE_INFINITY };
}

export function TaskList({
  tasks,
  taskIconMaskStyle,
  togglingTaskIds,
  taskEditabilityById,
  onSelectTask,
  onEditTask,
  onEditTaskInConversation,
  onToggleTask,
  onDeleteTask,
  isModalOpen = false,
}: TaskListProps) {
  const sortedTasks = useMemo(
    () => {
      const now = new Date();
      return tasks
        .map((task, index) => {
          const meta = taskSortMeta(task, now);
          return { task, index, ...meta };
        })
        .sort((a, b) => {
          if (a.bucket !== b.bucket) return a.bucket - b.bucket;
          if (a.timeKey !== b.timeKey) return a.timeKey - b.timeKey;
          return a.index - b.index;
        })
        .map((item) => item.task);
    },
    [tasks],
  );

  return (
    <div className="px-1 pb-4">
      <div className="grid grid-cols-3 gap-x-4 gap-y-6">
        {sortedTasks.map((task) => (
          <TaskCard
            key={task.taskId}
            task={task}
            taskIconMaskStyle={taskIconMaskStyle}
            onSelectTask={onSelectTask}
            onEditTask={onEditTask}
            onEditTaskInConversation={onEditTaskInConversation}
            onToggleTask={onToggleTask}
            onDeleteTask={onDeleteTask}
            isToggling={togglingTaskIds.has(task.taskId)}
            editability={taskEditabilityById.get(task.taskId) ?? { editable: false, draft: null, reason: '' }}
            modalOpen={isModalOpen}
          />
        ))}
      </div>
    </div>
  );
}
