/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { formatAgentName, useAgentData } from '@/hooks/useAgentData';
import { hexToRgba } from '@/lib/color-utils';

interface AgentSelectorProps {
  selectedAgentIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

/**
 * F32-b Phase 3: Breed-grouped agent chip selector.
 * Used in thread creation (DirectoryPickerModal) and thread settings.
 */
export function AgentSelector({ selectedAgentIds, onSelectionChange }: AgentSelectorProps) {
  const { getAgentsByBreed } = useAgentData();
  const groups = getAgentsByBreed();

  const toggleAgent = (agentId: string) => {
    if (selectedAgentIds.includes(agentId)) {
      onSelectionChange(selectedAgentIds.filter((id) => id !== agentId));
    } else {
      onSelectionChange([...selectedAgentIds, agentId]);
    }
  };

  // Provider display name mapping
  const providerLabel = (provider: string) => {
    const map: Record<string, string> = {
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
    };
    return map[provider] ?? provider;
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 font-medium">默认智能体 (可选)</div>
      {[...groups.entries()].map(([breedId, breedAgents]) => {
        const breedName = breedAgents[0].breedDisplayName ?? breedAgents[0].displayName;
        return (
          <div key={breedId}>
            <div className="text-[10px] text-gray-400 mb-1">
              {breedName}家族 · {providerLabel(breedAgents[0].provider)}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {breedAgents.map((agent) => {
                const isSelected = selectedAgentIds.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors border ${
                      isSelected ? 'font-medium border-current' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}
                    style={
                      isSelected
                        ? {
                            color: agent.color.primary,
                            backgroundColor: hexToRgba(agent.color.primary, 0.1),
                            borderColor: agent.color.primary,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: agent.color.primary }}
                    />
                    {formatAgentName(agent)}
                    {!agent.variantLabel && agent.nickname ? `(${agent.nickname})` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
