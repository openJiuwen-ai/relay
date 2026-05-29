/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { Button } from './Button';

type NoSearchResultsStateProps = {
  onClear?: () => void;
  className?: string;
  title?: string;
  description?: string;
  clearLabel?: string;
};

export function NoSearchResultsState({
  onClear,
  className = '',
  title = '暂未匹配到数据',
  description = '没有匹配到符合条件的数据',
  clearLabel = '清空筛选器',
}: NoSearchResultsStateProps) {
  return (
    <div
      className={`flex flex-col items-center text-center ${className}`.trim()}
      data-testid="no-search-results-state"
    >
      <img
        src="/images/no-search-results.svg"
        alt=""
        aria-hidden="true"
        data-testid="no-search-results-image"
        className="mb-[18px] h-[60px] w-[60px] shrink-0"
      />
      <div className="flex flex-col items-center gap-1" data-testid="no-search-results-copy">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-muted)]">{description}</p>
      </div>
      <Button variant="default"
        onClick={onClear}
        className="mt-4 h-8 px-4 text-xs"
        data-testid="no-search-results-clear"
      >
        {clearLabel}
      </Button>
    </div>
  );
}
