/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Per-task aggregation for relay/jiuwen streams: thinking, task-scoped stream text,
 * and tool events are bucketed by task_id for UI + persistence (extra.taskRuns).
 * Assistant formal reply uses message `content` only for text **outside** a named task bucket.
 */

export const TASK_RUN_UNGROUPED = '__ungrouped__';

export type ThinkingChunkMergeStrategy = 'append' | 'paragraph';

export function appendThinkingChunk(
  existing: string,
  chunk: string,
  strategy: ThinkingChunkMergeStrategy = 'paragraph',
): string {
  if (!existing) return chunk;
  if (!chunk) return existing;
  return strategy === 'append' ? `${existing}${chunk}` : `${existing}\n\n${chunk}`;
}

export interface AgentTaskContextPayload {
  id: string;
  title?: string;
  index?: number;
  total?: number;
}

export interface TaskRunToolEvent {
  id: string;
  type: 'tool_use' | 'tool_result';
  label: string;
  detail?: string;
  timestamp: number;
  toolCallId?: string;
}

/** One stream append for `thinking` — used to interleave with tools in UI by timestamp */
export interface TaskRunThinkingChunkPersisted {
  timestamp: number;
  text: string;
}

export interface TaskRunSegmentPersisted {
  taskId: string;
  title?: string;
  taskIndex?: number;
  totalTasks?: number;
  thinking: string;
  /** Optional timeline; when absent UI falls back to single `thinking` blob vs tools */
  thinkingChunks?: TaskRunThinkingChunkPersisted[];
  /** `type=text` stream deltas scoped to this task (same shape as thinkingChunks; excluded from assistant formal body) */
  textChunks?: TaskRunThinkingChunkPersisted[];
  toolEvents: TaskRunToolEvent[];
  /** Concatenation of task-scoped stream text (mirrors thinking aggregation) */
  text: string;
}

export interface TaskRunPersistExtra {
  v: 1;
  segments: TaskRunSegmentPersisted[];
}

function cloneSegment(seg: TaskRunSegmentPersisted): TaskRunSegmentPersisted {
  return {
    ...seg,
    toolEvents: seg.toolEvents.map((t) => ({ ...t })),
    ...(seg.thinkingChunks?.length ? { thinkingChunks: seg.thinkingChunks.map((c) => ({ ...c })) } : {}),
    ...(seg.textChunks?.length ? { textChunks: seg.textChunks.map((c) => ({ ...c })) } : {}),
  };
}

/** Prefer longer snapshot; when `newText` extends `oldText`, keep the extension. */
function mergeAggregatedStreamText(oldText: string, newText: string): string {
  if (!oldText) return newText;
  if (!newText) return oldText;
  if (newText === oldText) return newText;
  if (newText.startsWith(oldText)) return newText;
  if (oldText.startsWith(newText)) return oldText;
  return newText.length >= oldText.length ? newText : oldText;
}

function mergeToolEventsTimeline(
  oldEvents: TaskRunToolEvent[],
  newEvents: TaskRunToolEvent[],
): TaskRunToolEvent[] {
  if (oldEvents.length === 0) return newEvents.map((e) => ({ ...e }));
  if (newEvents.length === 0) return oldEvents.map((e) => ({ ...e }));

  const byId = new Map<string, TaskRunToolEvent>();
  for (const e of oldEvents) {
    byId.set(e.id, { ...e });
  }
  for (const e of newEvents) {
    const existing = byId.get(e.id);
    if (!existing) {
      byId.set(e.id, { ...e });
      continue;
    }
    if (
      e.type === 'tool_result' &&
      (e.detail?.trim().length ?? 0) > (existing.detail?.trim().length ?? 0)
    ) {
      byId.set(e.id, { ...e });
    }
  }
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp || 0);
}

