/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRef, useState } from 'react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { readBubbleExpandPref, writeBubbleExpandPref } from '@/lib/chat-bubble-expand-prefs';
import type { CliEvent, CliStatus } from '@/stores/chat-types';
import { CliOutputToolRowLabel } from './CliOutputToolRowLabel';
import { lighten, toolRowOutcomeFlags } from './cli-output-block-helpers';

export function CliOutputToolRow({
  event,
  resultDetail,
  isActive,
  status,
  hasResultMatch,
  persistExpandKey,
  onUserInteract,
  accent,
}: {
  event: CliEvent;
  resultDetail?: string;
  isActive: boolean;
  status: CliStatus;
  /** F142: Whether a matching tool_result was found for this tool_use */
  hasResultMatch?: boolean;
  persistExpandKey?: string;
  onUserInteract?: () => void;
  accent: string;
}) {
  const persisted = persistExpandKey ? readBubbleExpandPref(persistExpandKey) : undefined;
  const [rowExpanded, setRowExpanded] = useState(() => persisted ?? false);
  const userTouchedRef = useRef(persisted !== undefined);
  const detailToRender =
    resultDetail != null && resultDetail.trim().length > 0 ? resultDetail : event.detail?.trim() ? event.detail : undefined;
  const hasDetail = detailToRender != null && detailToRender.length > 0;
  const { shouldRenderMarkdown, showLoading, showError, showStopped } = toolRowOutcomeFlags(
    status,
    event,
    resultDetail,
    hasResultMatch,
  );
  const accentLight = lighten(accent, 0.6);

  return (
    <div
      data-testid={`tool-row-${event.id}`}
      className="w-full text-left rounded text-[11px] flex flex-col gap-2"
      style={{ padding: '4px 0', borderRadius: 4 }}
    >
      <CliOutputToolRowLabel
        event={event}
        rowExpanded={rowExpanded}
        hasDetail={hasDetail}
        showLoading={showLoading}
        showError={showError}
        showStopped={showStopped}
        accentLight={accentLight}
        isActive={isActive}
        onToggleExpand={() => {
          userTouchedRef.current = true;
          setRowExpanded((v) => {
            const next = !v;
            if (persistExpandKey) {
              writeBubbleExpandPref(persistExpandKey, next);
            }
            return next;
          });
          onUserInteract?.();
        }}
      />
      {rowExpanded && hasDetail && detailToRender && (
        <div
          className={`w-[calc(100%-24px)] mt-1 break-words [overflow-wrap:anywhere] text-[12px] rounded-lg bg-[rgb(248_248_248)] p-[12px]${
            shouldRenderMarkdown ? '' : ' whitespace-pre-wrap'
          }`}
          style={{ color: '#64748B' }}
        >
          {shouldRenderMarkdown ? <MarkdownContent content={detailToRender} disableCommandPrefix /> : detailToRender}
        </div>
      )}
    </div>
  );
}
