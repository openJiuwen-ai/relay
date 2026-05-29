/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatMessage } from '@/components/chat-message';
import {
  extractDisplayedLocalGeneratedFiles,
  mergeVirtualPptInProgressArtifacts,
} from '@/components/cli-output/local-generated-files';
import { toCliEvents } from '@/components/cli-output/toCliEvents';
import { useAgentMessages } from '@/hooks/useAgentMessages';
import { useAskUserQuestion } from '@/hooks/useAskUserQuestion';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useAgentData } from '@/hooks/useAgentData';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useMessageFeedback } from '@/hooks/useMessageFeedback';
import { useChatSocketCallbacks } from '@/hooks/useChatSocketCallbacks';
import { useDesktopWindowControls } from '@/hooks/useDesktopWindowControls';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useSocket } from '@/hooks/useSocket';
import { useSplitPaneKeys } from '@/hooks/useSplitPaneKeys';
import { useVadInterrupt } from '@/hooks/useVadInterrupt';
import { useVoiceAutoPlay } from '@/hooks/useVoiceAutoPlay';
import { useVoiceStream } from '@/hooks/useVoiceStream';
import { getMentionRe, getMentionToAgentId } from '@/lib/mention-highlight';
import { MAIN_PANEL_MIN_WIDTH } from '@/shared/constants';
import type { AskUserQuestionAnswer } from '@/stores/chat-types';
import { type ChatMessage as ChatMessageData, useChatStore } from '@/stores/chatStore';
import { useTaskStore } from '@/stores/taskStore';
import { apiFetch } from '@/utils/api-client';
import { computeScrollRecomputeSignal } from '@/utils/scrollRecomputeSignal';
import { getUserId } from '@/utils/userId';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { OutlinePreviewCard } from './outline-preview/OutlinePreviewCard';
import { OfficeClawHub } from './OfficeClawHub';
import { ChatContainerHeader } from './ChatContainerHeader';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInput } from './chat-input/ChatInput';
import { computeSuppressedGeneratedFileNamesByMessage } from './generated-file-dedupe';
import { MessageActions } from './MessageActions';
import { ParallelStatusBar } from './ParallelStatusBar';
import { PptStudioBackgroundSync } from './ppt-studio/PptStudioBackgroundSync';
import {
  PreviewSecondaryPane,
  useCurrentPptSession,
  usePptMessageContext,
  usePreviewPaneLayout,
} from './preview-panels/PreviewSecondaryPane';
import { OutlinePreviewSecondaryPane } from './outline-preview/outline-preview-chat-integration';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import SecurityManagementModal from './SecurityManagementModal';
import { SplitPaneView } from './SplitPaneView';
import { CenteredLoadingState } from './shared/CenteredLoadingState';
import { ThinkingIndicator } from './ThinkingIndicator';
import { ThreadExecutionBar } from './ThreadExecutionBar';

function getMessageToolActivityTimestamp(message: ChatMessageData): number | null {
  if (!message.toolEvents || message.toolEvents.length === 0) return null;
  return Math.max(message.timestamp, ...message.toolEvents.map((event) => event.timestamp ?? message.timestamp));
}

function mapPendingAuthorizationToMessages(
  messages: ChatMessageData[],
  pending: import('@/hooks/useAuthorization').AuthPendingRequest[],
): Map<string, import('@/hooks/useAuthorization').AuthPendingRequest[]> {
  const pendingByMessageId = new Map<string, import('@/hooks/useAuthorization').AuthPendingRequest[]>();
  const hostMessages = messages.filter(
    (message) =>
      message.type === 'assistant' &&
      Boolean(message.agentId) &&
      Array.isArray(message.toolEvents) &&
      message.toolEvents.length > 0,
  );

  for (const request of pending) {
    const bestHost = hostMessages
      .filter((message) => message.agentId === request.agentId)
      .sort((left, right) => {
        if (left.isStreaming !== right.isStreaming) {
          return left.isStreaming ? -1 : 1;
        }

        const leftDelta = Math.abs((getMessageToolActivityTimestamp(left) ?? left.timestamp) - request.createdAt);
        const rightDelta = Math.abs((getMessageToolActivityTimestamp(right) ?? right.timestamp) - request.createdAt);
        if (leftDelta !== rightDelta) return leftDelta - rightDelta;

        return right.timestamp - left.timestamp;
      })[0];

    if (!bestHost) continue;

    const existing = pendingByMessageId.get(bestHost.id) ?? [];
    existing.push(request);
    pendingByMessageId.set(bestHost.id, existing);
  }

  return pendingByMessageId;
}

function getFolderNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized ?? null;
}

function isCopyableMessage(message: ChatMessageData): boolean {
  if ((message.type !== 'user' && message.type !== 'assistant') || !message.content.trim()) {
    return false;
  }
  if (message.type === 'assistant' && message.isStreaming) return false;
  if (message.type === 'user' && message.agentId) return false;
  return true;
}

type ChatContainerProps = {
  mode?: 'thread';
  threadId: string;
};

export function ChatContainer(props: ChatContainerProps) {
  return <ThreadModeChatContainer threadId={props.threadId} />;
}

function ThreadModeChatContainer({ threadId }: { threadId: string }) {
  const { isDesktopHost, isMaximized } = useDesktopWindowControls();
  const navigate = useNavigate();
  const {
    messages,
    isLoading,
    hasActiveInvocation,
    intentMode,
    targetAgents,
    agentStatuses,
    agentInvocations,
    setCurrentThread,
    viewMode,
    setViewMode,
    clearUnread,
    confirmUnreadAck,
    armUnreadSuppression,
    consumePendingNewThreadSend,
  } = useChatStore();
  const uiThinkingExpandedByDefault = useChatStore((s) => s.uiThinkingExpandedByDefault);
  const threads = useChatStore((s) => s.threads);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isExport = searchParams?.get('export') === 'true';
  const isResearchMode = searchParams?.get('research') === 'multi';
  const { clearTasks } = useTaskStore();
  const { agents, getAgentById } = useAgentData();
  const firstAvailableAgentId = useMemo(() => {
    const firstAvailable = agents.find((agent) => agent.roster?.available !== false);
    return firstAvailable?.id ?? agents[0]?.id ?? '';
  }, [agents]);
  const rightPanelMode = useChatStore((s) => s.rightPanelMode ?? 'status');
  const openFileBrowserPanel = useChatStore((s) => s.openFileBrowserPanel);
  const pptStudioSessions = useChatStore((s) => s.pptStudioSessions);
  const activeOutlinePreview = useChatStore((s) => s.activeOutlinePreview);
  const currentPptSession = useCurrentPptSession(threadId);
  const formalTaskCountForThread = useTaskStore(
    (s) => (s.tasks ?? []).filter((t) => t.threadId === threadId).length,
  );
  const hasActiveTaskProgress = useMemo(() => {
    return Object.values(agentInvocations ?? {}).some(
      (inv) => (inv.taskProgress?.tasks?.length ?? 0) > 0
    );
  }, [agentInvocations]);
  const taskPanelAutoOpenLatchRef = useRef(false);
  // Open unified preview only when this thread has tasks (or streamed task segments), not from other threads'
  // global task-store leftovers (clearTasks runs in an effect — first paint could still see stale total count).
  useEffect(() => {
    const signal =
      formalTaskCountForThread > 0 || (hasActiveTaskProgress && hasActiveInvocation);
    if (!signal) {
      taskPanelAutoOpenLatchRef.current = false;
      return;
    }
    if (taskPanelAutoOpenLatchRef.current) return;
    taskPanelAutoOpenLatchRef.current = true;
    if (rightPanelMode !== 'status') return;
    openFileBrowserPanel();
  }, [
    formalTaskCountForThread,
    hasActiveInvocation,
    hasActiveTaskProgress,
    openFileBrowserPanel,
    rightPanelMode,
  ]);
  const [mobileStatusOpen, setMobileStatusOpen] = useState(false);
  const [showSecurityManagement, setShowSecurityManagement] = useState(false);
  const [stoppedIntentRecognition, setStoppedIntentRecognition] = useState<{
    timestamp: number;
    agentId: string;
  } | null>(null);
  const {
    containerRef,
    handlePptStudioPanelResize,
    pptStudioPaneWidth,
    resetPptStudioPanelWidth,
    isCompactPreviewLayout,
  } = usePreviewPaneLayout(rightPanelMode);

  const {
    handleAgentMessage,
    handleStop: stopHandler,
    resetRefs,
    resetRefsForThreadSwitch,
    resetTimeout,
    clearDoneTimeout,
  } = useAgentMessages();
  const {
    handleScroll,
    scrollContainerRef,
    messagesEndRef,
    scrollToBottom,
    followLayoutChangeIfPinned,
    isLoadingHistory,
    hasMore,
  } = useChatHistory(threadId);
  const { feedbackByMessageId, submitFeedback } = useMessageFeedback(threadId);
  const queueLayoutSignal = useChatStore((s) => {
    const threadState = s.threadStates?.[threadId];
    const threadQueue = s.currentThreadId === threadId ? s.queue : (threadState?.queue ?? []);
    const queuedCount = (threadQueue ?? []).filter((entry) => entry.status === 'queued').length;
    const queuePaused = s.currentThreadId === threadId ? s.queuePaused : (threadState?.queuePaused ?? false);
    return `${queuedCount}:${queuePaused ? 1 : 0}`;
  });
  const { handleSend, uploadStatus, uploadError } = useSendMessage(threadId, { resetRefs });
  const {
    pending: authPending,
    respond: authRespond,
    handleAuthRequest,
    handleAuthResponse,
    clearPending: clearAuthPending,
  } = useAuthorization(threadId);
  const {
    pendingQuestion,
    submitAnswer: submitAskUserQuestionAnswer,
    handleQuestionRequest,
    handleQuestionResponse,
  } = useAskUserQuestion(threadId);
  const seenAuthRequestIdsRef = useRef(new Set<string>());

  const activePptContext = usePptMessageContext(currentPptSession);

  const handleThreadSend = useCallback(
    (
      content: string,
      images?: File[],
      overrideThreadId?: string,
      whisper?: Parameters<typeof handleSend>[3],
      deliveryMode?: Parameters<typeof handleSend>[4],
      sendOptions?: Parameters<typeof handleSend>[5],
    ) => {
      const shouldAttachPptContext = !overrideThreadId || overrideThreadId === threadId;
      const mergedSendOptions =
        shouldAttachPptContext && activePptContext ? { ...sendOptions, pptContext: activePptContext } : sendOptions;
      handleSend(content, images, overrideThreadId, whisper, deliveryMode, mergedSendOptions);
    },
    [activePptContext, handleSend, threadId],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail.text;
      if (text) {
        scrollToBottom('smooth');
        handleThreadSend(text);
      }
    };
    window.addEventListener('office-claw:interactive-send', handler);
    return () => window.removeEventListener('office-claw:interactive-send', handler);
  }, [handleThreadSend, scrollToBottom]);

  const { addMessage } = useChatStore();

  const messageSummary = useMemo(() => {
    const c = { total: messages.length, assistant: 0, system: 0, evidence: 0, followup: 0 };
    for (const msg of messages) {
      const isAssistant = msg.type === 'assistant' || (msg.type === 'user' && !!msg.agentId);
      if (isAssistant) c.assistant++;
      if (msg.type === 'system') {
        c.system++;
        if (msg.variant === 'evidence') c.evidence++;
        if (msg.variant === 'a2a_followup') c.followup++;
      }
    }
    return c;
  }, [messages]);

  const setCurrentProject = useChatStore((s) => s.setCurrentProject);
  const storeThreads = useChatStore((s) => s.threads);
  const prevThreadRef = useRef(threadId);
  const currentThreadProjectPath = useMemo(
    () => storeThreads?.find((thread) => thread.id === threadId)?.projectPath ?? null,
    [storeThreads, threadId],
  );
  const currentThreadProjectName = useMemo(
    () => getFolderNameFromPath(currentThreadProjectPath),
    [currentThreadProjectPath],
  );

  useEffect(() => {
    if (prevThreadRef.current !== threadId) {
      setCurrentThread(threadId);
      resetRefsForThreadSwitch(threadId);
      clearTasks();
      prevThreadRef.current = threadId;
    }
    setCurrentThread(threadId);
  }, [threadId, clearTasks, resetRefsForThreadSwitch, setCurrentThread]);

  // Queue area height changes can push the visible bottom up without a message append.
  // Keep following only when the user was already pinned to bottom.
  useEffect(() => {
    if (typeof followLayoutChangeIfPinned !== 'function') return;
    followLayoutChangeIfPinned('auto');
  }, [followLayoutChangeIfPinned, queueLayoutSignal]);

  useEffect(() => {
    const cached = storeThreads?.find((t) => t.id === threadId);
    if (cached) {
      setCurrentProject(cached.projectPath || 'default');
    }
  }, [threadId, storeThreads, setCurrentProject]);

  const socketCallbacks = useChatSocketCallbacks({
    threadId,
    userId: getUserId(),
    handleAgentMessage,
    resetTimeout,
    clearDoneTimeout,
    handleAuthRequest,
    handleAuthResponse,
    handleAskUserQuestionRequest: handleQuestionRequest,
    handleAskUserQuestionResponse: handleQuestionResponse,
    onNavigateToThread: (tid) => navigate(`/thread/${tid}`),
  });

  const pendingAuthorizationByMessageId = useMemo(
    () => mapPendingAuthorizationToMessages(messages, authPending),
    [authPending, messages],
  );
  const suppressedGeneratedFilesByMessageId = useMemo(
    () => computeSuppressedGeneratedFileNamesByMessage(messages),
    [messages],
  );
  const lastCopyableMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message && isCopyableMessage(message)) return message.id;
    }
    return null;
  }, [messages]);
  useEffect(() => {
    const seenRequestIds = seenAuthRequestIdsRef.current;
    const hasNewPendingRequest = authPending.some((request) => !seenRequestIds.has(request.requestId));
    seenAuthRequestIdsRef.current = new Set(authPending.map((request) => request.requestId));
    if (hasNewPendingRequest) {
      followLayoutChangeIfPinned('smooth');
    }
  }, [authPending, followLayoutChangeIfPinned]);

  const pendingIntentRecognitionTimestamp = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.type !== 'user' || lastMessage.agentId) return null;
    if (!isLoading || !hasActiveInvocation) return null;
    if (intentMode === null) return lastMessage.timestamp;

    const hasAssistantResponseStarted = messages.some(
      (message) =>
        message.type === 'assistant' &&
        message.timestamp >= lastMessage.timestamp &&
        (message.isStreaming ||
          message.content.trim().length > 0 ||
          Boolean(message.thinking) ||
          Boolean(message.toolEvents?.length) ||
          Boolean(message.contentBlocks?.length) ||
          Boolean(message.extra?.rich?.blocks?.length)),
    );

    if (!hasAssistantResponseStarted) return lastMessage.timestamp;
    return null;
  }, [hasActiveInvocation, intentMode, isLoading, messages]);

  const pendingIntentRecognitionAgentId = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.type !== 'user' || lastMessage.agentId) return firstAvailableAgentId;

    if (targetAgents.length > 0) return targetAgents[0];

    const mentionMatches = Array.from(lastMessage.content.matchAll(getMentionRe()))
      .map((match) => getMentionToAgentId()[match[1]?.toLowerCase() ?? ''])
      .filter((agentId): agentId is string => Boolean(agentId) && agentId !== '__co-creator__');

    if (mentionMatches.length > 0) return mentionMatches[0];
    return firstAvailableAgentId;
  }, [firstAvailableAgentId, messages, targetAgents]);

  const persistStoppedIntentRecognition = useCallback(() => {
    if (!stoppedIntentRecognition) return;
    addMessage({
      id: `intent-recognition-stopped-${stoppedIntentRecognition.timestamp}`,
      type: 'assistant',
      agentId: stoppedIntentRecognition.agentId,
      content: 'stopped',
      timestamp: stoppedIntentRecognition.timestamp + 1,
      variant: 'intent_recognition',
    } as ChatMessageData);
    setStoppedIntentRecognition(null);
  }, [stoppedIntentRecognition, addMessage]);

  useEffect(() => {
    if (!stoppedIntentRecognition) return;

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
      setStoppedIntentRecognition(null);
      return;
    }

    if (
      pendingIntentRecognitionTimestamp != null &&
      pendingIntentRecognitionTimestamp !== stoppedIntentRecognition.timestamp
    ) {
      setStoppedIntentRecognition(null);
      return;
    }

    if (pendingIntentRecognitionTimestamp == null && lastMessage.timestamp !== stoppedIntentRecognition.timestamp) {
      setStoppedIntentRecognition(null);
    }
  }, [messages, pendingIntentRecognitionTimestamp, stoppedIntentRecognition]);

  const showThinkingIndicator = intentMode === 'execute' && pendingIntentRecognitionTimestamp == null;

  const handleOpenSecurityManagement = useCallback(() => {
    setShowSecurityManagement(true);
  }, []);

  const handleAskUserQuestionSubmit = useCallback(
    async (payload: { request_id: string; source?: string; answers: AskUserQuestionAnswer[] }) => {
      await submitAskUserQuestionAnswer(payload);
    },
    [submitAskUserQuestionAnswer],
  );

  const renderSingleMessage = useCallback(
    (msg: ChatMessageData) => (
      <MessageActions
        key={msg.id}
        message={msg}
        threadId={threadId}
        isLastCopyVisible={msg.id === lastCopyableMessageId}
        feedbackValue={feedbackByMessageId[msg.id]?.vote ?? null}
        onSubmitFeedback={submitFeedback}
      >
        <ChatMessage
          message={msg}
          threadId={threadId}
          getAgentById={getAgentById}
          suppressedGeneratedFileNames={suppressedGeneratedFilesByMessageId.get(msg.id)}
          pendingAuthRequests={pendingAuthorizationByMessageId.get(msg.id)}
          onAuthRespond={authRespond}
          onOpenSecurityManagement={handleOpenSecurityManagement}
        />
      </MessageActions>
    ),
    [
      threadId,
      getAgentById,
      suppressedGeneratedFilesByMessageId,
      pendingAuthorizationByMessageId,
      lastCopyableMessageId,
      feedbackByMessageId,
      submitFeedback,
      authRespond,
      handleOpenSecurityManagement,
    ],
  );

  useVoiceAutoPlay();
  useVoiceStream();
  useVadInterrupt();

  useSplitPaneKeys();
  const splitPaneThreadIds = useChatStore((s) => s.splitPaneThreadIds);
  const setSplitPaneThreadIds = useChatStore((s) => s.setSplitPaneThreadIds);
  const setSplitPaneTarget = useChatStore((s) => s.setSplitPaneTarget);

  const watchedThreadIds = useMemo(() => {
    const ids = new Set<string>(threads.map((thread) => thread.id));
    for (const splitThreadId of splitPaneThreadIds) {
      ids.add(splitThreadId);
    }
    return [...ids];
  }, [threads, splitPaneThreadIds]);

  const { cancelInvocation, awaitThreadRoom = async () => 'timed_out' as const } = useSocket(
    socketCallbacks,
    threadId,
    watchedThreadIds,
  );

  /** Dev Strict Mode mounts effects twice — do not consume `pendingNewThreadSend` until after awaitThreadRoom;
   * an early consume + cleanup would discard the pending payload before the surviving effect runs. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await awaitThreadRoom(threadId);
      } catch (error) {
        console.warn('[chat] awaitThreadRoom failed, continuing with best-effort send', {
          threadId,
          error,
        });
      }
      if (cancelled) return;

      const pending = consumePendingNewThreadSend(threadId);
      if (!pending) return;

      scrollToBottom('smooth');
      handleThreadSend(
        pending.content,
        pending.images,
        undefined,
        pending.whisper,
        pending.deliveryMode,
        pending.sendOptions,
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [awaitThreadRoom, consumePendingNewThreadSend, handleThreadSend, scrollToBottom, threadId]);

  useEffect(() => {
    if (viewMode === 'split' && splitPaneThreadIds.length === 0 && threadId !== 'default') {
      setSplitPaneThreadIds([threadId]);
      setSplitPaneTarget(threadId);
    }
  }, [viewMode, splitPaneThreadIds.length, threadId, setSplitPaneThreadIds, setSplitPaneTarget]);

  useEffect(() => {
    clearUnread(threadId);
  }, [threadId, clearUnread]);

  const readAckTriggerKey = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return `${threadId}:empty`;
    return [
      threadId,
      lastMessage.id,
      lastMessage.timestamp,
      lastMessage.origin ?? 'none',
      lastMessage.isStreaming ? 'streaming' : 'done',
      lastMessage.deliveredAt ?? 'none',
    ].join('|');
  }, [messages, threadId]);

  useEffect(() => {
    armUnreadSuppression(threadId);
    apiFetch(`/api/threads/${encodeURIComponent(threadId)}/read/latest`, {
      method: 'POST',
    })
      .then((res) => {
        if (res.ok) {
          confirmUnreadAck(threadId);
        }
      })
      .catch((err) => {
        console.debug('[F069] read ack failed:', err);
      });
  }, [threadId, readAckTriggerKey, confirmUnreadAck, armUnreadSuppression]);

  const handleStop = useCallback(
    (overrideThreadId?: unknown) => {
      const targetThreadId = typeof overrideThreadId === 'string' ? overrideThreadId : threadId;
      if (targetThreadId === threadId && pendingIntentRecognitionTimestamp != null) {
        setStoppedIntentRecognition({
          timestamp: pendingIntentRecognitionTimestamp,
          agentId: pendingIntentRecognitionAgentId,
        });
      }
      clearAuthPending();
      stopHandler(cancelInvocation, targetThreadId);
    },
    [stopHandler, cancelInvocation, pendingIntentRecognitionAgentId, pendingIntentRecognitionTimestamp, threadId, clearAuthPending],
  );

  const handleZoomToThread = useCallback(
    (tid: string) => {
      setViewMode('single');
      navigate(`/thread/${tid}`);
    },
    [setViewMode, navigate],
  );

  if (viewMode === 'split') {
    return (
      <>
        <SplitPaneView
          onSend={handleThreadSend}
          onStop={handleStop}
          uploadStatus={uploadStatus}
          uploadError={uploadError}
          onZoomToThread={handleZoomToThread}
        />
        <OfficeClawHub />
      </>
    );
  }

  if (isExport) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto p-4">{messages.map((msg) => renderSingleMessage(msg))}</div>
      </div>
    );
  }

  // Split shell: PPT / workspace / outline preview share the right column. Only mount it when there is something to show.
  const hasOutlinePreviewContent = rightPanelMode === 'outlinePreview' && activeOutlinePreview != null;
  const shouldRenderSecondaryPane =
    rightPanelMode !== 'status' &&
    (rightPanelMode !== 'outlinePreview' || activeOutlinePreview != null) &&
    (threadId !== 'default' || hasOutlinePreviewContent || rightPanelMode === 'fileBrowser');

  // Artifacts for file browser panel: all send_file_to_user files across the entire thread
  const allArtifacts = useMemo(() => {
    const allCliEvents = messages.flatMap((msg) =>
      msg.toolEvents && msg.toolEvents.length > 0 ? toCliEvents(msg.toolEvents, undefined, {}) : [],
    );
    const base = extractDisplayedLocalGeneratedFiles(allCliEvents);
    return mergeVirtualPptInProgressArtifacts(base, pptStudioSessions, threadId);
  }, [messages, pptStudioSessions, threadId]);

  return (
    <>
      <div ref={containerRef} className="flex h-full w-full min-h-0 min-w-0 overflow-x-auto">
        <div
          className="relative flex h-full min-h-0 min-w-0 flex-1"
          style={{ minWidth: MAIN_PANEL_MIN_WIDTH }}
        >
          <div
            className={`chat-layout-container relative min-w-0 flex-1 flex-col ${isCompactPreviewLayout ? 'hidden' : 'flex'}`}
          >
            <ChatContainerHeader
              sidebarOpen={true}
              onToggleSidebar={() => {}}
              threadId={threadId}
              authPendingCount={authPending.length}
              targetAgents={targetAgents}
              viewMode={viewMode}
              onToggleViewMode={() => setViewMode(viewMode === 'single' ? 'split' : 'single')}
              onOpenMobileStatus={() => setMobileStatusOpen(true)}
              defaultVoiceAgentId={targetAgents[0] || firstAvailableAgentId}
            />

            {intentMode === 'ideate' && <ParallelStatusBar onStop={handleStop} />}
            {showThinkingIndicator && <ThinkingIndicator onCancel={cancelInvocation} />}

            <main
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className={`ui-shell-surface flex-1 min-h-0 overflow-y-auto px-0 py-6 ${
                isDesktopHost && isMaximized ? 'chat-scrollbar-maximized-inset' : ''
              }`}
              data-chat-container
            >
              {isLoadingHistory && (
                <div className="absolute flex items-center justify-center w-full h-[90%]">
                  <CenteredLoadingState />
                </div>
              )}
              {!hasMore && messages.length > 0 && (
                <div className="text-center py-3 text-xs text-gray-300 hidden">没有更多消息...</div>
              )}
              {messages.length === 0 && !isLoadingHistory ? (
                <ChatEmptyState
                  onAgentsClick={() => navigate('/agents')}
                  onChannelsClick={() => navigate('/channels')}
                />
              ) : (
                messages.map((msg) => renderSingleMessage(msg))
              )}
              {pendingIntentRecognitionTimestamp != null &&
                renderSingleMessage({
                  id: `intent-recognition-${pendingIntentRecognitionTimestamp}`,
                  type: 'assistant',
                  agentId: pendingIntentRecognitionAgentId,
                  content: '',
                  timestamp: pendingIntentRecognitionTimestamp,
                  variant: 'intent_recognition',
                } as ChatMessageData)}
              {pendingIntentRecognitionTimestamp == null &&
                stoppedIntentRecognition != null &&
                renderSingleMessage({
                  id: `intent-recognition-stopped-${stoppedIntentRecognition.timestamp}`,
                  type: 'assistant',
                  agentId: stoppedIntentRecognition.agentId,
                  content: 'stopped',
                  timestamp: stoppedIntentRecognition.timestamp,
                  variant: 'intent_recognition',
                } as ChatMessageData)}
              {pendingQuestion && (
                <div className="chat-layout-rail" style={{ paddingLeft: '44px' }}>
                  {pendingQuestion.questions[0]?.preview
                    ? <OutlinePreviewCard
                        requestId={pendingQuestion.requestId}
                        source={pendingQuestion.source}
                        questions={pendingQuestion.questions}
                        onSubmit={handleAskUserQuestionSubmit}
                      />
                    : <AskUserQuestionCard
                        requestId={pendingQuestion.requestId}
                        source={pendingQuestion.source}
                        questions={pendingQuestion.questions}
                        expiresAtMs={pendingQuestion.expiresAtMs}
                        onSubmit={handleAskUserQuestionSubmit}
                        onCancel={handleAskUserQuestionSubmit}
                      />}
                </div>
              )}
              <div ref={messagesEndRef} />
            </main>
            <div className="relative">
              <ScrollToBottomButton
                scrollContainerRef={scrollContainerRef}
                messagesEndRef={messagesEndRef}
                recomputeSignal={computeScrollRecomputeSignal(threadId, messages, uiThinkingExpandedByDefault ? 1 : 0)}
                observerKey={threadId}
              />
            </div>

            <ThreadExecutionBar />
            {isResearchMode && (
              <div className="mx-4 mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                多智能体研究模式 - 文章上下文已注入。请输入研究问题，智能体会自动调用 multi_mention
                邀请其他智能体参与分析。
              </div>
            )}
            <ChatInput
              key={threadId}
              threadId={threadId}
              onSend={(content, images, whisper, deliveryMode, sendOptions) => {
                persistStoppedIntentRecognition();
                scrollToBottom('smooth');
                handleThreadSend(content, images, undefined, whisper, deliveryMode, sendOptions);
              }}
              onStop={handleStop}
              disabled={hasActiveInvocation}
              folderSelectionEnabled={false}
              selectedFolderName={currentThreadProjectName}
              selectedFolderTitle={currentThreadProjectPath}
              hasActiveInvocation={hasActiveInvocation}
              uploadStatus={uploadStatus}
              uploadError={uploadError}
            />
          </div>

          {shouldRenderSecondaryPane && rightPanelMode !== 'outlinePreview' && (
            <PreviewSecondaryPane
              rightPanelMode={rightPanelMode}
              pptStudioPaneWidth={pptStudioPaneWidth}
              isCompactPreviewLayout={isCompactPreviewLayout}
              onResize={handlePptStudioPanelResize}
              onReset={resetPptStudioPanelWidth}
              fullScreenContainerRef={containerRef}
              artifacts={allArtifacts}
              projectPath={currentThreadProjectPath ?? ''}
              threadId={threadId}
            />
          )}
          {shouldRenderSecondaryPane && rightPanelMode === 'outlinePreview' && (
            <OutlinePreviewSecondaryPane
              fullScreenContainerRef={containerRef}
              previewPaneWidth={pptStudioPaneWidth}
              isCompactPreviewLayout={isCompactPreviewLayout}
              onResize={handlePptStudioPanelResize}
              onReset={resetPptStudioPanelWidth}
            />
          )}
        </div>
      </div>
      <OfficeClawHub />
      <PptStudioBackgroundSync />
      <SecurityManagementModal open={showSecurityManagement} onClose={() => setShowSecurityManagement(false)} />
    </>
  );
}
