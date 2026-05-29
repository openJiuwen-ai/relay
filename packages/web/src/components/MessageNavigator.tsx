/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AgentData, formatAgentName, useAgentData } from '@/hooks/useAgentData';
import { useCoCreatorConfig } from '@/hooks/useCoCreatorConfig';
import type { ChatMessage as ChatMessageData } from '@/stores/chatStore';
import { scrollToMessage } from '@/utils/scrollToMessage';

/** Maximum dots rendered on the track — prevents clutter in long conversations */
const MAX_DOTS = 18;

type AgentLookup = (id: string) => AgentData | undefined;

// Some variants use non-hyphen agentIds (e.g. gpt52/sonnet/spark/gemini25 in office-claw-config.json).
// During the brief pre-/api/agents state, we only have 3 base agents in fallback OFFICE_CLAW_CONFIGS,
// so we map these variant ids to a base agent for color/name consistency.
const VARIANT_BASE_FALLBACK: Record<string, string> = {
  gpt52: 'codex',
  spark: 'codex',
  sonnet: 'opus',
  gemini25: 'gemini',
  'dare-agent': 'dare',
};

const FALLBACK_AGENT_META: Record<string, { label: string; color: string }> = {
  opus: { label: '通用智能体', color: '#9B7EBD' },
  codex: { label: '办公智能体', color: '#5B8C5A' },
  gemini: { label: '协作智能体', color: '#5B9BD5' },
  dare: { label: '通用智能体', color: '#D4A76A' },
};

function resolveFallbackAgentMeta(agentId: string): { baseId: string; label: string; color: string } | undefined {
  const normalizedId = agentId.toLowerCase();
  const direct = FALLBACK_AGENT_META[normalizedId];
  if (direct) return { baseId: normalizedId, ...direct };

  const base = normalizedId.split('-')[0];
  if (base && base !== normalizedId && FALLBACK_AGENT_META[base]) {
    return { baseId: base, ...FALLBACK_AGENT_META[base] };
  }

  const mappedBase = VARIANT_BASE_FALLBACK[normalizedId];
  if (mappedBase && FALLBACK_AGENT_META[mappedBase]) {
    return { baseId: mappedBase, ...FALLBACK_AGENT_META[mappedBase] };
  }

  return undefined;
}

function resolveAgentById(getAgentById: AgentLookup, agentId: string): AgentData | undefined {
  const normalizedId = agentId.toLowerCase();
  const direct = getAgentById(normalizedId);
  if (direct) return direct;
  // F32-b P4: tolerate multi-variant ids (e.g. opus-45) even before /api/agents loads
  const base = normalizedId.split('-')[0];
  if (base && base !== normalizedId) return getAgentById(base);
  const mappedBase = VARIANT_BASE_FALLBACK[normalizedId];
  if (mappedBase) return getAgentById(mappedBase);
  return undefined;
}

