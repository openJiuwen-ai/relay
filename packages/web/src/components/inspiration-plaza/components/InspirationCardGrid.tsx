/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { InspirationTemplateListItem } from '../types';
import { InspirationCard } from './InspirationCard';

const CARD_GRID_CLASS = [
  'grid gap-4 justify-items-center',
  'grid-cols-[repeat(auto-fit,minmax(237px,1fr))]',
  'min-[1280px]:grid-cols-[repeat(3,minmax(237px,1fr))]',
  'min-[1440px]:grid-cols-[repeat(4,minmax(237px,1fr))]',
  'min-[1600px]:grid-cols-[repeat(5,minmax(237px,1fr))]',
].join(' ');

interface InspirationCardGridProps {
  templates: InspirationTemplateListItem[];
  isLoading: boolean;
  onCardClick: (template: InspirationTemplateListItem) => void;
}

export function InspirationCardGrid({ templates, isLoading, onCardClick }: InspirationCardGridProps) {
  if (isLoading) {
    return (
      <div className={CARD_GRID_CLASS}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="w-full max-w-[490px] rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-subtle)] animate-pulse"
          >
            <div className="aspect-[16/10] bg-[var(--surface-muted)]" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-[var(--surface-muted)] rounded w-3/4" />
              <div className="h-3 bg-[var(--surface-muted)] rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 mb-4 rounded-full bg-[var(--surface-muted)] flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[var(--text-secondary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">暂无灵感</h3>
        <p className="text-sm text-[var(--text-secondary)]">试试其他分类或搜索关键字</p>
      </div>
    );
  }

  return (
    <div className={CARD_GRID_CLASS}>
      {templates.map((template) => (
        <InspirationCard key={template.id} template={template} onClick={onCardClick} />
      ))}
    </div>
  );
}
