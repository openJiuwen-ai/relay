/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentRef } from '../types';
import { getDisplayInitial } from '../utils/nameInitial';

function isImageAvatar(avatar: string): boolean {
  return /^(https?:\/\/|\/|data:image)/.test(avatar);
}

interface AgentCardProps {
  agent: AgentRef;
}

export function AgentCard({ agent }: AgentCardProps) {
  const avatarSrc = agent.icon?.startsWith('/uploads/')
    ? `/api${agent.icon}`
    : agent.icon;
  const hasImageAvatar = avatarSrc && isImageAvatar(avatarSrc);

  return (
    <div
      data-testid={`inspiration-agent-card-${agent.id}`}
      className="flex w-full min-w-0 items-center gap-3 rounded-[8px] px-4 py-3"
      style={{ backgroundColor: '#fafafa' }}
    >
      <div
        data-testid={`inspiration-agent-card-${agent.id}-icon`}
        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-card-muted)]"
      >
        {hasImageAvatar ? (
          <img
            src={avatarSrc}
            alt={agent.name}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="text-sm font-semibold text-[var(--text-label-secondary)]">
            {getDisplayInitial(agent.name)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--text-primary)]" title={agent.name}>
          {agent.name}
        </div>
        <div className="truncate text-xs text-[var(--text-secondary)]" title={agent.id}>
          {agent.id}
        </div>
      </div>
    </div>
  );
}

interface AgentCardListProps {
  agents: AgentRef[];
}

export function AgentCardList({ agents }: AgentCardListProps) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <div data-testid="inspiration-agent-card-list" className="flex flex-col gap-2">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
