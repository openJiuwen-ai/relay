/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Usage Aggregator — F128
 * 纯函数：将 InvocationRecord[] 按日 × 猫聚合 token 消耗。
 */

import type { InvocationRecord } from './stores/ports/InvocationRecordStore.js';

/** Aggregated token stats for a single agent on a single day */
export interface AgentDailyUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  /** Number of times this agent participated (one multi-agent invocation = 1 per agent) */
  participations: number;
}

/** Aggregated totals for a day or grand total */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  /** True invocation count (one multi-agent invocation = 1) */
  invocations: number;
}

/** One day's aggregated data */
export interface DailyUsageEntry {
  date: string; // YYYY-MM-DD
  agents: Record<string, AgentDailyUsage>;
  total: UsageTotals;
}

/** Full aggregation result */
export interface DailyUsageReport {
  period: { from: string; to: string };
  daily: DailyUsageEntry[];
  grandTotal: UsageTotals;
}

export interface AggregateOptions {
  days: number;
  agentId?: string;
}

function emptyAgentUsage(): AgentDailyUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, participations: 0 };
}

function emptyTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, invocations: 0 };
}

function roundCostCat(usage: AgentDailyUsage): AgentDailyUsage {
  return { ...usage, costUsd: Math.round(usage.costUsd * 1_000_000) / 1_000_000 };
}

function roundCostTotals(usage: UsageTotals): UsageTotals {
  return { ...usage, costUsd: Math.round(usage.costUsd * 1_000_000) / 1_000_000 };
}

function toDateString(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/**
 * Aggregate invocation records into a daily-by-agent usage report.
 * Pure function — no side effects, no I/O.
 */
export function aggregateUsageByDay(records: InvocationRecord[], options: AggregateOptions): DailyUsageReport {
  const now = new Date();
  const to = toDateString(now.getTime());
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - options.days + 1);
  const from = toDateString(fromDate.getTime());

  // Bucket: date -> agentId -> AgentDailyUsage
  const agentBuckets = new Map<string, Map<string, AgentDailyUsage>>();
  // Track true invocation count per day (record-level, not per-agent)
  const dayInvocations = new Map<string, number>();

  for (const record of records) {
    if (!record.usageByCat) continue;

    // Bucket by usageRecordedAt (stable, set once when usageByCat is first written).
    // Falls back to updatedAt for records created before F128 added this field.
    const date = toDateString(record.usageRecordedAt ?? record.updatedAt);

    // Skip records outside the requested date window
    if (date < from || date > to) continue;

    let contributed = false;
    for (const [agentId, usage] of Object.entries(record.usageByCat)) {
      if (options.agentId && agentId !== options.agentId) continue;
      contributed = true;

      let dayBucket = agentBuckets.get(date);
      if (!dayBucket) {
        dayBucket = new Map();
        agentBuckets.set(date, dayBucket);
      }

      const existing = dayBucket.get(agentId) ?? emptyAgentUsage();
      existing.inputTokens += usage.inputTokens ?? 0;
      existing.outputTokens += usage.outputTokens ?? 0;
      existing.cacheReadTokens += usage.cacheReadTokens ?? 0;
      existing.costUsd += usage.costUsd ?? 0;
      existing.participations += 1;
      dayBucket.set(agentId, existing);
    }

    // Count this record as one invocation (regardless of how many agents participated)
    if (contributed) {
      dayInvocations.set(date, (dayInvocations.get(date) ?? 0) + 1);
    }
  }

  // Build sorted daily entries (newest first)
  const dates = [...agentBuckets.keys()].sort((a, b) => b.localeCompare(a));
  const grandTotal = emptyTotals();
  const daily: DailyUsageEntry[] = [];

  for (const date of dates) {
    const dayBucket = agentBuckets.get(date)!;
    const agents: Record<string, AgentDailyUsage> = {};
    const dayTotal = emptyTotals();
    dayTotal.invocations = dayInvocations.get(date) ?? 0;

    for (const [agentId, usage] of dayBucket) {
      agents[agentId] = roundCostCat(usage);
      dayTotal.inputTokens += usage.inputTokens;
      dayTotal.outputTokens += usage.outputTokens;
      dayTotal.cacheReadTokens += usage.cacheReadTokens;
      dayTotal.costUsd += usage.costUsd;
    }

    grandTotal.inputTokens += dayTotal.inputTokens;
    grandTotal.outputTokens += dayTotal.outputTokens;
    grandTotal.cacheReadTokens += dayTotal.cacheReadTokens;
    grandTotal.costUsd += dayTotal.costUsd;
    grandTotal.invocations += dayTotal.invocations;

    daily.push({ date, agents, total: roundCostTotals(dayTotal) });
  }

  return { period: { from, to }, daily, grandTotal: roundCostTotals(grandTotal) };
}
