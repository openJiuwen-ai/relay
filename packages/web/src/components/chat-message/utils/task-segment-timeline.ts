/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { TaskRunPersistExtra } from '@openjiuwen/relay-shared';
import type { CliEvent } from '@/stores/chat-types';

export type TaskRunSegment = TaskRunPersistExtra['segments'][number];

export type TaskSegmentTimelineEntry =
  | { kind: 'thinking'; key: string; ts: number; content: string }
  | { kind: 'streamText'; key: string; ts: number; content: string }
  | { kind: 'tools'; key: string; ts: number; events: CliEvent[] };

/** Group CLI timeline into runs starting at each tool_use (use + following results). */
export function splitCliEventsIntoToolRuns(events: CliEvent[]): CliEvent[][] {
  const runs: CliEvent[][] = [];
  for (const e of events) {
    if (e.kind === 'tool_use') {
      runs.push([e]);
    } else if (runs.length > 0) {
      runs[runs.length - 1]!.push(e);
    } else {
      runs.push([e]);
    }
  }
  return runs;
}

/** After time-sort, merge adjacent thinking blocks so streaming word-by-word chunks render as one paragraph (single ThinkingContent). */
function mergeConsecutiveThinkingEntries(entries: TaskSegmentTimelineEntry[]): TaskSegmentTimelineEntry[] {
  const out: TaskSegmentTimelineEntry[] = [];
  for (const e of entries) {
    if (e.kind === 'thinking') {
      const last = out[out.length - 1];
      if (last?.kind === 'thinking') {
        last.content += e.content;
        continue;
      }
      out.push({ ...e });
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

/** Merge adjacent streamText entries (task-scoped `type=text` deltas) like thinking. */
function mergeConsecutiveStreamTextEntries(entries: TaskSegmentTimelineEntry[]): TaskSegmentTimelineEntry[] {
  const out: TaskSegmentTimelineEntry[] = [];
  for (const e of entries) {
    if (e.kind === 'streamText') {
      const last = out[out.length - 1];
      if (last?.kind === 'streamText') {
        last.content += e.content;
        continue;
      }
      out.push({ ...e });
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

/** After time-sort, merge adjacent tool blocks so one contiguous tool region stays a single CliOutputBlock (preserves prior layout). */
function mergeConsecutiveToolEntries(entries: TaskSegmentTimelineEntry[]): TaskSegmentTimelineEntry[] {
  const out: TaskSegmentTimelineEntry[] = [];
  for (const e of entries) {
    if (e.kind === 'tools') {
      const last = out[out.length - 1];
      if (last?.kind === 'tools') {
        last.events.push(...e.events);
        continue;
      }
      out.push({ ...e, events: [...e.events] });
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

function inferFallbackThinkingTimestamp(cliEvents: CliEvent[], messageTimestamp: number): number {
  const toolTs = cliEvents.map((e) => e.timestamp).filter((t) => typeof t === 'number' && Number.isFinite(t));
  if (toolTs.length > 0) return Math.min(...toolTs) - 1;
  if (typeof messageTimestamp === 'number' && Number.isFinite(messageTimestamp)) return messageTimestamp;
  return 0;
}

function inferFallbackStreamTextTimestamp(cliEvents: CliEvent[], messageTimestamp: number): number {
  const toolTs = cliEvents.map((e) => e.timestamp).filter((t) => typeof t === 'number' && Number.isFinite(t));
  if (toolTs.length > 0) return Math.min(...toolTs) - 2;
  if (typeof messageTimestamp === 'number' && Number.isFinite(messageTimestamp)) return messageTimestamp;
  return 0;
}

/**
 * Interleave thinking (chunked or single blob) with tool runs by timestamp.
 * Adjacent thinking / streamText entries merge into one block (streaming deltas).
 * Adjacent tool runs merge into one CliOutputBlock-sized entry.
 */
export function buildTaskSegmentTimeline(
  seg: TaskRunSegment,
  cliEvents: CliEvent[],
  messageTimestamp: number,
): TaskSegmentTimelineEntry[] {
  const thinkingSource =
    seg.thinkingChunks && seg.thinkingChunks.length > 0
      ? seg.thinkingChunks.map((c) => ({ timestamp: c.timestamp, text: c.text }))
      : seg.thinking?.trim()
        ? [
            {
              timestamp: inferFallbackThinkingTimestamp(cliEvents, messageTimestamp),
              text: seg.thinking,
            },
          ]
        : [];

  const thinkingEntries: TaskSegmentTimelineEntry[] = thinkingSource.map((c, i) => ({
    kind: 'thinking' as const,
    key: `th-${seg.taskId}-${i}-${c.timestamp}`,
    ts: c.timestamp,
    content: c.text,
  }));

  const textSource =
    seg.textChunks && seg.textChunks.length > 0
      ? seg.textChunks.map((c) => ({ timestamp: c.timestamp, text: c.text }))
      : seg.text?.trim()
        ? [
            {
              timestamp: inferFallbackStreamTextTimestamp(cliEvents, messageTimestamp),
              text: seg.text,
            },
          ]
        : [];

  const streamTextEntries: TaskSegmentTimelineEntry[] = textSource.map((c, i) => ({
    kind: 'streamText' as const,
    key: `tx-${seg.taskId}-${i}-${c.timestamp}`,
    ts: c.timestamp,
    content: c.text,
  }));

  const toolRuns = splitCliEventsIntoToolRuns(cliEvents);
  const toolEntries: TaskSegmentTimelineEntry[] = toolRuns.map((run, i) => ({
    kind: 'tools' as const,
    key: `to-${seg.taskId}-${i}-${run[0]?.timestamp ?? 0}`,
    ts: run[0]?.timestamp ?? 0,
    events: run,
  }));

  const merged = [...thinkingEntries, ...streamTextEntries, ...toolEntries].map((e, order) => ({ e, order }));
  merged.sort((a, b) => {
    if (a.e.ts !== b.e.ts) return a.e.ts - b.e.ts;
    return a.order - b.order;
  });
  const sorted = merged.map((x) => x.e);
  return mergeConsecutiveToolEntries(
    mergeConsecutiveStreamTextEntries(mergeConsecutiveThinkingEntries(sorted)),
  );
}