function mergeTaskRunSegment(old: TaskRunSegmentPersisted, incoming: TaskRunSegmentPersisted): TaskRunSegmentPersisted {
  const incomingTitle = typeof incoming.title === 'string' ? incoming.title.trim() : '';
  const oldTitle = typeof old.title === 'string' ? old.title.trim() : '';
  const title = incomingTitle.length > 0 ? incoming.title : oldTitle.length > 0 ? old.title : undefined;
  const mergedChunks = mergeThinkingChunksTimeline(old.thinkingChunks, incoming.thinkingChunks);
  const mergedTextChunks = mergeThinkingChunksTimeline(old.textChunks, incoming.textChunks);
  return {
    taskId: incoming.taskId,
    ...(title !== undefined ? { title } : {}),
    ...(incoming.taskIndex !== undefined ? {} : old.taskIndex !== undefined ? { taskIndex: old.taskIndex } : {}),
    ...(incoming.totalTasks !== undefined ? {} : old.totalTasks !== undefined ? { totalTasks: old.totalTasks } : {}),
    thinking: mergeAggregatedStreamText(old.thinking, incoming.thinking),
    text: mergeAggregatedStreamText(old.text, incoming.text),
    toolEvents: mergeToolEventsTimeline(old.toolEvents, incoming.toolEvents),
    ...(mergedChunks !== undefined ? { thinkingChunks: mergedChunks } : {}),
    ...(mergedTextChunks !== undefined ? { textChunks: mergedTextChunks } : {}),
  };
}

/**
 * When the client drops in-memory TaskRunAccumulator (e.g. thread switch clears refs),
 * merge flushed `previous` payload back into a fresh accumulator snapshot by taskId.
 * Preserves toolEvents, thinking/text blobs, chunk timelines, and segments only on `previous`.
 */
export function mergeTaskRunsPreserveSegmentMeta(
  incoming: TaskRunPersistExtra,
  previous: TaskRunPersistExtra | undefined,
): TaskRunPersistExtra {
  if (!previous?.segments?.length) {
    return {
      v: 1,
      segments: incoming.segments.map((s) => cloneSegment(s)),
    };
  }
  const prevById = new Map(previous.segments.map((s) => [s.taskId, s]));
  const incomingIds = new Set(incoming.segments.map((s) => s.taskId));
  const merged: TaskRunSegmentPersisted[] = incoming.segments.map((seg) => {
    const old = prevById.get(seg.taskId);
    if (!old) return cloneSegment(seg);
    return mergeTaskRunSegment(old, seg);
  });
  for (const old of previous.segments) {
    if (!incomingIds.has(old.taskId)) {
      merged.push(cloneSegment(old));
    }
  }
  return { v: 1, segments: merged };
}

/** Drop consecutive identical (timestamp, text) pairs after sorting (replay / merge noise). */
function dedupeConsecutiveThinkingChunks(
  chunks: TaskRunThinkingChunkPersisted[],
): TaskRunThinkingChunkPersisted[] {
  const out: TaskRunThinkingChunkPersisted[] = [];
  for (const c of chunks) {
    const prev = out[out.length - 1];
    if (prev && prev.timestamp === c.timestamp && prev.text === c.text) continue;
    out.push(c);
  }
  return out;
}

/**
 * Merge thinking chunk timelines from persisted message (`old`) and fresh accumulator (`new`).
 * On each flush, `new` is typically the full in-memory list while `old` is the previous flush — naive
 * concat duplicates the prefix (UI shows "TheTheThe…"). When `old` is an index-wise prefix of `new`,
 * use `new` only; otherwise concat, sort by time, then dedupe consecutive identical pairs.
 */
