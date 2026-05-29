/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { Expert, EXPERT_CATEGORY_LABELS } from '../types/expert';

interface ExpertCardProps {
  expert: Expert;
  onInvoke: (expertId: string) => void;
  onAdd: (expert: Expert) => void;
}

export function ExpertCard({ expert, onInvoke, onAdd }: ExpertCardProps) {
  return (
    <article
      className="ui-card ui-card-hover group relative flex h-[196px] cursor-pointer flex-col rounded-[16px] border border-[#e6e6e6] bg-white p-6"
      onClick={() => onInvoke(expert.expertId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onInvoke(expert.expertId);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`召唤智能体 ${expert.displayName}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
          <img src={expert.avatar} alt={expert.displayName} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{expert.displayName}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span
              className="inline-flex h-[18px] items-center rounded px-[6px] text-[11px] leading-[18px] font-medium"
              style={{ backgroundColor: '#E6E6E6', color: 'rgba(25, 25, 25, 0.85)' }}
            >
              {EXPERT_CATEGORY_LABELS[expert.category]}
            </span>
          </div>
        </div>
      </div>

      {expert.roleDescription ? (
        <p className="line-clamp-2 mb-4 flex-1 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {expert.roleDescription}
        </p>
      ) : (
        <p className="line-clamp-2 mb-4 flex-1 text-[12px] leading-relaxed text-[var(--text-muted)]">暂无描述</p>
      )}

      <div
        className={`absolute bottom-6 left-6 right-6 flex items-center gap-4 transition-opacity opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInvoke(expert.expertId);
          }}
          className="bg-transparent p-0 text-[14px] font-normal text-[var(--text-accent)] hover:underline"
        >
          立即召唤
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd(expert);
          }}
          className="bg-transparent p-0 text-[14px] font-normal text-[var(--text-accent)] hover:underline"
        >
          添加
        </button>
      </div>
    </article>
  );
}