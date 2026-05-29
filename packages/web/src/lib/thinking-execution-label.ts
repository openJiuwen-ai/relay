/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentInvocationInfo, ChatMessage, CliStatus } from '@/stores/chat-types';

/** 与示意图一致：20m42s、1h3m5s */
export function formatThinkingDurationHuman(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const secTotal = Math.floor(ms / 1000);
  const h = Math.floor(secTotal / 3600);
  const m = Math.floor((secTotal % 3600) / 60);
  const s = secTotal % 60;
  if (h > 0) {
    return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
  }
  if (m > 0) {
    return `${m}m${String(s).padStart(2, '0')}s`;
  }
  return `${s}s`;
}

export function countAssistantToolUses(toolEvents: ChatMessage['toolEvents']): number {
  if (!toolEvents?.length) return 0;
  return toolEvents.filter((e) => e.type === 'tool_use').length;
}

function latestEventTimeMs(message: ChatMessage): number {
  const candidates: number[] = [message.timestamp];
  for (const e of message.toolEvents ?? []) {
    if (typeof e.timestamp === 'number' && Number.isFinite(e.timestamp)) {
      candidates.push(e.timestamp);
    }
  }
  for (const seg of message.extra?.taskRuns?.segments ?? []) {
    for (const c of seg.thinkingChunks ?? []) {
      if (typeof c.timestamp === 'number' && Number.isFinite(c.timestamp)) {
        candidates.push(c.timestamp);
      }
    }
    for (const c of seg.textChunks ?? []) {
      if (typeof c.timestamp === 'number' && Number.isFinite(c.timestamp)) {
        candidates.push(c.timestamp);
      }
    }
    for (const e of seg.toolEvents ?? []) {
      if (typeof e.timestamp === 'number' && Number.isFinite(e.timestamp)) {
        candidates.push(e.timestamp);
      }
    }
  }
  return Math.max(...candidates);
}

function earliestToolTimeMs(message: ChatMessage): number | null {
  const ts: number[] = [];
  for (const e of message.toolEvents ?? []) {
    if (typeof e.timestamp === 'number' && Number.isFinite(e.timestamp) && e.timestamp > 0) {
      ts.push(e.timestamp);
    }
  }
  for (const seg of message.extra?.taskRuns?.segments ?? []) {
    for (const e of seg.toolEvents ?? []) {
      if (typeof e.timestamp === 'number' && Number.isFinite(e.timestamp) && e.timestamp > 0) {
        ts.push(e.timestamp);
      }
    }
  }
  if (ts.length === 0) return null;
  return Math.min(...ts);
}

/**
 * 耗时：从本轮 invocation 开始（与「正在识别需求」解耦）到对话结束。
 * 优先使用后端 invocation_complete 的 durationMs；否则用工具时间戳与消息时间估算。
 */
export function resolveThinkingExecutionDurationMs(
  message: ChatMessage,
  cliStatus: CliStatus,
  catInvocation: AgentInvocationInfo | undefined,
  activeInvocationStartedAt: number | undefined,
): number | null {
  const invId = message.extra?.stream?.invocationId;
  const invMatches = Boolean(invId && catInvocation?.invocationId === invId);

  if (cliStatus === 'streaming') {
    const start =
      (invMatches && catInvocation?.startedAt) ||
      (invId && activeInvocationStartedAt) ||
      message.timestamp;
    return Math.max(0, Date.now() - start);
  }

  const persistedDuration = message.extra?.stream?.durationMs;
  if (
    (cliStatus === 'done' || cliStatus === 'failed') &&
    typeof persistedDuration === 'number' &&
    Number.isFinite(persistedDuration) &&
    persistedDuration > 0
  ) {
    return persistedDuration;
  }

  if ((cliStatus === 'done' || cliStatus === 'failed') && invMatches && catInvocation?.durationMs != null) {
    const d = catInvocation.durationMs;
    if (typeof d === 'number' && Number.isFinite(d) && d > 0) return d;
  }

  const endMs = latestEventTimeMs(message);
  const startFromTools = earliestToolTimeMs(message);
  const startMs =
    (invMatches && catInvocation?.startedAt) ||
    startFromTools ||
    message.timestamp;
  if (endMs < startMs) return null;
  return endMs - startMs;
}

export function buildThinkingExecutionLabel(
  message: ChatMessage,
  cliStatus: CliStatus,
  catInvocation: AgentInvocationInfo | undefined,
  activeInvocationStartedAt: number | undefined,
): string {
  if (cliStatus === 'streaming') {
    return '思考执行中';
  }
  if (cliStatus === 'interrupted') {
    return '已停止思考执行';
  }
  const toolCount = countAssistantToolUses(message.toolEvents);
  const durationMs = resolveThinkingExecutionDurationMs(
    message,
    cliStatus,
    catInvocation,
    activeInvocationStartedAt,
  );
  const durationPart =
    durationMs != null && durationMs > 0 ? `，耗时${formatThinkingDurationHuman(durationMs)}` : '';
  return `思考执行完成（已调用${toolCount}个工具${durationPart}）`;
}
