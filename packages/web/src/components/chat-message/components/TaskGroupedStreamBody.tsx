/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { TaskRunPersistExtra } from '@openjiuwen/relay-shared';
import { TASK_RUN_UNGROUPED } from '@openjiuwen/relay-shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTaskSegmentTimeline } from '@/components/chat-message/utils/task-segment-timeline';
import { CliOutputBlock } from '@/components/cli-output/cli-output-block';
import { CheckIcon, InterruptedStopIcon } from '@/components/cli-output/cli-output-block/CliOutputBasicIcons';
import { toCliEvents } from '@/components/cli-output/toCliEvents';
import { bubbleExpandStorageKey, readBubbleExpandPref, writeBubbleExpandPref } from '@/lib/chat-bubble-expand-prefs';
import { LoadingPointStyle } from '@/components/LoadingPointStyle';
import { MarkdownContent } from '@/components/MarkdownContent';
import type { AuthPendingRequest, RespondScope } from '@/hooks/useAuthorization';
import type { CliStatus, ToolEvent } from '@/stores/chat-types';
import type { ChatMessage as ChatMessageType } from '@/stores/chatStore';
import { ThinkingContent } from './ThinkingContent';

const UNGROUPED_TASK_TITLE = '分析检索';

interface TaskGroupedStreamBodyProps {
  threadId: string;
  taskRuns: TaskRunPersistExtra;
  message: ChatMessageType;
  cliStatus: CliStatus;
  thinkingFontClass?: string;
  thinkingLabel?: string;
  breedColor?: string;
  thinkingMode?: 'debug' | 'play';
  projectPath?: string;
  suppressedGeneratedFileNames?: string[];
  pendingAuthRequests?: AuthPendingRequest[];
  onAuthRespond?: (requestId: string, granted: boolean, scope: RespondScope, reason?: string) => void | Promise<void>;
  onOpenSecurityManagement?: () => void;
}

function Chevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 text-gray-400 transition-transform duration-150 ${expanded ? 'rotate-180' : ''} ${className}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function segmentTitle(seg: TaskRunPersistExtra['segments'][number]): string {
  const noTaskId = !seg.taskId || seg.taskId === TASK_RUN_UNGROUPED;
  if (noTaskId) {
    return UNGROUPED_TASK_TITLE;
  }
  const t = seg.title?.trim();
  return t || seg.taskId;
}

function lastStreamTextEntryKey(timeline: ReturnType<typeof buildTaskSegmentTimeline>): string | undefined {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const e = timeline[i];
    if (e?.kind === 'streamText') return e.key;
  }
  return undefined;
}

function streamTextWithUserStopSuffix(
  content: string,
  opts: { cliStatus: CliStatus; isLastSegment: boolean; entryKey: string; lastStreamTextKey: string | undefined },
): string {
  const { cliStatus, isLastSegment, entryKey, lastStreamTextKey } = opts;
  if (
    cliStatus === 'interrupted' &&
    isLastSegment &&
    entryKey === lastStreamTextKey &&
    content.trim().length > 0 &&
    !content.trimEnd().endsWith('(用户停止)')
  ) {
    return `${content.trimEnd()} (用户停止)`;
  }
  return content;
}

function TaskRowStatusIcon({ cliStatus, isLastVisibleTask }: { cliStatus: CliStatus; isLastVisibleTask: boolean }) {
  if (cliStatus === 'streaming' && isLastVisibleTask) {
    return <LoadingPointStyle className="w-[18px] h-[18px] flex-shrink-0" />;
  }
  if (cliStatus === 'interrupted' && isLastVisibleTask) {
    return <InterruptedStopIcon className="w-[18px] h-[18px] flex-shrink-0" />;
  }
  if (cliStatus === 'failed' && isLastVisibleTask) {
    return (
      <span
        className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-red-500 text-xs font-bold"
        aria-hidden
      >
        !
      </span>
    );
  }
  return <CheckIcon />;
}

