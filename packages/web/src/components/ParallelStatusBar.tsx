/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { formatAgentName, useAgentData } from '@/hooks/useAgentData';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { hexToRgba } from '@/lib/color-utils';
import type { TokenUsage } from '@/stores/chat-types';
import type { AgentInvocationInfo } from '@/stores/chatStore';
import { useChatStore } from '@/stores/chatStore';
import { formatCost, formatDuration, formatTokenCount } from './status-helpers';

function StatusDot({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <span className="inline-block w-2 h-2 rounded-full bg-gray-300 animate-pulse" />;
    case 'streaming':
      return <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />;
    case 'done':
      return <span className="text-green-500 text-xs">&#10003;</span>;
    case 'error':
      return <span className="text-red-500 text-xs">&#10007;</span>;
    case 'alive_but_silent':
      return <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />;
    case 'suspected_stall':
      return <span className="inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse" />;
    default:
      return null;
  }
}

function AgentStreamStatusCard({
  agentId,
  status,
  invocation,
}: {
  agentId: string;
  status: string;
  invocation?: { startedAt?: number; durationMs?: number };
}) {
  const { getAgentById } = useAgentData();
  const rowAgent = getAgentById(agentId);
  const elapsed = useElapsedTime(status === 'streaming' ? invocation?.startedAt : undefined);

  const timeDisplay = (() => {
    if (status === 'done' && invocation?.durationMs != null) {
      return formatDuration(invocation.durationMs);
    }
    if (status === 'streaming' && elapsed > 0) {
      return formatDuration(elapsed);
    }
    return null;
  })();

  const bgColor = rowAgent ? hexToRgba(rowAgent.color.primary, 0.12) : undefined;

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ backgroundColor: bgColor ?? '#f3f4f6' }}
    >
      <StatusDot status={status} />
      <span className="text-xs font-medium" style={{ color: rowAgent?.color.primary ?? '#4b5563' }}>
        {rowAgent ? formatAgentName(rowAgent) : agentId}
      </span>
      {timeDisplay && <span className="text-xs text-gray-500 ml-0.5">{timeDisplay}</span>}
    </div>
  );
}

/** Aggregate token usage across agent invocations, optionally filtered to specific agents */
export function aggregateUsage(
  invocations: Record<string, AgentInvocationInfo>,
  filterAgentIds?: string[],
): TokenUsage | null {
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let count = 0;

  const entries = filterAgentIds ? filterAgentIds.map((id) => invocations[id]).filter(Boolean) : Object.values(invocations);

  for (const inv of entries) {
    const u = inv.usage;
    if (!u) continue;
    count++;
    if (u.inputTokens != null) inputTokens += u.inputTokens;
    if (u.outputTokens != null) outputTokens += u.outputTokens;
    if (u.totalTokens != null && u.inputTokens == null) inputTokens += u.totalTokens;
    if (u.costUsd != null) costUsd += u.costUsd;
  }

  if (count === 0) return null;
  return {
    ...(inputTokens > 0 ? { inputTokens } : {}),
    ...(outputTokens > 0 ? { outputTokens } : {}),
    ...(costUsd > 0 ? { costUsd } : {}),
  };
}

export function ParallelStatusBar({ onStop }: { onStop?: () => void }) {
  const { targetAgents, agentStatuses, agentInvocations } = useChatStore();

  if (targetAgents.length === 0) return null;

  const agg = aggregateUsage(agentInvocations, targetAgents);

  return (
    <div className="hidden px-5 py-2.5 bg-gradient-to-r from-opus-bg via-codex-bg to-gemini-bg border-b border-gray-200">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-gray-600">独立观点采样中</span>
        {targetAgents.map((agentId) => (
          <AgentStreamStatusCard
            key={agentId}
            agentId={agentId}
            status={agentStatuses[agentId] ?? 'pending'}
            invocation={agentInvocations[agentId]}
          />
        ))}
        {onStop && (
          <button
            onClick={() => onStop()}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors text-xs font-medium"
            title="停止所有智能体"
            aria-label="Stop all agents"
            data-testid="parallel-stop-button"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <rect x="4" y="4" width="12" height="12" rx="2" />
            </svg>
            停止
          </button>
        )}
      </div>
      {agg && (
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500" data-testid="parallel-usage-summary">
          {agg.inputTokens != null && (
            <span>
              In: <span className="font-medium text-gray-600">{formatTokenCount(agg.inputTokens)}</span>
            </span>
          )}
          {agg.outputTokens != null && (
            <span>
              Out: <span className="font-medium text-gray-600">{formatTokenCount(agg.outputTokens)}</span>
            </span>
          )}
          {agg.costUsd != null && (
            <span>
              Cost: <span className="font-medium text-amber-600">{formatCost(agg.costUsd)}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
