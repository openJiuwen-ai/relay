/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentAvatar } from '@/components/AgentAvatar';
import {
  CliOutputBlock,
  CliOutputBlockAttachments,
  extractDisplayedLocalGeneratedFiles,
} from '@/components/cli-output/cli-output-block';
import { toCliEvents } from '@/components/cli-output/toCliEvents';
import { MarkdownContent } from '@/components/MarkdownContent';
import { RichBlocks } from '@/components/rich/RichBlocks';
import { type AgentData, getCachedAgents } from '@/hooks/useAgentData';
import type { AuthPendingRequest, RespondScope } from '@/hooks/useAuthorization';
import { useCoCreatorConfig } from '@/hooks/useCoCreatorConfig';
import { useExpertCatalog } from '@/hooks/useExpertCatalog';
import { hexToRgba, tintedLight } from '@/lib/color-utils';
import { getMentionRe, getMentionToAgentId } from '@/lib/mention-highlight';
import { parseDirection } from '@/lib/parse-direction';
import { bubbleExpandStorageKey } from '@/lib/chat-bubble-expand-prefs';
import { buildThinkingExecutionLabel } from '@/lib/thinking-execution-label';
import type { CliStatus } from '@/stores/chat-types';
import { type ChatMessage as ChatMessageType, useChatStore } from '@/stores/chatStore';
import { BREED_STYLES, DEFAULT_BREED_STYLE } from '../utils/breed-styles';
import { formatDualTime, formatTime } from '../utils/message-time';
import { filterDuplicateWorkspaceContentBlocks, filterDuplicateWorkspaceRichBlocks } from '../utils/workspace-dedupe';
import { ConnectorBubble } from './ConnectorBubble';
import { ContentBlocks } from './ContentBlocks';
import { DirectionPill } from './DirectionPill';
import { EvidencePanel } from './EvidencePanel';
import { IntentRecognitionPlaceholder } from './IntentRecognitionPlaceholder';
import { ReplyPill } from './ReplyPill';
import { TaskGroupedStreamBody } from './TaskGroupedStreamBody';
import { ThinkingContent } from './ThinkingContent';
import { TimeoutDiagnosticsPanel } from './TimeoutDiagnosticsPanel';

interface ChatMessageProps {
  message: ChatMessageType;
  /** Thread this bubble belongs to — expand/collapse persistence scope */
  threadId?: string;
  getAgentById: (id: string) => AgentData | undefined;
  suppressedGeneratedFileNames?: string[];
  pendingAuthRequests?: AuthPendingRequest[];
  onAuthRespond?: (requestId: string, granted: boolean, scope: RespondScope, reason?: string) => void | Promise<void>;
  onOpenSecurityManagement?: () => void;
}