export function mergeThinkingChunksTimeline(
  oldChunks: TaskRunThinkingChunkPersisted[] | undefined,
  newChunks: TaskRunThinkingChunkPersisted[] | undefined,
): TaskRunThinkingChunkPersisted[] | undefined {
  if (!oldChunks?.length) return newChunks?.length ? newChunks.map((c) => ({ ...c })) : undefined;
  if (!newChunks?.length) return oldChunks.map((c) => ({ ...c }));

  const newIsExtensionOfOld =
    oldChunks.length <= newChunks.length &&
    oldChunks.every((c, i) => {
      const n = newChunks[i];
      return n !== undefined && c.timestamp === n.timestamp && c.text === n.text;
    });

  if (newIsExtensionOfOld) return newChunks.map((c) => ({ ...c }));

  const combined = [...oldChunks, ...newChunks]
    .map((c) => ({ ...c }))
    .sort((a, b) => a.timestamp - b.timestamp || 0);
  const deduped = dedupeConsecutiveThinkingChunks(combined);
  return deduped.length ? deduped : undefined;
}

/** Minimal agent stream message shape for task routing (API + web). */
export interface AgentLikeTaskMessage {
  type: string;
  taskPhase?: 'start' | 'complete';
  taskContext?: AgentTaskContextPayload;
  content?: string;
  agentId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolCallId?: string;
  timestamp?: number;
}

export class TaskRunAccumulator {
  private readonly segments: TaskRunSegmentPersisted[] = [];
  private readonly indexByTaskId = new Map<string, number>();
  private stack: string[] = [];

  reset(): void {
    this.segments.length = 0;
    this.indexByTaskId.clear();
    this.stack = [];
  }

  /** Rebuild in-memory state from `message.extra.taskRuns` after thread switch / ref loss. */
  loadFromExtra(extra: TaskRunPersistExtra): void {
    this.reset();
    for (const seg of extra.segments) {
      const cloned = cloneSegment(seg);
      const idx = this.segments.length;
      this.indexByTaskId.set(cloned.taskId, idx);
      this.segments.push(cloned);
    }
  }

  private resolveKey(msg: AgentLikeTaskMessage): string {
    return msg.taskContext?.id ?? this.stack[this.stack.length - 1] ?? TASK_RUN_UNGROUPED;
  }

  /** True when stream `text` should be bucketed into taskRuns (not assistant formal content). */
  isTaskScopedText(msg: AgentLikeTaskMessage): boolean {
    return this.resolveKey(msg) !== TASK_RUN_UNGROUPED;
  }

  private ensureSegmentByKey(taskId: string, meta?: AgentTaskContextPayload): TaskRunSegmentPersisted {
    let idx = this.indexByTaskId.get(taskId);
    if (idx === undefined) {
      idx = this.segments.length;
      this.indexByTaskId.set(taskId, idx);
      this.segments.push({
        taskId,
        ...(meta?.title ? { title: meta.title } : {}),
        ...(meta?.index !== undefined ? { taskIndex: meta.index } : {}),
        ...(meta?.total !== undefined ? { totalTasks: meta.total } : {}),
        thinking: '',
        toolEvents: [],
        text: '',
      });
      return this.segments[idx]!;
    }
    const seg = this.segments[idx]!;
    if (meta) {
      if (meta.title) seg.title = meta.title;
      if (meta.index !== undefined) seg.taskIndex = meta.index;
      if (meta.total !== undefined) seg.totalTasks = meta.total;
    }
    return seg;
  }

  onBoundary(msg: AgentLikeTaskMessage): void {
    if (msg.taskPhase === 'start' && msg.taskContext?.id) {
      this.stack.push(msg.taskContext.id);
      this.ensureSegmentByKey(msg.taskContext.id, msg.taskContext);
      return;
    }
    if (msg.taskPhase === 'complete' && msg.taskContext?.id) {
      const i = this.stack.lastIndexOf(msg.taskContext.id);
      if (i >= 0) this.stack.splice(i);
    }
  }

