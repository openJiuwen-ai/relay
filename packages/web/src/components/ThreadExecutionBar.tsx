/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatAgentName, useAgentData } from '@/hooks/useAgentData';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

/** F122B AC-B8+B9: Per-agent execution status bar with stop controls.
 *  B8/B9 polish: names use formatAgentName() — "品种（variant）" format, colors from agent roster. */
export function ThreadExecutionBar() {
  const activeInvocations = useChatStore((s) => s.activeInvocations);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const { getAgentById } = useAgentData();
  const [, setTick] = useState(0);

  // Extract unique active agents from invocations
  const activeAgentSlots = Object.values(activeInvocations ?? {}).reduce(
    (acc, inv) => {
      if (!acc.some((c) => c.agentId === inv.agentId)) {
        acc.push({ agentId: inv.agentId, startedAt: inv.startedAt ?? Date.now() });
      }
      return acc;
    },
    [] as Array<{ agentId: string; startedAt: number }>,
  );

  // Build display info from roster (dynamic, not hardcoded)
  const agentDisplayById = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    for (const { agentId } of activeAgentSlots) {
      const rowAgent = getAgentById(agentId);
      if (rowAgent) {
        map.set(agentId, {
          label: formatAgentName(rowAgent),
          color: rowAgent.color.primary,
        });
      } else {
        map.set(agentId, { label: agentId, color: '#9B7EBD' });
      }
    }
    return map;
  }, [activeAgentSlots, getAgentById]);

  // Auto-update elapsed time every second when agents are active
  useEffect(() => {
    if (activeAgentSlots.length === 0) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeAgentSlots.length]);

  const cancelRunningAgent = useCallback(
    async (agentId: string) => {
      if (!currentThreadId) return;
      await apiFetch(`/api/threads/${currentThreadId}/cancel/${agentId}`, { method: 'POST' });
    },
    [currentThreadId],
  );

  const handleStopAll = useCallback(async () => {
    if (!currentThreadId) return;
    await Promise.all(activeAgentSlots.map(({ agentId }) => cancelRunningAgent(agentId)));
  }, [currentThreadId, activeAgentSlots, cancelRunningAgent]);

  if (activeAgentSlots.length === 0) return null;

  return (
    <div className="chat-layout-rail hidden items-center gap-2 border-b border-[#9B7EBD]/10 py-1.5 text-xs">
      <span className="text-gray-400 font-medium shrink-0">执行中</span>
      {activeAgentSlots.map(({ agentId, startedAt }) => {
        const info = agentDisplayById.get(agentId) ?? { label: agentId, color: '#9B7EBD' };
        return (
          <AgentStreamStatusChip
            key={agentId}
            agentId={agentId}
            label={info.label}
            color={info.color}
            startedAt={startedAt}
            onStop={cancelRunningAgent}
          />
        );
      })}
      {activeAgentSlots.length > 1 && (
        <button
          type="button"
          onClick={handleStopAll}
          className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors shrink-0"
        >
          全部停止
        </button>
      )}
    </div>
  );
}

function AgentStreamStatusChip({
  agentId,
  label,
  color,
  startedAt,
  onStop,
}: {
  agentId: string;
  label: string;
  color: string;
  startedAt: number;
  onStop: (agentId: string) => void;
}) {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/50">
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }} />
      <span className="text-gray-600 font-medium">{label}</span>
      <span className="text-gray-400 tabular-nums">{timeStr}</span>
      <button
        type="button"
        onClick={() => onStop(agentId)}
        className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
        aria-label={`Stop ${agentId}`}
      >
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </span>
  );
}
