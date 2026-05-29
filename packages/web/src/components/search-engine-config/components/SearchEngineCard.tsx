/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { MaskIcon } from '@/components/shared/MaskIcon';
import type { SearchEngine } from '../search-engine-config.types';

interface SearchEngineCardProps {
  engine: SearchEngine;
  hasValue: boolean;
  onClick?: () => void;
}

export function SearchEngineCard({ engine, hasValue, onClick }: SearchEngineCardProps) {
  return (
    <div
      className="flex w-full items-center justify-between rounded-xl bg-[var(--modal-surface)]"
      style={{ height: '76px', padding: '16px', border: '1px solid rgba(230, 230, 230, 1)' }}
    >
      <div className="flex flex-col justify-center w-[calc(100%-80px)]">
        <div className="flex items-center">
          <span className="text-[14px] font-medium" style={{ color: 'rgba(25, 25, 25, 1)' }}>
            {engine.name}
          </span>
          <span
            className="ml-1 inline-flex h-[18px] items-center rounded-[2px] px-1.5 text-[12px]"
            style={{
              backgroundColor: hasValue ? 'rgba(213, 242, 220, 1)' : 'rgba(245, 245, 245, 1)',
              color: hasValue ? 'rgba(2, 153, 49, 1)' : 'rgba(25, 25, 25, 1)',
            }}
          >
            {hasValue ? '已配置' : '未配置'}
          </span>
        </div>
        <span
          className="mt-[6px] truncate text-[12px]"
          style={{ color: 'rgba(128, 128, 128, 1)' }}
          title={engine.description}
        >
          {engine.description}
        </span>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1 rounded-md p-1 text-[12px] hover:bg-[var(--surface-hover-muted)] transition-colors"
        style={{ color: 'rgba(25, 25, 25, 1)' }}
      >
        {hasValue ? '修改' : '立即配置'}
        <MaskIcon name="chevronRight" className="h-4 w-4" />
      </button>
    </div>
  );
}