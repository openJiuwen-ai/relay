/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import type { ScheduledTaskItem } from '../types';
import type { ScheduleTaskDraft } from '../schedule-template-types';
import { intervalValueToMs } from '../utils';

type UseTaskActionsOptions = {
  reloadTasks: () => Promise<ScheduledTaskItem[] | null>;
  setTasks: React.Dispatch<React.SetStateAction<ScheduledTaskItem[]>>;
  getEditingTask: () => ScheduledTaskItem | null;
  closeEditor: () => void;
};

function resolveTaskIdentifier(task: ScheduledTaskItem): string {
  return task.dynamicTaskId ?? task.taskId;
}

function buildScheduleTaskChatEditText(task: ScheduledTaskItem): string {
  const taskId = resolveTaskIdentifier(task);
  return `按照以下要求修改定时任务「${task.taskName}」（任务ID：${taskId}）：`;
}

function parseTimeParts(value: string): { hour: number; minute: number } {
  const [hourText = '0', minuteText = '0'] = value.split(':');
  return {
    hour: Number(hourText) || 0,
    minute: Number(minuteText) || 0,
  };
}

function parseDateTimeToTimestamp(value: string): number {
  const [dateText = '', timeText = '00:00:00'] = value.split(' ');
  const [yearText = '0', monthText = '1', dayText = '1'] = dateText.split('-');
  const [hourText = '0', minuteText = '0', secondText = '0'] = timeText.split(':');
  return new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
    Number(secondText),
  ).getTime();
}

function toCronWeekday(value: string): string {
  return value === '7' ? '0' : value;
}

function buildTaskTrigger(draft: ScheduleTaskDraft, timezoneOverride?: string | null) {
  const timezone = timezoneOverride === null ? undefined : (timezoneOverride ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || undefined));

  if (draft.frequency.type === 'once') {
    return {
      type: 'once' as const,
      fireAt: parseDateTimeToTimestamp(draft.frequency.executeTime),
    };
  }

  if (draft.frequency.type === 'interval') {
    return {
      type: 'interval' as const,
      ms: intervalValueToMs(draft.frequency.interval, draft.frequency.unit),
    };
  }

  const { hour, minute } = parseTimeParts(draft.frequency.time);

  if (draft.frequency.type === 'weekday') {
    return {
      type: 'cron' as const,
      expression: `${minute} ${hour} * * ${draft.frequency.weekdays.map(toCronWeekday).join(',')}`,
      ...(timezone ? { timezone } : {}),
    };
  }

  return {
    type: 'cron' as const,
    expression: `${minute} ${hour} * * *`,
    ...(timezone ? { timezone } : {}),
  };
}

type CreateScheduleTaskPayload = {
  templateId: string;
  trigger: ReturnType<typeof buildTaskTrigger>;
  params: {
    message: string;
  };
  display: {
    label: string;
    category: 'system';
    description: string;
  };
  deliveryThreadId: string;
};

function buildCreateScheduleTaskPayload(
  draft: ScheduleTaskDraft,
  deliveryThreadId: string,
): CreateScheduleTaskPayload {
  return {
    templateId: 'reminder',
    trigger: buildTaskTrigger(draft),
    params: {
      message: draft.prompt.trim(),
    },
    display: {
      label: draft.taskName.trim(),
      category: 'system',
      description: draft.prompt.trim(),
    },
    deliveryThreadId,
  };
}

