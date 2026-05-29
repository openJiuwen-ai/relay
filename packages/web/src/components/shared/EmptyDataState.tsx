/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

const DEFAULT_EMPTY_TITLE = '暂无数据';

export function EmptyDataState({ title = DEFAULT_EMPTY_TITLE }: { title?: string }) {
  return (
    <div className="flex flex-col items-center text-center" data-testid="empty-data-state">
      <img
        src="/images/no-data.svg"
        alt=""
        aria-hidden="true"
        data-testid="empty-data-image"
        className="mb-[18px] h-[60px] w-[60px] shrink-0"
      />
      <p className="text-sm font-medium text-[var(--text-primary)]" data-testid="empty-data-title">
        {title}
      </p>
    </div>
  );
}
