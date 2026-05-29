/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import type { ScheduleRunItem, ScheduleTrigger, ScheduledTaskItem } from '../types';
import { formatCronFrequency } from '../utils';
import { formatIntervalFrequency } from '../utils';
import { getScheduleTaskEditability, SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON, type ScheduleTaskEditability } from '../utils';

type ScheduleTaskSummaryResponse = {
  tasks: Array<{
    id: string;
    dynamicTaskId?: string;
    deliveryThreadId?: string | null;
    threadTitle?: string | null;
    source: 'builtin' | 'dynamic';
    trigger: ScheduleTrigger;
    enabled: boolean;
    effectiveEnabled: boolean;
    display?: {
      label?: string;
      description?: string;
    };
    lastRun: {
      started_at: string;
      subject_key: string;
      outcome: string;
    } | null;
    subjectPreview: string | null;
  }>;
};

type ScheduleRunsResponse = {
  runs: ScheduleRunItem[];
  nextCursor: number | null;
  hasMore: boolean;
};

type UseTaskStateOptions = {
  viewMode: 'card' | 'calendar';
  weekOffset: number;
};

function extractThreadId(subjectKey: string | null | undefined): string | null {
  if (!subjectKey) return null;
  if (subjectKey.startsWith('thread-')) return subjectKey.slice(7);
  if (subjectKey.startsWith('thread:')) return subjectKey.slice(7);
  return null;
}

function formatFrequency(trigger: ScheduleTrigger): string {
  if (trigger.type === 'interval') {
    return formatIntervalFrequency(trigger.ms);
  }
  if (trigger.type === 'once') {
    const date = new Date(trigger.fireAt);
    return date.toLocaleString('zh-CN');
  }
  if (trigger.type === 'cron') {
    return formatCronFrequency(trigger.expression);
  }
  return '任务类型: 未知';
}

function toViewTask(task: ScheduleTaskSummaryResponse['tasks'][number]): ScheduledTaskItem {
  const id = task.dynamicTaskId ?? task.id;
  const threadId = task.deliveryThreadId ?? extractThreadId(task.lastRun?.subject_key);
  const threadName = task.threadTitle?.trim() || threadId || '-';
  const isOnce = task.trigger.type === 'once';
  const fireAtTime = isOnce ? (task.trigger as { type: 'once'; fireAt: number }).fireAt : null;
  return {
    taskId: id,
    dynamicTaskId: task.dynamicTaskId,
    source: task.source,
    deliveryThreadId: threadId,
    taskName: task.display?.label?.trim() || task.id,
    prompt: task.display?.description?.trim() || '暂无描述',
    frequency: formatFrequency(task.trigger),
    nextExcuteTime: '-',
    effectiveTime: isOnce && fireAtTime ? new Date(fireAtTime).toLocaleString('zh-CN') : '长期有效',
    status: task.effectiveEnabled ? 'running' : 'paused',
    enabled: task.enabled,
    effectiveEnabled: task.effectiveEnabled,
    createTime: task.lastRun?.started_at ?? '',
    sessionName: threadName,
    trigger: task.trigger,
    lastRunAt: task.lastRun?.started_at ?? null,
    lastRunOutcome: task.lastRun?.outcome ?? null,
  };
}

const MAX_RUNS_PAGES = 20;

export function useTaskState({ viewMode, weekOffset }: UseTaskStateOptions) {
  const [tasks, setTasks] = useState<ScheduledTaskItem[]>([]);
  const [calendarRuns, setCalendarRuns] = useState<ScheduleRunItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunsLoading, setIsRunsLoading] = useState(false);

  const loadTasks = useCallback(async (): Promise<ScheduledTaskItem[] | null> => {
    const tasksRes = await apiFetch('/api/schedule/tasks');
    if (!tasksRes.ok) return null;
    const data = (await tasksRes.json()) as ScheduleTaskSummaryResponse;
    const mapped = (data.tasks ?? []).map(toViewTask);
    setTasks(mapped);
    return mapped;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        if (cancelled) return;
        await loadTasks();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadTasks]);

  useEffect(() => {
    if (viewMode !== 'calendar') return;

    let cancelled = false;
    const loadRuns = async () => {
      setIsRunsLoading(true);
      try {
        const now = new Date();
        const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() + mondayOffset + weekOffset * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const since = weekStart.toISOString();
        const until = weekEnd.toISOString();
        let cursor: number | null = null;
        const allRuns: ScheduleRunItem[] = [];
        const seenCursors = new Set<number>();
        let pageCount = 0;

        while (!cancelled) {
          if (pageCount >= MAX_RUNS_PAGES) break;
          if (cursor != null && seenCursors.has(cursor)) break;
          if (cursor != null) seenCursors.add(cursor);
          const query = new URLSearchParams({
            limit: '200',
            since,
            until,
          });
          if (cursor != null) query.set('cursor', String(cursor));
          const res = await apiFetch(`/api/schedule/runs?${query.toString()}`);
          if (!res.ok) break;
          const payload = (await res.json()) as ScheduleRunsResponse;
          allRuns.push(...(payload.runs ?? []));
          pageCount += 1;
          if (!payload.hasMore || payload.nextCursor == null) break;
          if (payload.nextCursor === cursor) break;
          cursor = payload.nextCursor;
        }

        if (!cancelled) setCalendarRuns(allRuns);
      } finally {
        if (!cancelled) setIsRunsLoading(false);
      }
    };

    void loadRuns();
    return () => {
      cancelled = true;
    };
  }, [viewMode, weekOffset]);

  const taskEditabilityById = useMemo(() => {
    const unsupported: ScheduleTaskEditability = {
      editable: false,
      draft: null,
      reason: SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON,
    };
    return new Map(
      tasks.map((task) => [
        task.taskId,
        task.source === 'dynamic' ? getScheduleTaskEditability(task) : unsupported,
      ]),
    );
  }, [tasks]);

  return {
    tasks,
    calendarRuns,
    isLoading,
    isRunsLoading,
    taskEditabilityById,
    reloadTasks: loadTasks,
    setTasks,
  };
}
