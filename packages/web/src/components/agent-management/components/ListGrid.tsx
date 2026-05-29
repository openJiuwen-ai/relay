/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { AgentData } from '@/hooks/useAgentData';
import { EmptyDataState } from '@/components/shared/EmptyDataState';
import { NoSearchResultsState } from '@/components/shared/NoSearchResultsState';
import { Card } from './Card';
import { AGENT_LIST_GRID_CLASS } from '../constants';
import type { AgentSourceFilter } from '../utils';

export interface ListGridProps {
  agents: AgentData[];
  onSelectAgent: (agentId: string) => void;
  onEditAgent?: (agentId: string) => void;
  onDeleteAgent?: (agentId: string) => void;
  searchQuery?: string;
  sourceFilter?: AgentSourceFilter;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
}

export function ListGrid({
  agents,
  onSelectAgent,
  onEditAgent,
  onDeleteAgent,
  searchQuery = '',
  sourceFilter = 'all',
  onClearSearch,
  onClearFilter,
}: ListGridProps) {
  if (agents.length === 0) {
    if (searchQuery.trim() || sourceFilter !== 'all') {
      return (
        <div className="flex h-64 items-center justify-center">
          <NoSearchResultsState
            onClear={() => {
              onClearSearch?.();
              onClearFilter?.();
            }}
          />
        </div>
      );
    }
    return (
      <div className="flex h-64 items-center justify-center">
        <EmptyDataState title="暂无智能体" />
      </div>
    );
  }

  return (
    <div className={AGENT_LIST_GRID_CLASS}>
      {agents.map((agent) => (
        <Card
          key={agent.id}
          agent={agent}
          onClick={onSelectAgent}
          onEdit={onEditAgent}
          onDelete={onDeleteAgent}
        />
      ))}
    </div>
  );
}