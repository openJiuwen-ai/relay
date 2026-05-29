/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { AuthorizationCard } from '@/components/AuthorizationCard';
import { MarkdownContent } from '@/components/MarkdownContent';
import type { AuthPendingRequest, RespondScope } from '@/hooks/useAuthorization';
import { bubbleExpandStorageKey } from '@/lib/chat-bubble-expand-prefs';
import type { ChatMessage, CliEvent, CliStatus } from '@/stores/chat-types';
import { CliOutputToggleHeader } from './CliOutputToggleHeader';
import { CliOutputToolsSection } from './CliOutputToolsSection';
import { CliOutputBlockAttachments } from './CliOutputBlockAttachments';
import { buildSummary } from './cli-output-block-helpers';
import { useCliOutputBlockExpansion } from './useCliOutputBlockExpansion';

export interface CliOutputBlockProps {
  events: CliEvent[];
  status: CliStatus;
  message?: ChatMessage;
  /** Thread scope for persisted tool-row expand state */
  threadId?: string;
  /** When set with threadId/messageId, persist each tool row's detail expand/collapse */
  toolRowPersistScope?: { threadId: string; messageId: string };
  suppressedGeneratedFileNames?: string[];
  thinkingMode?: 'debug' | 'play';
  defaultExpanded?: boolean;
  breedColor?: string;
  projectPath?: string | null;
  authorizationRequests?: AuthPendingRequest[];
  onAuthorizationRespond?: (
    requestId: string,
    granted: boolean,
    scope: RespondScope,
    reason?: string,
  ) => void | Promise<void>;
  onOpenSecurityManagement?: () => void;
  /** When true, tool list is always visible and the outer CLI toggle header is hidden (per-task grouped UI) */
  flatToolsDisplay?: boolean;
  /** Persist outer CLI block (tools header) expand/collapse; omit when flatToolsDisplay */
  persistExpandKey?: string;
  /** Cross-segment tool_result pool for task-grouped UI (tool_use/result split across segments) */
  extraToolResults?: CliEvent[];
}

export function CliOutputBlock({
  events,
  status,
  message,
  threadId: threadIdProp,
  toolRowPersistScope,
  suppressedGeneratedFileNames,
  thinkingMode,
  defaultExpanded = false,
  breedColor,
  projectPath,
  authorizationRequests,
  onAuthorizationRespond,
  onOpenSecurityManagement,
  flatToolsDisplay = false,
  persistExpandKey: persistExpandKeyProp,
  extraToolResults,
}: CliOutputBlockProps) {
  const hasPendingAuthorization = (authorizationRequests?.length ?? 0) > 0;
  const persistExpandKey =
    persistExpandKeyProp ??
    (!flatToolsDisplay && threadIdProp && message?.id
      ? bubbleExpandStorageKey(threadIdProp, message.id, 'cli-outer')
      : undefined);
  const { expanded: hookExpanded, userInteracted, handleToggle } = useCliOutputBlockExpansion({
    status,
    defaultExpanded,
    hasPendingAuthorization,
    persistExpandKey,
  });
  const expanded = flatToolsDisplay ? true : hookExpanded;
  const resolvedToolRowScope =
    toolRowPersistScope ??
    (threadIdProp && message?.id ? { threadId: threadIdProp, messageId: message.id } : undefined);

  if (events.length === 0) return null;

  const summary = buildSummary(events, status);
  const toolUses = events.filter((e) => e.kind === 'tool_use');
  const toolResults = events.filter((e) => e.kind === 'tool_result');
  const textEvents = events.filter((e) => e.kind === 'text');
  const lastToolId = status === 'streaming' ? [...events].reverse().find((e) => e.kind === 'tool_use')?.id : undefined;
  const accent = breedColor || '#7C3AED';
  const bodyMarkdown = textEvents.map((e) => e.content).join('\n');
  const showBodyMarkdown = !flatToolsDisplay || bodyMarkdown.trim().length > 0;
  const bodyMarkdownDisplay =
    status === 'interrupted' && bodyMarkdown.trim().length > 0 && !bodyMarkdown.trimEnd().endsWith('(用户停止)')
      ? `${bodyMarkdown.trimEnd()} (用户停止)`
      : bodyMarkdown;

  return (
    <div className="cli-output-container overflow-hidden">
      {toolUses.length > 0 && !flatToolsDisplay && (
        <CliOutputToggleHeader
          summary={summary}
          status={status}
          expanded={expanded}
          thinkingMode={thinkingMode}
          onToggle={handleToggle}
        />
      )}

      {expanded && (
        <div data-testid="cli-output-body">
          {toolUses.length > 0 && (
            <CliOutputToolsSection
              toolUses={toolUses}
              toolResults={toolResults}
              extraToolResults={extraToolResults}
              lastToolId={lastToolId}
              status={status}
              toolRowPersistScope={resolvedToolRowScope}
              onUserInteract={() => {
                userInteracted.current = true;
              }}
              accent={accent}
            />
          )}
          {authorizationRequests && authorizationRequests.length > 0 && onAuthorizationRespond && (
            <div data-testid="cli-output-authorization" className="space-y-3 pt-3">
              {authorizationRequests.map((request) => (
                <AuthorizationCard
                  key={request.requestId}
                  request={request}
                  onRespond={onAuthorizationRespond}
                  onOpenSecurityManagement={onOpenSecurityManagement}
                />
              ))}
            </div>
          )}
          {textEvents.length > 0 && toolUses.length > 0 && (
            <div
              style={{
                padding: '8px 12px 4px 12px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: '#475569',
                display: 'none',
              }}
            >
              ─── stdout ───
            </div>
          )}
        </div>
      )}
      {(toolUses.length > 0 || message?.thinking) && !flatToolsDisplay && (
        <div className="h-0 border-t-[1px] border-[#F0F0F0] my-3" />
      )}
      {flatToolsDisplay && toolUses.length > 0 && bodyMarkdown.trim().length > 0 && (
        <div className="h-0 border-t-[1px] border-[#F0F0F0] my-2" />
      )}
      {showBodyMarkdown ? (
        <div className="cli-output-md pb-2 text-base leading-relaxed" data-testid="cli-output-markdown">
          <div>
            <MarkdownContent content={bodyMarkdownDisplay} />
          </div>
        </div>
      ) : null}
      {!flatToolsDisplay ? (
        <CliOutputBlockAttachments
          events={events}
          status={status}
          suppressedGeneratedFileNames={suppressedGeneratedFileNames}
          projectPath={projectPath}
        />
      ) : null}
    </div>
  );
}
