/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentRef } from '../types';

interface InspirationAgentTagsProps {
  agents: AgentRef[];
}

export function InspirationAgentTags({ agents }: InspirationAgentTagsProps) {
  if (agents.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {agents.map((agent) => (
        <span
          key={agent.id}
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]"
        >
          {agent.icon && (
            <img src={agent.icon} alt="" className="w-3 h-3 mr-1" onError={(e) => {
              e.currentTarget.style.display = 'none';
            }} />
          )}
          {agent.name}
        </span>
      ))}
    </div>
  );
}
