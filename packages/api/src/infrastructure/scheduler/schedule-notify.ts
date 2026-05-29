/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * #415 Phase 2: Task lifecycle notifications
 *
 * Fire-and-forget notifications to delivery threads for lifecycle events:
 * registered, paused, resumed, deleted, failed, missed-window.
 */

import { getNextCronMs } from './cron-utils.js';
import type { DynamicTaskDef } from './DynamicTaskStore.js';
import type { DeliverOpts, TriggerSpec } from './types.js';

type DeliverFn = (opts: DeliverOpts) => Promise<string>;

/** Compute epoch ms of next fire time for a trigger */
export function computeNextFireTime(trigger: TriggerSpec, nowMs = Date.now()): number | null {
  if (trigger.type === 'once') return trigger.fireAt;
  if (trigger.type === 'cron') return nowMs + getNextCronMs(trigger.expression, trigger.timezone, new Date(nowMs));
  if (trigger.type === 'interval') return nowMs + trigger.ms;
  return null;
}

export function formatTime(epoch: number, timezone = 'Asia/Shanghai'): string {
  return new Date(epoch).toLocaleString('zh-CN', { timeZone: timezone, hour12: false });
}

function resolveUserId(def: DynamicTaskDef): string {
  return ((def.params as Record<string, unknown>).triggerUserId as string) ?? 'system';
}

function label(def: DynamicTaskDef): string {
  return def.display?.label ?? def.templateId;
}

function fire(deliver: DeliverFn | undefined, def: DynamicTaskDef, content: string): void {
  if (!deliver || !def.deliveryThreadId) return;
  deliver({ threadId: def.deliveryThreadId, content, agentId: 'system', userId: resolveUserId(def) }).catch(() => {});
}

export function notifyTaskRegistered(deliver: DeliverFn | undefined, def: DynamicTaskDef): void {
  const nextFire = computeNextFireTime(def.trigger);
  const timeStr = nextFire ? formatTime(nextFire) : '未知';
  const once = def.trigger.type === 'once' ? '（一次性，执行后自动退役）' : '';
  fire(deliver, def, `✅ 定时任务「${label(def)}」已创建，下次执行时间：${timeStr}${once}`);
}

export function notifyTaskPaused(deliver: DeliverFn | undefined, def: DynamicTaskDef): void {
  fire(deliver, def, `⏸️ 定时任务「${label(def)}」已暂停`);
}

export function notifyTaskResumed(deliver: DeliverFn | undefined, def: DynamicTaskDef): void {
  const nextFire = computeNextFireTime(def.trigger);
  const timeStr = nextFire ? formatTime(nextFire) : '未知';
  fire(deliver, def, `▶️ 定时任务「${label(def)}」已恢复，下次执行时间：${timeStr}`);
}

export function notifyTaskDeleted(deliver: DeliverFn | undefined, def: DynamicTaskDef): void {
  fire(deliver, def, `🗑️ 定时任务「${label(def)}」已删除`);
}

export function notifyTaskSucceeded(deliver: DeliverFn | undefined, def: DynamicTaskDef): void {
  if (def.trigger.type === 'once') {
    fire(deliver, def, `✅ 定时任务「${label(def)}」已触发，Agent 正在处理中，任务将自动结束`);
  } else {
    const nextFire = computeNextFireTime(def.trigger);
    const timeStr = nextFire ? formatTime(nextFire) : '未知';
    fire(deliver, def, `✅ 定时任务「${label(def)}」已触发，Agent 正在处理中，下次触发时间：${timeStr}`);
  }
}

export function notifyTaskFailed(
  deliver: DeliverFn | undefined,
  def: DynamicTaskDef,
  errorSummary: string | null,
): void {
  const reason = errorSummary ? `：${errorSummary.slice(0, 200)}` : '';
  fire(deliver, def, `❌ 定时任务「${label(def)}」执行失败${reason}`);
}
