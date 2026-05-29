/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useRef, useState } from 'react';
import { bubbleExpandStorageKey } from '@/lib/chat-bubble-expand-prefs';
import type { CliEvent, CliStatus } from '@/stores/chat-types';
import { ChevronIcon } from './CliOutputBasicIcons';
import { CliOutputToolRow } from './CliOutputToolRow';
import { findMatchingResult } from './cli-output-block-helpers';

export function CliOutputToolsSection({
  toolUses,
  toolResults,
  extraToolResults,
  lastToolId,
  status,
  toolRowPersistScope,
  onUserInteract,
  accent,
}: {
  toolUses: CliEvent[];
  toolResults: CliEvent[];
  /** tool_result rows from other task segments (paired by toolCallId when local segment missed) */
  extraToolResults?: CliEvent[];
  lastToolId: string | undefined;
  status: CliStatus;
  toolRowPersistScope?: { threadId: string; messageId: string };
  onUserInteract: () => void;
  accent: string;
}) {
  const [toolsExpanded, setToolsExpanded] = useState(true);
  const toolsUserInteracted = useRef(false);

  const toolSummary = `${toolUses.length} tool${toolUses.length > 1 ? 's' : ''}`;

  return (
    <div className="pt-1 pb-1">
      <button
        type="button"
        data-testid="tools-section-toggle"
        className="w-full hidden items-center gap-1.5 py-1.5 text-[12px] rounded transition-colors"
        style={{ color: '#94A3B8' }}
        onClick={() => {
          toolsUserInteracted.current = true;
          setToolsExpanded((v) => !v);
          onUserInteract();
        }}
      >
        <span>{toolsExpanded ? toolSummary : `${toolSummary} (collapsed)`}</span>
        <ChevronIcon expanded={toolsExpanded} />
      </button>
      {toolsExpanded && (
        <div className="space-y-0.5">
          {toolUses.map((e, i) => {
            const result = findMatchingResult(e, toolResults, i, extraToolResults);
            return (
              <CliOutputToolRow
                key={e.id}
                event={e}
                resultDetail={result?.detail}
                isActive={e.id === lastToolId}
                status={status}
                hasResultMatch={result != null}
                persistExpandKey={
                  toolRowPersistScope
                    ? bubbleExpandStorageKey(toolRowPersistScope.threadId, toolRowPersistScope.messageId, `tool:${e.id}`)
                    : undefined
                }
                onUserInteract={onUserInteract}
                accent={accent}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