function ChatMessageInner({
  message,
  threadId: threadIdProp,
  getAgentById,
  suppressedGeneratedFileNames,
  pendingAuthRequests,
  onAuthRespond,
  onOpenSecurityManagement,
}: ChatMessageProps) {
  const coCreator = useCoCreatorConfig();
  const { getExpertById } = useExpertCatalog();
  const navigate = useNavigate();
  const threads = useChatStore((s) => s.threads);
  const hasActiveInvocation = useChatStore((s) => s.hasActiveInvocation);
  const targetAgents = useChatStore((s) => s.targetAgents);
  const catInvocationId = useChatStore((s) =>
    message.agentId ? s.agentInvocations?.[message.agentId]?.invocationId : undefined,
  );
  const catInvocationInfo = useChatStore((s) => (message.agentId ? s.agentInvocations?.[message.agentId] : undefined));
  const streamInvocationId = message.extra?.stream?.invocationId;
  const activeInvocationStartedAt = useChatStore((s) =>
    streamInvocationId ? s.activeInvocations[streamInvocationId]?.startedAt : undefined,
  );
  const uiThinkingExpandedByDefault = useChatStore((s) => s.uiThinkingExpandedByDefault);
  const isUser = message.type === 'user' && !message.agentId;
  const isSystem = message.type === 'system';
  const isConnector = message.type === 'connector';
  const isStartupReconcilerNotice = isConnector && message.source?.connector === 'startup-reconciler';

  const effectiveAgentId = isStartupReconcilerNotice ? 'assistant' : message.agentId;
  const agentData = effectiveAgentId ? getAgentById(effectiveAgentId) ?? getExpertById(effectiveAgentId) : undefined;
  const agentStyle = agentData
    ? (() => {
        const breed = BREED_STYLES[agentData.breedId ?? ''] ?? DEFAULT_BREED_STYLE;
        const label = agentData.variantLabel
          ? `${agentData.displayName}（${agentData.variantLabel}）`
          : `${agentData.displayName}`; // 不显示 ID
        const isCallback = message.origin === 'callback';
        return {
          label,
          font: breed.font,
          radius: breed.radius,
          bgColor: isCallback ? tintedLight(agentData.color.primary, 0.08) : agentData.color.secondary,
          borderColor: isCallback ? hexToRgba(agentData.color.primary, 0.12) : hexToRgba(agentData.color.primary, 0.3),
        };
      })()
    : null;
  const currentThread = useChatStore((s) => s.threads.find((t) => t.id === s.currentThreadId));
  const threadIdForPrefs = threadIdProp ?? currentThread?.id ?? 'default';
  const hasBlocks = message.contentBlocks && message.contentBlocks.length > 0;
  const hasTextContent = message.content.trim().length > 0;
  const isWhisper = message.visibility === 'whisper';
  const isRevealed = isWhisper && !!message.revealedAt;

  const direction = agentData
    ? parseDirection(message, () => ({ toAgent: getMentionToAgentId(), re: getMentionRe() }))
    : null;

  const isStreamOrigin = message.origin === 'stream';
  /** 避免历史里残留的 isStreaming（如 F5/草稿）在无活跃 inv 时仍驱动 CLI/工具 loading 闪动；与 fetchQueue 清标志一致 */
  const effectiveIsStreaming = Boolean(
    message.isStreaming &&
      message.agentId &&
      (Boolean(catInvocationId) || (hasActiveInvocation && targetAgents.includes(message.agentId))),
  );
  const taskRuns = message.extra?.taskRuns;
  const showTaskGrouped = taskRuns?.v === 1 && (taskRuns.segments?.length ?? 0) > 0;

  const userStopped = message.extra?.stream?.userStopped === true;
  const assistantStreamDisplaySuffix =
    userStopped && message.content.trim().length > 0 && !message.content.trimEnd().endsWith('(用户停止)')
      ? ' (用户停止)'
      : '';
  const streamBodyForCli = isStreamOrigin ? message.content : undefined;

  const cliEvents = toCliEvents(message.toolEvents, streamBodyForCli, {
    padUnmatchedToolResults: !effectiveIsStreaming && message.variant !== 'error' && !userStopped,
  });
  const hasCliBlock = cliEvents.length > 0;
  const cliStatus: CliStatus = effectiveIsStreaming
    ? 'streaming'
    : message.variant === 'error'
      ? 'failed'
      : userStopped
        ? 'interrupted'
        : 'done';
  const thinkingLabel = buildThinkingExecutionLabel(message, cliStatus, catInvocationInfo, activeInvocationStartedAt);

  const localGeneratedFiles = hasCliBlock ? extractDisplayedLocalGeneratedFiles(cliEvents) : [];
  const dedupeFileNames = new Set([
    ...localGeneratedFiles.map((file) => file.name.toLowerCase()),
    ...(suppressedGeneratedFileNames ?? []).map((fileName) => fileName.toLowerCase()),
  ]);
  const filteredContentBlocks = filterDuplicateWorkspaceContentBlocks(message.contentBlocks, dedupeFileNames);
  const filteredRichBlocks = filterDuplicateWorkspaceRichBlocks(message.extra?.rich?.blocks, dedupeFileNames);
  const hasFilteredBlocks = Boolean(filteredContentBlocks && filteredContentBlocks.length > 0);

  if (message.variant === 'intent_recognition') {
    const fallbackAgentId =
      getCachedAgents().find((cat) => cat.roster?.available !== false)?.id ?? getCachedAgents()[0]?.id ?? '';
    const resolvedAgentId = message.agentId ?? fallbackAgentId;
    const resolvedAgentData = message.agentId ? agentData : resolvedAgentId ? getAgentById(resolvedAgentId) : undefined;
    return (
      <IntentRecognitionPlaceholder
        agentId={resolvedAgentId}
        label={
          (message.agentId ? agentStyle?.label : undefined) ??
          resolvedAgentData?.displayName ??
          message.agentId ??
          resolvedAgentId ??
          '主智能体'
        }
        timestamp={message.timestamp}
        status={message.content === 'stopped' ? 'stopped' : 'pending'}
      />
    );
  }


  if (isSystem) {
    if (message.variant === 'evidence' && message.evidence) {
      return <EvidencePanel data={message.evidence} />;
    }

    // F045: variant='thinking' is deprecated — thinking is now embedded in assistant bubbles.

    const isLegacyError = !message.variant && message.content.trim().startsWith('Error:');
    const isError = message.variant === 'error' || isLegacyError || Boolean(message.extra?.errorFallback);
    const isWarning = message.variant === 'warning';
    const isTool = message.variant === 'tool';
    const isFollowup = message.variant === 'a2a_followup';

    // F118 AC-C3: Enhanced timeout diagnostics panel
    if (isError && message.extra?.timeoutDiagnostics) {
      return (
        <div data-message-id={message.id} className="flex justify-center mb-3">
          <div className="max-w-[85%] w-full">
            <TimeoutDiagnosticsPanel errorMessage={message.content} diagnostics={message.extra.timeoutDiagnostics} />
          </div>
        </div>
      );
    }

    const toneClass = isTool
      ? 'text-gray-400 bg-gray-50/50 font-mono text-xs py-1'
      : isFollowup
        ? 'text-purple-700 bg-purple-50 border border-purple-200'
        : isWarning
          ? 'text-amber-800 bg-amber-50 border border-amber-200'
          : isError
            ? 'text-red-500 bg-red-50 rounded-full'
            : 'text-blue-700 bg-blue-50 hidden';
    return (
      <div data-message-id={message.id} className={`flex justify-center ${isTool ? 'mb-1' : 'mb-3'}`}>
        <div className={`text-sm px-4 py-2 rounded-lg whitespace-pre-wrap text-left max-w-[85%] ${toneClass}`}>
          {isFollowup && <span className="mr-1">🔗</span>}
          {isWarning && <span className="mr-1">⚠️</span>}
          {isError ? <MarkdownContent content={message.content} disableCommandPrefix /> : message.content}
          {isFollowup && <span className="block mt-1 text-xs text-purple-500">输入 @智能体 跟进 来发起 follow-up</span>}
        </div>
      </div>
    );
  }

  if (isConnector && message.source) {
    if (!isStartupReconcilerNotice) {
      return <ConnectorBubble message={message} />;
    }
  }

  if (isUser) {
    const avatarSrc = coCreator.avatar?.trim();
    return (
      <div data-message-id={message.id} className="user-question-group flex justify-end gap-2 mb-[8px] items-start">
        <div className="max-w-[75%] flex flex-col items-end gap-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 px-1 max-w-full">
            {avatarSrc ? (
              <img src={avatarSrc} alt={coCreator.name} className="h-5 w-5 rounded-full object-cover flex-shrink-0" />
            ) : null}
            {isWhisper && (
              <span
                className={`flex-shrink-0 px-1.5 py-0.5 rounded ${isRevealed ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-600'}`}
              >
                {isRevealed
                  ? '已揭秘'
                  : `悄悄话 → ${
                      message.whisperTo
                        ?.map((id) => {
                          const participant = getAgentById(id) ?? getExpertById(id);
                          return participant ? participant.displayName : id;
                        })
                        .join(', ') ?? ''
                    }`}
              </span>
            )}
          </div>
          <div
            className={`rounded-[24px] rounded-tr-sm px-4 py-3 w-full ${
              isWhisper && !isRevealed ? 'bg-amber-50 text-amber-900 border border-dashed border-amber-300' : ''
            }`}
            style={
              !isWhisper || isRevealed
                ? {
                    backgroundColor: 'var(--chat-user-bubble-bg)',
                    color: 'rgb(25, 25, 25)',
                  }
                : undefined
            }
          >
            {hasBlocks ? (
              <ContentBlocks blocks={message.contentBlocks!} enableSkillAndQuickActionTokens showFileAction={false} />
            ) : (
              <MarkdownContent content={message.content} enableSkillAndQuickActionTokens />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Don't render completely empty non-streaming assistant messages.
  // This can happen when an agent responds with only internal tool use and no text output.
  // Keep messages that have thinking content — they should still show as collapsible bubbles.
  if (
    !effectiveIsStreaming &&
    !hasTextContent &&
    !hasCliBlock &&
    !hasBlocks &&
    !message.extra?.rich?.blocks?.length &&
    !message.extra?.crossPost &&
    !message.thinking &&
    !showTaskGrouped
  ) {
    return null;
  }

  return (
    <div data-message-id={message.id} className="answer-group group flex gap-3 mb-[8px] items-start">
      {agentData && (
        <AgentAvatar
          agentId={effectiveAgentId!}
          size={32}
          status={effectiveIsStreaming ? 'streaming' : undefined}
          showRing={false}
        />
      )}
      <div className="answer-container  max-w-[85%] md:max-w-[75%] min-w-0">
        {agentStyle && (
          <div className="answer-header flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0 text-[rgb(128_128_128)]">
              <span className="text-xs">{agentStyle.label}</span>
              <span className="text-xs text-gray-400">{formatTime(message.timestamp)}</span>
              {isWhisper && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${isRevealed ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-600'}`}
                >
                  {isRevealed
                    ? '已揭秘'
                    : `悄悄话 → ${
                        message.whisperTo
                          ?.map((id) => {
                            const participant = getAgentById(id) ?? getExpertById(id);
                            return participant ? participant.displayName : id;
                          })
                          .join(', ') ?? ''
                      }`}
                </span>
              )}
              {!isWhisper && direction && <DirectionPill direction={direction} getAgentById={getAgentById} />}
              {message.replyTo && message.replyPreview && (
                <ReplyPill
                  replyPreview={message.replyPreview}
                  replyToId={message.replyTo}
                  getAgentById={getAgentById}
                />
              )}
            </div>
            {message.extra?.crossPost &&
              (() => {
                const sourceId = message.extra.crossPost?.sourceThreadId;
                const sourceName = threads.find((t) => t.id === sourceId)?.title ?? '未命名会话';
                const shortId = sourceId.replace(/^thread_/, '').slice(0, 8);
                const senderLabel = agentStyle?.label;
                return (
                  <a
                    href={`/thread/${sourceId}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/thread/${sourceId}`);
                    }}
                    className="inline-flex items-center gap-1.5 border px-3 py-1 rounded-full bg-[#FDF6ED] border-[#E8DCCF] text-[#8D6E63] hover:bg-[#F5EDE0] transition-colors cursor-pointer w-fit max-w-full"
                    title={sourceId}
                    aria-label={`跳转到来源 thread ${sourceId}`}
                  >
                    <span className="text-[10px] font-semibold" aria-hidden>
                      📮
                    </span>
                    <span className="min-w-0 truncate">
                      {senderLabel && <span className="font-medium">{senderLabel} · </span>}
                      {shortId} · {sourceName}
                    </span>
                  </a>
                );
              })()}
          </div>
        )}
        <div
          className={`answer-body overflow-hidden ${agentStyle ? `${agentStyle.font ?? ''}` : 'bg-white border-gray-200'}`}
        >
          {showTaskGrouped && taskRuns ? (
            <div className="flex flex-col gap-3">
              <TaskGroupedStreamBody
                threadId={threadIdForPrefs}
                taskRuns={taskRuns}
                message={message}
                cliStatus={cliStatus}
                thinkingLabel={thinkingLabel}
                thinkingFontClass={agentStyle?.font}
                breedColor={agentData?.color.primary}
                thinkingMode={currentThread?.thinkingMode}
                projectPath={currentThread?.projectPath}
                suppressedGeneratedFileNames={suppressedGeneratedFileNames}
                pendingAuthRequests={pendingAuthRequests}
                onAuthRespond={onAuthRespond}
                onOpenSecurityManagement={onOpenSecurityManagement}
              />
              {!isStreamOrigin && hasFilteredBlocks ? (
                <ContentBlocks blocks={filteredContentBlocks!} />
              ) : !isStreamOrigin && hasTextContent ? (
                <MarkdownContent
                  content={message.content}
                  className={agentStyle?.font}
                  enableSkillAndQuickActionTokens={false}
                />
              ) : isStreamOrigin && hasTextContent ? (
                <MarkdownContent
                  content={`${message.content.trimEnd()}${assistantStreamDisplaySuffix}`}
                  className={agentStyle?.font}
                  enableSkillAndQuickActionTokens={false}
                />
              ) : null}
              <CliOutputBlockAttachments
                events={cliEvents}
                status={cliStatus}
                suppressedGeneratedFileNames={suppressedGeneratedFileNames}
                projectPath={currentThread?.projectPath}
              />
            </div>
          ) : (
            <>
              {hasCliBlock && isStreamOrigin ? null : !isStreamOrigin && hasFilteredBlocks ? (
                <ContentBlocks blocks={filteredContentBlocks!} />
              ) : !isStreamOrigin && hasTextContent ? (
                <MarkdownContent
                  content={message.content}
                  className={agentStyle?.font}
                  enableSkillAndQuickActionTokens={false}
                />
              ) : isStreamOrigin && hasTextContent ? (
                <MarkdownContent
                  content={`${message.content.trimEnd()}${assistantStreamDisplaySuffix}`}
                  className={agentStyle?.font}
                  enableSkillAndQuickActionTokens={false}
                />
              ) : null}
              {message.thinking && (
                <ThinkingContent
                  status={cliStatus}
                  events={cliEvents}
                  content={message.thinking}
                  className={agentStyle?.font}
                  label={thinkingLabel}
                  defaultExpanded={uiThinkingExpandedByDefault}
                  expandInExport={false}
                  breedColor={agentData?.color.primary}
                  persistExpandKey={bubbleExpandStorageKey(threadIdForPrefs, message.id, 'thinking-standalone')}
                />
              )}
              {hasCliBlock && (
                <CliOutputBlock
                  events={cliEvents}
                  status={cliStatus}
                  message={message}
                  threadId={threadIdForPrefs}
                  suppressedGeneratedFileNames={suppressedGeneratedFileNames}
                  thinkingMode={currentThread?.thinkingMode}
                  defaultExpanded={uiThinkingExpandedByDefault}
                  breedColor={agentData?.color.primary}
                  projectPath={currentThread?.projectPath}
                  authorizationRequests={pendingAuthRequests}
                  onAuthorizationRespond={onAuthRespond}
                  onOpenSecurityManagement={onOpenSecurityManagement}
                />
              )}
            </>
          )}
          {filteredRichBlocks && filteredRichBlocks.length > 0 && (
            <RichBlocks blocks={filteredRichBlocks} agentId={message.agentId} messageId={message.id} />
          )}
          {effectiveIsStreaming && !isStreamOrigin && (
            <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 rounded-full opacity-50" />
          )}
        </div>
      </div>
    </div>
  );
}

function areChatMessagePropsEqual(prev: ChatMessageProps, next: ChatMessageProps): boolean {
  return (
    prev.message === next.message &&
    prev.threadId === next.threadId &&
    prev.getAgentById === next.getAgentById &&
    prev.suppressedGeneratedFileNames === next.suppressedGeneratedFileNames &&
    prev.pendingAuthRequests === next.pendingAuthRequests &&
    prev.onAuthRespond === next.onAuthRespond &&
    prev.onOpenSecurityManagement === next.onOpenSecurityManagement
  );
}

export const ChatMessage = memo(ChatMessageInner, areChatMessagePropsEqual);
ChatMessage.displayName = 'ChatMessage';
