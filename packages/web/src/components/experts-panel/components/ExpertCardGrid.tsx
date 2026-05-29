/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { Expert } from '../types/expert';
import { ExpertCard } from './ExpertCard';
import { EmptyDataState } from '@/components/shared/EmptyDataState';
import { NoSearchResultsState } from '@/components/shared/NoSearchResultsState';

interface ExpertCardGridProps {
  experts: Expert[];
  onInvoke: (expertId: string) => void;
  onAdd: (expert: Expert) => void;
  searchQuery?: string;
  onClearSearch?: () => void;
}

export function ExpertCardGrid({ experts, onInvoke, onAdd, searchQuery = '', onClearSearch }: ExpertCardGridProps) {
  if (experts.length === 0) {
    if (searchQuery.trim()) {
      return (
        <div className="flex items-center justify-center h-full">
          <NoSearchResultsState onClear={onClearSearch} />
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyDataState title="暂无相关专家" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {experts.map((expert) => (
        <div key={expert.expertId} className="w-full">
          <ExpertCard
            expert={expert}
            onInvoke={onInvoke}
            onAdd={onAdd}
          />
        </div>
      ))}
    </div>
  );
}