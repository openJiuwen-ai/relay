/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { TASK_RUN_UNGROUPED } from '@openjiuwen/relay-shared';
import { Fragment, useMemo } from 'react';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';
import { useAgentData } from '@/hooks/useAgentData';
import { useExpertCatalog } from '@/hooks/useExpertCatalog';
import type { ChatMessage } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { type TaskItem, useTaskStore } from '@/stores/taskStore';

/** Tasks created milliseconds before user send can still belong to new turn due to clocks; keep slack small. */
const TURN_TIMESTAMP_SLACK_MS = 2500;

/**
 * Last plain user bubble (human, not agent-originated) starts a new turn.
 * Assistants at or after cutoff index belong only to replies after that message.
 */
function findLastPlainUserTurnBoundary(messages: ChatMessage[]): {
  cutoffIndex: number;
  cutoffTime: number;
} | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'user' && !m.agentId) {
      return { cutoffIndex: i, cutoffTime: m.timestamp };
    }
  }
  return null;
}

/** Plain user message index strictly before `beforeIndex` (-1 if none). */
function findPrevPlainUserIndex(messages: ChatMessage[], beforeIndex: number): number {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'user' && !m.agentId) return i;
  }
  return -1;
}

/** Design tokens — align with task list mock (card + timeline). */
const C = {
  cardBg: '#F7F7F7',
  line: '#E8E8E8',
  title: '#262626',
  body: '#595959',
  bodyMuted: '#8C8C8C',
  success: '#52C41A',
  spinnerTrack: '#D9D9D9',
  spinnerArc: '#8C8C8C',
  todoRing: '#D9D9D9',
  blocked: '#FA8C16',
};

const ICON = 20;

