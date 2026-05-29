/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { CliEvent, CliStatus } from '@/stores/chat-types';
import type { PptStudioSession } from '../../ppt-studio/ppt-studio-types';

/** Lighten a hex color toward white by ratio (0-1) */
export function lighten(hex: string, ratio: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * ratio);
  const lg = Math.round(g + (255 - g) * ratio);
  const lb = Math.round(b + (255 - b) * ratio);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

export const PERMISSION_DENIED_MARKERS = [
  '[PERMISSION_DENIED]',
  '[PERMISSION_REJECTED]',
  '[APPROVAL_REQUIRED]',
  'PERMISSION_DENIED:',
  '[permission denied]',
  'command rejected for safety',
];

export function isPermissionDeniedResult(detail: string | undefined): boolean {
  if (!detail) return false;
  return PERMISSION_DENIED_MARKERS.some((marker) => detail.includes(marker));
}

export function buildSummary(events: CliEvent[], status: CliStatus): string {
  const toolCount = events.filter((e) => e.kind === 'tool_use').length;
  if (status === 'streaming') {
    return '正在执行工具调用';
  }
  if (status === 'interrupted') {
    return '工具调用已停止';
  }
  return `已执行${toolCount}次工具调用`;
}

/** F142: Find matching tool_result for a tool_use by toolCallId.
 *  Falls back to index-based matching when toolCallId is missing. */
export function toolRowOutcomeFlags(
  status: CliStatus,
  event: CliEvent,
  resultDetail: string | undefined,
  hasResultMatch: boolean | undefined,
): {
  shouldRenderMarkdown: boolean;
  showLoading: boolean;
  showError: boolean;
  showCheck: boolean;
  showStopped: boolean;
} {
  const shouldRenderMarkdown = resultDetail != null;
  const isWaitingForResult = status === 'streaming' && event.kind === 'tool_use' && !hasResultMatch;
  /** Only wait-for-result drives loading — do not OR with "last tool in this CliOutputBlock" (isActive): per-task UI
   *  splits tools into multiple blocks, so each block's last tool_use often already has a result but was still marked active. */
  const showLoading = isWaitingForResult;
  const showError =
    Boolean(hasResultMatch) &&
    !showLoading &&
    (isPermissionDeniedResult(resultDetail) ||
      Boolean(
        resultDetail &&
          (resultDetail.startsWith('[ERROR]:') ||
            resultDetail.startsWith('Error:') ||
            resultDetail.startsWith('[PERMISSION_REJECTED]')),
      ));
  const showStopped =
    status === 'interrupted' && event.kind === 'tool_use' && !hasResultMatch && !showError;
  const showCheck = Boolean(hasResultMatch) && !showLoading && !showError && !showStopped;
  return { shouldRenderMarkdown, showLoading, showError, showCheck, showStopped };
}

function pickToolResultByCallId(toolUse: CliEvent, toolResults: CliEvent[]): CliEvent | undefined {
  if (!toolUse.toolCallId) return undefined;
  const matches = toolResults.filter((r) => r.toolCallId === toolUse.toolCallId);
  if (matches.length === 0) return undefined;
  return [...matches].reverse().find((r) => (r.detail ?? '').trim().length > 0) ?? matches[matches.length - 1];
}

/** Match tool_result to tool_use; optional extraToolResults searches other task segments (orphaned results). */
export function findMatchingResult(
  toolUse: CliEvent,
  toolResults: CliEvent[],
  index: number,
  extraToolResults?: CliEvent[],
): CliEvent | undefined {
  if (toolUse.toolCallId) {
    const local = pickToolResultByCallId(toolUse, toolResults);
    if ((local?.detail ?? '').trim().length > 0) return local;
    const remote = extraToolResults ? pickToolResultByCallId(toolUse, extraToolResults) : undefined;
    if ((remote?.detail ?? '').trim().length > 0) return remote;
    return local ?? remote;
  }
  const local = toolResults[index];
  if ((local?.detail ?? '').trim().length > 0) return local;
  const remote = extraToolResults?.[index];
  if ((remote?.detail ?? '').trim().length > 0) return remote;
  return local ?? remote;
}

export function resolvePptSessionStoreKey(sessions: Record<string, PptStudioSession>, markerPagesDir: string): string {
  if (sessions[markerPagesDir]) return markerPagesDir;
  const norm = markerPagesDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const hit = Object.keys(sessions).find((k) => {
    const nk = k.replace(/\\/g, '/').replace(/\/+$/, '');
    return nk.endsWith(norm) || norm.endsWith(nk);
  });
  return hit ?? markerPagesDir;
}