export function TaskGroupedStreamBody({
  threadId,
  taskRuns,
  message,
  cliStatus,
  thinkingFontClass,
  breedColor,
  thinkingMode,
  thinkingLabel,
  projectPath,
  suppressedGeneratedFileNames,
  pendingAuthRequests,
  onAuthRespond,
  onOpenSecurityManagement,
}: TaskGroupedStreamBodyProps) {
  const prevCliRef = useRef(cliStatus);
  const outerPersistKey = useMemo(
    () => bubbleExpandStorageKey(threadId, message.id, 'thinking-exec'),
    [threadId, message.id],
  );
  const outerTouchedRef = useRef(readBubbleExpandPref(outerPersistKey) !== undefined);
  const [outerOpen, setOuterOpen] = useState(() => {
    const p = readBubbleExpandPref(outerPersistKey);
    if (p !== undefined) return p;
    return cliStatus === 'streaming';
  });
  const [taskOpen, setTaskOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const prev = prevCliRef.current;
    prevCliRef.current = cliStatus;
    if (cliStatus === 'streaming') {
      setOuterOpen(true);
      return;
    }
    if (
      !outerTouchedRef.current &&
      prev === 'streaming' &&
      (cliStatus === 'done' || cliStatus === 'failed' || cliStatus === 'interrupted')
    ) {
      setOuterOpen(false);
    }
  }, [cliStatus]);

  const taskKey = (seg: TaskRunPersistExtra['segments'][number], i: number) => `${seg.taskId}:${i}`;

  const taskStorageKey = (key: string) => bubbleExpandStorageKey(threadId, message.id, `task:${key}`);

  const isTaskExpanded = (key: string) => {
    if (Object.prototype.hasOwnProperty.call(taskOpen, key)) {
      return taskOpen[key] !== false;
    }
    const p = readBubbleExpandPref(taskStorageKey(key));
    if (p !== undefined) return p;
    return true;
  };

  const toggleTask = (key: string) => {
    const next = !isTaskExpanded(key);
    writeBubbleExpandPref(taskStorageKey(key), next);
    setTaskOpen((m) => ({ ...m, [key]: next }));
  };

  const crossSegmentToolResults = useMemo(
    () =>
      taskRuns.segments.flatMap((seg) =>
        toCliEvents((seg.toolEvents ?? []) as ToolEvent[], undefined).filter((e) => e.kind === 'tool_result'),
      ),
    [taskRuns],
  );

  const visibleSegments = taskRuns.segments
    .map((seg, i) => ({ seg, i }))
    .filter(({ seg }) => {
      const subTools = (seg.toolEvents ?? []) as ToolEvent[];
      const cliEvents = toCliEvents(subTools, undefined, {
        padUnmatchedToolResults: cliStatus === 'done',
      });
      const hasTools = cliEvents.length > 0;
      const hasThinking = Boolean(seg.thinking?.trim()) || Boolean(seg.thinkingChunks && seg.thinkingChunks.length > 0);
      const hasStreamText = Boolean(seg.text?.trim()) || Boolean(seg.textChunks && seg.textChunks.length > 0);
      const noTaskId = !seg.taskId || seg.taskId === TASK_RUN_UNGROUPED;
      const hasPayload = hasThinking || hasTools || hasStreamText;
      if (noTaskId) return hasPayload;
      return hasPayload || Boolean(seg.title?.trim());
    });

  const outerStatusIcon =
    cliStatus === 'streaming' ? (
      <LoadingPointStyle className="w-[18px] h-[18px] flex-shrink-0" />
    ) : cliStatus === 'interrupted' ? (
      <InterruptedStopIcon className="w-[18px] h-[18px] flex-shrink-0" />
    ) : null;

  return (
    <div className="thinking-execution border-b border-[rgba(240,240,240,1)] pb-3">
      <button
        type="button"
        className="flex gap-1 pt-2 items-center"
        onClick={() => {
          outerTouchedRef.current = true;
          setOuterOpen((v) => {
            const next = !v;
            writeBubbleExpandPref(outerPersistKey, next);
            return next;
          });
        }}
      >
        {outerStatusIcon}
        <span className="text-[16px] text-[rgb(89,89,89)]">{thinkingLabel ?? '思考执行中'}</span>
        <Chevron expanded={outerOpen} />
      </button>

      {outerOpen && (
        <div className="task-list flex flex-col gap-2.5 pt-2">
          {visibleSegments.map(({ seg, i }, visibleIndex) => {
            const key = taskKey(seg, i);
            const title = segmentTitle(seg);
            /** 仅「当前可见列表的最后一项」继承全局流式状态；已结束的步骤用 done，避免工具行误判为仍在等 tool_result */
            const isLastVisible = visibleIndex === visibleSegments.length - 1;
            const segmentCliStatus: CliStatus = isLastVisible ? cliStatus : 'done';
            const subTools = (seg.toolEvents ?? []) as ToolEvent[];
            const cliEvents = toCliEvents(subTools, undefined, {
              padUnmatchedToolResults: cliStatus === 'done' || !isLastVisible,
            });
            const timeline = buildTaskSegmentTimeline(seg, cliEvents, message.timestamp);
            const lastStreamTextKey = lastStreamTextEntryKey(timeline);
            const expanded = isTaskExpanded(key);
            const isLast = isLastVisible;
            /** 收起时完全不画竖线；展开时画到卡片底并伸入与下一任务的 gap，上下各留 8px 不贴边 */
            const showTimelineStem = expanded && !isLast;

            return (
              <div key={key} className="task-item relative flex gap-1 items-stretch">
                {showTimelineStem ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-[9px] z-0 w-px bg-[rgb(219,219,219)]"
                    style={{ top: 'calc(18px + 8px)', bottom: 'calc(-0.625rem + 8px)' }}
                  />
                ) : null}
                <div className="relative z-[1] flex w-[18px] shrink-0 flex-col items-center">
                  <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center bg-white">
                    <TaskRowStatusIcon cliStatus={cliStatus} isLastVisibleTask={isLast} />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <button type="button" className="flex items-center gap-2 text-left" onClick={() => toggleTask(key)}>
                    <span className="text-[12px] text-gray-800 flex-1 min-w-0 truncate">{title}</span>
                    <Chevron expanded={expanded} />
                  </button>
                  {expanded ? (
                    <div className="pt-2 pl-1">
                      {timeline.map((entry) =>
                        entry.kind === 'thinking' ? (
                          <ThinkingContent
                            key={entry.key}
                            status={segmentCliStatus}
                            events={[]}
                            content={entry.content}
                            className={thinkingFontClass}
                            defaultExpanded
                            expandInExport={false}
                            breedColor={breedColor}
                            inline
                          />
                        ) : entry.kind === 'streamText' ? (
                          <div
                            key={entry.key}
                            className="task-inline-stream-text overflow-hidden pb-1 pt-1 text-[12px] leading-relaxed text-[#595959]"
                          >
                            <MarkdownContent
                              content={streamTextWithUserStopSuffix(entry.content, {
                                cliStatus,
                                isLastSegment: isLast,
                                entryKey: entry.key,
                                lastStreamTextKey,
                              })}
                              className={thinkingFontClass}
                            />
                          </div>
                        ) : (
                          <CliOutputBlock
                            key={entry.key}
                            events={entry.events}
                            status={segmentCliStatus}
                            message={message}
                            threadId={threadId}
                            suppressedGeneratedFileNames={suppressedGeneratedFileNames}
                            thinkingMode={thinkingMode}
                            defaultExpanded
                            flatToolsDisplay
                            breedColor={breedColor}
                            projectPath={projectPath}
                            authorizationRequests={pendingAuthRequests}
                            onAuthorizationRespond={onAuthRespond}
                            onOpenSecurityManagement={onOpenSecurityManagement}
                            extraToolResults={crossSegmentToolResults}
                          />
                        ),
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