  appendText(msg: AgentLikeTaskMessage, text: string): void {
    if (!text) return;
    const key = this.resolveKey(msg);
    const seg = this.ensureSegmentByKey(key);
    seg.text += text;
    const ts =
      typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) && msg.timestamp > 0
        ? msg.timestamp
        : Date.now();
    if (!seg.textChunks) seg.textChunks = [];
    seg.textChunks.push({ timestamp: ts, text });
  }

  appendThinking(msg: AgentLikeTaskMessage, text: string, strategy: ThinkingChunkMergeStrategy = 'append'): void {
    if (!text) return;
    const key = this.resolveKey(msg);
    const seg = this.ensureSegmentByKey(key);
    seg.thinking = appendThinkingChunk(seg.thinking, text, strategy);
    const ts =
      typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp) && msg.timestamp > 0
        ? msg.timestamp
        : Date.now();
    if (!seg.thinkingChunks) seg.thinkingChunks = [];
    seg.thinkingChunks.push({ timestamp: ts, text });
  }

  /**
   * Route tool_result to the segment that already holds its tool_use.
   * tool_result often arrives after taskPhase=complete (stack popped), which would
   * otherwise land in __ungrouped__ while the tool_use stayed in the task segment.
   */
  private findSegmentForToolResult(toolCallId: string): TaskRunSegmentPersisted | undefined {
    for (const seg of this.segments) {
      const useCount = seg.toolEvents.filter((e) => e.type === 'tool_use' && e.toolCallId === toolCallId).length;
      if (useCount === 0) continue;
      const resultCount = seg.toolEvents.filter(
        (e) => e.type === 'tool_result' && e.toolCallId === toolCallId,
      ).length;
      if (resultCount < useCount) return seg;
    }
    for (const seg of this.segments) {
      if (seg.toolEvents.some((e) => e.type === 'tool_use' && e.toolCallId === toolCallId)) {
        return seg;
      }
    }
    return undefined;
  }

  appendTool(msg: AgentLikeTaskMessage, ev: TaskRunToolEvent): void {
    if (ev.type === 'tool_result' && ev.toolCallId) {
      const paired = this.findSegmentForToolResult(ev.toolCallId);
      if (paired) {
        paired.toolEvents.push(ev);
        return;
      }
    }
    const key = this.resolveKey(msg);
    const seg = this.ensureSegmentByKey(key, msg.taskContext);
    seg.toolEvents.push(ev);
  }

  /** Handles boundaries, text, and tool-like messages when `tool` is pre-built. */
  ingestStreamMessage(msg: AgentLikeTaskMessage, tool?: TaskRunToolEvent | null): void {
    if (msg.type === 'session_init' || msg.type === 'done') return;
    if (msg.taskPhase === 'start' || msg.taskPhase === 'complete') {
      this.onBoundary(msg);
      return;
    }
    // type === 'text': routed via appendText when task-scoped (see route-serial / useAgentMessages); formal bubble otherwise.
    if (tool) {
      this.appendTool(msg, tool);
    }
  }

  toExtra(): TaskRunPersistExtra | undefined {
    if (this.segments.length === 0) return undefined;
    const hasNamedTask = this.segments.some((s) => s.taskId !== TASK_RUN_UNGROUPED);
    const hasPayload = this.segments.some(
      (s) =>
        s.thinking.length > 0 ||
        (s.thinkingChunks?.length ?? 0) > 0 ||
        (s.textChunks?.length ?? 0) > 0 ||
        s.toolEvents.length > 0 ||
        s.text.length > 0,
    );
    if (!hasNamedTask && !hasPayload) return undefined;
    return {
      v: 1,
      segments: this.segments.map((s) => ({
        ...s,
        toolEvents: s.toolEvents.map((t) => ({ ...t })),
        ...(s.thinkingChunks?.length
          ? { thinkingChunks: s.thinkingChunks.map((c) => ({ ...c })) }
          : {}),
        ...(s.textChunks?.length ? { textChunks: s.textChunks.map((c) => ({ ...c })) } : {}),
      })),
    };
  }
}
