/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import type { ReactElement } from 'react';
import { OverflowTooltip } from '../../shared/OverflowTooltip';
import { SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON } from '../utils';

interface ScheduledTaskUnsupportedEditTooltipProps {
  children: ReactElement;
  reason?: string | null;
  onGoEdit: () => void;
  className?: string;
  buttonTestId?: string;
}

export function ScheduledTaskUnsupportedEditTooltip({
  children,
  reason,
  onGoEdit,
  className,
  buttonTestId,
}: ScheduledTaskUnsupportedEditTooltipProps) {
  const content = reason ?? SCHEDULE_TASK_EDIT_UNSUPPORTED_REASON;

  return (
    <OverflowTooltip
      content={content}
      forceShow
      className={className}
      customContent={
        <div className="w-[260px]" data-schedule-unsupported-edit-tooltip="1">
          <p className="text-xs leading-5 text-[var(--tooltip-text)]">{content}</p>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onGoEdit();
              }}
              className="ui-button-primary !h-7 !min-w-[72px] !px-4 !py-1 text-xs font-normal"
              data-testid={buttonTestId}
            >
              去编辑
            </button>
          </div>
        </div>
      }
    >
      {children}
    </OverflowTooltip>
  );
}