export function useTaskActions({ reloadTasks, setTasks, getEditingTask, closeEditor }: UseTaskActionsOptions) {
  const navigate = useNavigate();
  const addToast = useToastStore((state) => state.addToast);
  const setPendingChatInsert = useChatStore((state) => state.setPendingChatInsert);

  const [togglingTaskIds, setTogglingTaskIds] = useState<Set<string>>(new Set());
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  const handleToggleTask = useCallback(async (task: ScheduledTaskItem) => {
    const apiTaskId = task.taskId;
    if (!apiTaskId) return;
    if (togglingTaskIds.has(apiTaskId)) return;

    const targetEffectiveEnabled = !task.effectiveEnabled;
    const nextEnabled = targetEffectiveEnabled;
    setTogglingTaskIds((prev) => new Set(prev).add(apiTaskId));
    setTasks((prev) =>
      prev.map((item) =>
        item.taskId === apiTaskId
          ? {
              ...item,
              enabled: nextEnabled,
              effectiveEnabled: targetEffectiveEnabled,
              status: targetEffectiveEnabled ? 'running' : 'paused',
            }
          : item,
      ),
    );

    try {
      if (task.source === 'dynamic') {
        const res = await apiFetch(`/api/schedule/tasks/${encodeURIComponent(task.dynamicTaskId ?? apiTaskId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextEnabled }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (targetEffectiveEnabled) {
          const clearOverrideRes = await apiFetch(`/api/schedule/control/tasks/${encodeURIComponent(apiTaskId)}`, {
            method: 'DELETE',
          });
          if (!clearOverrideRes.ok && clearOverrideRes.status !== 404) {
            throw new Error(`HTTP ${clearOverrideRes.status}`);
          }
        }
      } else {
        if (nextEnabled) {
          const res = await apiFetch(`/api/schedule/control/tasks/${encodeURIComponent(apiTaskId)}`, {
            method: 'DELETE',
          });
          if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
        } else {
          const res = await apiFetch(`/api/schedule/control/tasks/${encodeURIComponent(apiTaskId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: false }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
      }
      const latest = await reloadTasks();
      if (targetEffectiveEnabled) {
        const changedTask = latest?.find((item) => item.taskId === apiTaskId);
        if (changedTask && !changedTask.effectiveEnabled) {
          await reloadTasks();
        }
      }
    } catch {
      await reloadTasks();
    } finally {
      setTogglingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(apiTaskId);
        return next;
      });
    }
  }, [togglingTaskIds, setTasks, reloadTasks]);

  const handleDeleteConfirm = useCallback(async (deleteTargetTask: ScheduledTaskItem | null, onSuccess?: () => void) => {
    if (!deleteTargetTask) return;
    const apiTaskId = deleteTargetTask.dynamicTaskId ?? deleteTargetTask.taskId;
    if (!apiTaskId) return;
    const taskName = deleteTargetTask.taskName;

    setIsDeletingTask(true);
    try {
      const res = await apiFetch(`/api/schedule/tasks/${encodeURIComponent(apiTaskId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setTasks((prev) => prev.filter((task) => task.taskId !== deleteTargetTask.taskId));
      addToast({
        type: 'success',
        title: '删除成功',
        message: `定时任务「${taskName}」已删除`,
        duration: 2600,
      });
      onSuccess?.();
    } catch {
      addToast({
        type: 'error',
        title: '删除失败',
        message: '定时任务删除失败，请稍后重试',
        duration: 2600,
      });
    } finally {
      setIsDeletingTask(false);
    }
  }, [setTasks, addToast]);

  const handleTaskEditorConfirm = useCallback(async (
    draft: ScheduleTaskDraft,
    _editingTask?: ScheduledTaskItem | null,
    onSuccess?: () => void,
  ) => {
    const editingTask = _editingTask ?? getEditingTask();
    const isEditing = !!editingTask;
    const taskName = draft.taskName.trim();
    closeEditor();
    try {
      let deliveryThreadId = draft.sessionId?.trim() ?? '';
      let createdNewThread = false;

      if (deliveryThreadId.startsWith('mock-new-session')) {
        const createThreadRes = await apiFetch('/api/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: draft.taskName.trim() }),
        });
        if (!createThreadRes.ok) {
          throw new Error(`create_thread_failed_${createThreadRes.status}`);
        }

        const createdThread = (await createThreadRes.json()) as { id?: string };
        if (!createdThread.id) {
          throw new Error('create_thread_missing_id');
        }
        deliveryThreadId = createdThread.id;
        createdNewThread = true;
      }

      if (isEditing) {
        const apiTaskId = editingTask?.dynamicTaskId ?? editingTask?.taskId;
        if (!apiTaskId) throw new Error('edit_schedule_task_missing_id');
        const editTimezone =
          editingTask?.trigger.type === 'cron' ? (editingTask.trigger.timezone ?? null) : undefined;
        const editRes = await apiFetch(`/api/schedule/tasks/${encodeURIComponent(apiTaskId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger: buildTaskTrigger(draft, editTimezone),
            params: { message: draft.prompt.trim() },
            display: {
              label: draft.taskName.trim(),
              description: draft.prompt.trim(),
            },
            deliveryThreadId: deliveryThreadId || null,
            enabled: draft.enabled,
          }),
        });
        if (!editRes.ok) {
          throw new Error(`edit_schedule_task_failed_${editRes.status}`);
        }
      } else {
        const createRes = await apiFetch('/api/schedule/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildCreateScheduleTaskPayload(draft, deliveryThreadId)),
        });
        if (!createRes.ok) {
          throw new Error(`create_schedule_task_failed_${createRes.status}`);
        }
      }

      if (createdNewThread && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('office-claw:threads-refresh'));
      }

      onSuccess?.();
      await reloadTasks();
      addToast({
        type: 'success',
        title: isEditing ? '编辑成功' : '创建成功',
        message: isEditing ? `定时任务「${taskName}」已更新` : `定时任务「${taskName}」已创建`,
        duration: 2600,
      });
    } catch (error) {
      addToast({
        type: 'error',
        title: isEditing ? '编辑失败' : '创建失败',
        message: isEditing ? '定时任务编辑失败，请稍后重试' : '定时任务创建失败，请稍后重试',
        duration: 2600,
      });
      console.error(isEditing ? '[schedule-task-edit]' : '[schedule-task-create]', error);
    }
  }, [reloadTasks, addToast, getEditingTask, closeEditor]);

  const handleEditTaskInConversation = useCallback((task: ScheduledTaskItem) => {
    const threadId = task.deliveryThreadId?.trim() ?? '';
    if (!threadId) {
      addToast({
        type: 'error',
        title: '无法跳转编辑',
        message: '该任务未绑定会话，无法通过对话编辑',
        duration: 2600,
      });
      return;
    }

    setPendingChatInsert({
      threadId,
      text: buildScheduleTaskChatEditText(task),
    });
    navigate(threadId === 'default' ? '/' : `/thread/${threadId}`, { preventScrollReset: true });
  }, [navigate, setPendingChatInsert, addToast]);

  return {
    togglingTaskIds,
    isDeletingTask,
    handleToggleTask,
    handleDeleteConfirm,
    handleTaskEditorConfirm,
    handleEditTaskInConversation,
  };
}