function StatusIcon({ status }: { status: TaskItem['status'] | 'doing' }) {
  if (status === 'done') {
    return (
      <svg width={ICON} height={ICON} viewBox="0 0 20 20" fill="none" className="shrink-0" aria-label="已完成">
        <circle cx="10" cy="10" r="9" fill={C.success} />
        <path
          d="M6 10.2l2.4 2.4L14.2 7"
          stroke="white"
          strokeWidth="1.65"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (status === 'doing') {
    return (
      <img
        src="/loading-small.webp"
        alt="进行中"
        width={ICON}
        height={ICON}
        className="shrink-0 animate-spin select-none"
        style={{ animationDuration: '0.85s' }}
        draggable={false}
      />
    );
  }
  if (status === 'blocked') {
    return (
      <svg width={ICON} height={ICON} viewBox="0 0 20 20" fill="none" className="shrink-0" aria-label="阻塞">
        <circle cx="10" cy="10" r="8.25" stroke={C.blocked} strokeWidth="1.5" />
        <path d="M10 6v5" stroke={C.blocked} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="14" r="0.9" fill={C.blocked} />
      </svg>
    );
  }
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 20 20" fill="none" className="shrink-0" aria-label="待处理">
      <circle cx="10" cy="10" r="6" stroke={C.todoRing} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-[min(100%,360px)] flex-col items-center justify-center px-6 py-10">
        <div className="mb-3 flex items-center justify-center">
          <img
            src="/images/task-list/empty-state.svg"
            alt=""
            width={64}
            height={64}
            className="size-16 shrink-0 object-contain select-none"
            draggable={false}
          />
        </div>
        <p className="text-[16px] font-semibold" style={{ color: C.title }}>
          暂无待办
        </p>
        <p className="mt-1.5 text-center text-[14px] leading-relaxed" style={{ color: C.bodyMuted }}>
          复杂任务的进展会显示在这里
        </p>
      </div>
    </div>
  );
}

interface VirtualTask {
  id: string;
  title: string;
  status: TaskItem['status'];
  agentId: string;
}

export function TaskListPanel() {
  const formalTasks = useTaskStore((s) => s.tasks);
  const messages = useChatStore((s) => s.messages);
  const agentInvocations = useChatStore((s) => s.agentInvocations);
  const hasActiveInvocation = useChatStore((s) => s.hasActiveInvocation);
  const { getAgentById } = useAgentData();
  const { getExpertById } = useExpertCatalog();

  const { formalTasksForDisplay } = useMemo(() => {
    const boundary = findLastPlainUserTurnBoundary(messages);
    if (!boundary) {
      return { formalTasksForDisplay: formalTasks };
    }
    const { cutoffTime: lastUserTs } = boundary;
    const roundStartFloor = lastUserTs - TURN_TIMESTAMP_SLACK_MS;
    
    const hasActiveTaskProgress = Object.values(agentInvocations ?? {}).some(
      (inv) => (inv.taskProgress?.tasks?.length ?? 0) > 0
    );
    const newRoundHasFormal = formalTasks.some((t) => t.createdAt >= roundStartFloor);

    if (hasActiveTaskProgress || newRoundHasFormal) {
      return {
        formalTasksForDisplay: formalTasks.filter((t) => t.createdAt >= roundStartFloor),
      };
    }

    return {
      formalTasksForDisplay: formalTasks.filter((t) => t.createdAt < lastUserTs),
    };
  }, [formalTasks, messages, agentInvocations]);

  const messageTasks = useMemo<VirtualTask[]>(() => {
    const result: VirtualTask[] = [];
    if (!agentInvocations) return result;
    
    for (const [agentId, invocationInfo] of Object.entries(agentInvocations)) {
      const tasks = invocationInfo.taskProgress?.tasks;
      if (!tasks || tasks.length === 0) continue;
      
      const isRunning = invocationInfo.taskProgress?.snapshotStatus === 'running' && hasActiveInvocation;
      
      tasks.forEach((t) => {
        let status: TaskItem['status'] = 'todo';
        if (t.status === 'completed') status = 'done';
        else if (t.status === 'in_progress') status = isRunning ? 'doing' : 'todo';
        
        result.push({
          id: t.id || `task_${Math.random()}`,
          title: t.subject || '未命名任务',
          status,
          agentId,
        });
      });
    }
    return result;
  }, [agentInvocations, hasActiveInvocation]);

  const allTasks = useMemo<VirtualTask[]>(() => {
    if (formalTasksForDisplay.length === 0) return messageTasks;
    const formalIds = new Set(formalTasksForDisplay.map((t) => t.id));
    const formalVirtual: VirtualTask[] = formalTasksForDisplay.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      agentId: t.ownerAgentId ?? '__unassigned__',
    }));
    const extraMsg = messageTasks.filter((vt) => {
      return !formalIds.has(vt.id);
    });
    return [...formalVirtual, ...extraMsg];
  }, [formalTasksForDisplay, messageTasks]);

  const groups = useMemo(() => {
    const map = new Map<string, VirtualTask[]>();
    for (const task of allTasks) {
      const list = map.get(task.agentId) ?? [];
      list.push(task);
      map.set(task.agentId, list);
    }
    return map;
  }, [allTasks]);

  if (allTasks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-2">
      <div className="mx-auto flex max-w-full flex-col gap-4">
        {Array.from(groups.entries()).map(([agentKey, agentTasks]) => {
          const rowAgent = agentKey !== '__unassigned__' ? getAgentById(agentKey) : null;
          const expert = rowAgent ? null : getExpertById(agentKey);
          const resolvedAgent = rowAgent ?? expert;
          const groupLabel = resolvedAgent?.displayName ?? (agentKey !== '__unassigned__' ? agentKey : '未分配');
          const n = agentTasks.length;

          return (
            <div
              key={agentKey}
              className="rounded-xl px-5 py-6"
              style={{ backgroundColor: C.cardBg }}
            >
              <div className="mb-6 flex items-center gap-2.5">
                {(() => {
                  const rowAgent = agentKey !== '__unassigned__' ? getAgentById(agentKey) : null;
                  const expert = rowAgent ? null : getExpertById(agentKey);
                  const resolvedAgent = rowAgent ?? expert;
                  if (resolvedAgent?.avatar) {
                    return (
                      <img
                        src={resolvedAgent.avatar}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    );
                  }
                  return (
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                      style={{ backgroundColor: resolvedAgent?.color?.primary ?? '#D9D9D9' }}
                    >
                      {groupLabel.charAt(0)}
                    </div>
                  );
                })()}
                <span className="truncate text-[16px] font-semibold leading-tight" style={{ color: C.title }}>
                  {groupLabel}
                </span>
              </div>

              {/* Timeline: line segments between icons with 6px gap above/below each segment (design ref) */}
              <div className="flex flex-col ml-[42px]">
                {agentTasks.map((task, idx) => (
                  <Fragment key={task.id}>
                    <div className="flex items-start gap-3">
                      <div className="flex w-5 shrink-0 justify-center pt-[1px]">
                        <StatusIcon status={task.status} />
                      </div>
                      <OverflowTooltip content={task.title} className="min-w-0 flex-1" placement="top">
                        <span
                          className="block min-w-0 truncate text-[14px] leading-[1.57]"
                          style={{
                            color: task.status === 'todo' ? C.bodyMuted : C.body,
                          }}
                        >
                          {task.title}
                        </span>
                      </OverflowTooltip>
                    </div>
                    {idx < n - 1 ? (
                      <div className="flex gap-3" aria-hidden>
                        <div className="flex w-5 shrink-0 flex-col items-center px-0 py-1.5">
                          <div className="h-8 w-px shrink-0 bg-[#E8E8E8]" />
                        </div>
                        <div className="min-w-0 flex-1" />
                      </div>
                    ) : null}
                  </Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