function getSenderLabel(
  msg: ChatMessageData,
  resolveAgent: (agentId: string) => AgentData | undefined,
  ownerName: string,
): string {
  const agentId = msg.agentId;
  const isOwner = msg.type === 'user' && !agentId;
  if (isOwner) return ownerName;

  const isAssistant = msg.type === 'assistant' || (msg.type === 'user' && !!agentId);
  if (!isAssistant) return '系统';
  if (!agentId) return '系统';
  const rowAgent = resolveAgent(agentId);
  if (!rowAgent) {
    const fallback = resolveFallbackAgentMeta(agentId);
    if (!fallback) return agentId;
    return fallback.baseId === agentId.toLowerCase() ? fallback.label : `${fallback.label}（${agentId}）`;
  }
  const baseName = formatAgentName(rowAgent);
  return rowAgent.id === agentId ? baseName : `${rowAgent.displayName}（${agentId}）`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function truncateContent(content: string, maxLen: number): string {
  return content.length <= maxLen ? content : `${content.slice(0, maxLen)}…`;
}

interface MessageNavigatorProps {
  messages: ChatMessageData[];
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

export function MessageNavigator({ messages, scrollContainerRef }: MessageNavigatorProps) {
  const { getAgentById } = useAgentData();
  const coCreator = useCoCreatorConfig();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 1 });
  const trackRef = useRef<HTMLDivElement>(null);

  const resolveAgent = useCallback((agentId: string) => resolveAgentById(getAgentById, agentId), [getAgentById]);

  const getSenderName = useCallback(
    (msg: ChatMessageData) => getSenderLabel(msg, resolveAgent, coCreator.name),
    [coCreator.name, resolveAgent],
  );

  // Filter to user + assistant only
  const navItems = useMemo(() => messages.filter((m) => m.type === 'user' || m.type === 'assistant'), [messages]);

  // Sample at fixed intervals when too many messages
  const sampledItems = useMemo(() => {
    if (navItems.length <= MAX_DOTS) {
      return navItems.map((msg, i) => ({ msg, sourceIdx: i }));
    }
    const step = (navItems.length - 1) / (MAX_DOTS - 1);
    return Array.from({ length: MAX_DOTS }, (_, i) => {
      const idx = Math.round(i * step);
      return { msg: navItems[idx], sourceIdx: idx };
    });
  }, [navItems]);

  // Sync viewport indicator with scroll position
  const updateViewport = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) {
      setViewport({ top: 0, height: 1 });
      return;
    }
    setViewport({
      top: scrollTop / scrollHeight,
      height: clientHeight / scrollHeight,
    });
  }, [scrollContainerRef]);

  // Re-bind on navItems change so ref.current is re-read if container remounts (P3 fix)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    updateViewport();
    el.addEventListener('scroll', updateViewport, { passive: true });
    return () => el.removeEventListener('scroll', updateViewport);
  }, [scrollContainerRef, updateViewport]);

  // Click on track background → scroll proportionally
  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      const container = scrollContainerRef.current;
      if (!track || !container) return;
      // Ignore clicks on dots — closest() handles future child elements too (P3 fix)
      if ((e.target as HTMLElement).closest('button')) return;
      const rect = track.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      container.scrollTo({
        top: ratio * (container.scrollHeight - container.clientHeight),
        behavior: 'smooth',
      });
    },
    [scrollContainerRef],
  );

  if (navItems.length < 3) return null;

  return (
    <div className="absolute right-0.5 top-2 bottom-2 w-5 z-10">
      <div ref={trackRef} className="relative h-full cursor-pointer" onClick={handleTrackClick}>
        {/* Track rail */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-200 -translate-x-1/2" />

        {/* Viewport indicator (scrollbar thumb) — P2 fix: clamp to prevent overflow */}
        {(() => {
          const thumbH = Math.max(viewport.height * 100, 5);
          const thumbTop = Math.min(viewport.top * 100, 100 - thumbH);
          return (
            <div
              className="absolute left-1/2 -translate-x-1/2 w-2.5 rounded-full bg-gray-300/50 transition-all duration-100 pointer-events-none"
              style={{ top: `${thumbTop}%`, height: `${thumbH}%` }}
            />
          );
        })()}

        {/* Sampled dots */}
        {sampledItems.map(({ msg, sourceIdx }, idx) => {
          const top = sampledItems.length <= 1 ? 50 : (idx / (sampledItems.length - 1)) * 100;
          const isOwner = msg.type === 'user' && !msg.agentId;
          const isAssistant = msg.type === 'assistant' || (msg.type === 'user' && !!msg.agentId);
          const rowAgent = isAssistant && msg.agentId ? resolveAgent(msg.agentId) : undefined;
          const fallback = isAssistant && msg.agentId ? resolveFallbackAgentMeta(msg.agentId) : undefined;
          const className = isOwner ? 'bg-cocreator-primary' : rowAgent || fallback ? '' : 'bg-gray-400';
          const style = isOwner
            ? undefined
            : rowAgent
              ? { backgroundColor: rowAgent.color.primary }
              : fallback
                ? { backgroundColor: fallback.color }
                : undefined;

          return (
            <button
              key={`${msg.id}-${sourceIdx}`}
              className={`absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-150 hover:scale-[2] ${className}`}
              style={{ top: `${top}%`, left: '50%', ...(style ?? {}) }}
              onClick={() => scrollToMessage(msg.id)}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              aria-label={`跳转到 ${getSenderName(msg)} 的消息`}
            />
          );
        })}

        {/* Tooltip */}
        {hoveredIdx !== null && sampledItems[hoveredIdx] && (
          <NavTooltip
            message={sampledItems[hoveredIdx].msg}
            topPercent={sampledItems.length <= 1 ? 50 : (hoveredIdx / (sampledItems.length - 1)) * 100}
            ownerName={coCreator.name}
          />
        )}
      </div>
    </div>
  );
}

function NavTooltip({
  message,
  topPercent,
  ownerName,
}: {
  message: ChatMessageData;
  topPercent: number;
  ownerName: string;
}) {
  const { getAgentById } = useAgentData();
  const resolveAgent = useCallback((agentId: string) => resolveAgentById(getAgentById, agentId), [getAgentById]);

  const senderName = useMemo(() => {
    return getSenderLabel(message, resolveAgent, ownerName);
  }, [message, ownerName, resolveAgent]);

  return (
    <div
      className="absolute right-full mr-2 -translate-y-1/2 bg-gray-900/90 text-white text-xs rounded-lg px-2.5 py-1.5 max-w-[200px] pointer-events-none whitespace-nowrap z-50"
      style={{ top: `${topPercent}%` }}
    >
      <div className="font-medium">
        {senderName} · {formatTime(message.timestamp)}
      </div>
      <div className="text-gray-300 truncate mt-0.5">{truncateContent(message.content, 40)}</div>
    </div>
  );
}
