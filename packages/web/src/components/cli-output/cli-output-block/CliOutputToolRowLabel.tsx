/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { LoadingSmall } from '@/components/LoadingSmall';
import type { CliEvent } from '@/stores/chat-types';
import { ChevronIcon, IconTool } from './CliOutputBasicIcons';

export function CliOutputToolRowLabel({
  event,
  rowExpanded,
  hasDetail,
  showLoading,
  showError,
  showStopped,
  accentLight,
  isActive,
  onToggleExpand,
}: {
  event: CliEvent;
  rowExpanded: boolean;
  hasDetail: boolean;
  showLoading: boolean;
  showError: boolean;
  showStopped: boolean;
  accentLight: string;
  isActive: boolean;
  onToggleExpand: () => void;
}) {
  return (
    <button type="button" className="w-full text-left cursor-pointer flex" onClick={onToggleExpand}>
      <div className="flex items-center gap-2 mr-2">
        {showLoading ? (
          <LoadingSmall className="w-4 h-4 flex-shrink-0" />
        ) : <IconTool />}
        <span className="truncate" style={{ color: isActive ? 'rgb(89, 89, 89)' : 'rgb(89, 89, 89)' }}>
          <span className="font-[14px]">{event.label?.split(' ')[0]}</span>
          {event.label?.includes(' ') && (
            <span
              style={{ color: isActive ? accentLight : '#64748B', display: 'none' }}
            >{` ${event.label.split(' ').slice(1).join(' ')}`}</span>
          )}
        </span>
      </div>
      {showError && <span className="text-[12px] px-1 mr-2 rounded-[2px] bg-[rgb(252,227,224)] text-[rgb(242,48,48)]">
          调用异常
        </span>}
      {showStopped && <span className="text-[12px] mr-2 text-[#94A3B8]">已停止</span>}
      {hasDetail && <ChevronIcon expanded={rowExpanded} />}
    </button>
  );
}

