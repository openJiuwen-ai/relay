/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { ExpertCategory, EXPERT_CATEGORIES } from '../types/expert';

interface ExpertFilterTabsProps {
  activeCategory: ExpertCategory;
  onCategoryChange: (category: ExpertCategory) => void;
}

export function ExpertFilterTabs({ activeCategory, onCategoryChange }: ExpertFilterTabsProps) {
  return (
    <div className="flex items-center gap-5 h-[52px] px-5">
      {EXPERT_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onCategoryChange(cat.id)}
          className={`ui-tab-trigger ${activeCategory === cat.id ? 'ui-tab-trigger-active' : ''}`}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}
