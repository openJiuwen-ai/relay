/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { recordDebugEvent } from '@/debug/invocationEventDebug';
import { getAgentErrorToastContent } from '@/hooks/agent-error-fallback';
import { getCachedAgents } from '@/hooks/useAgentData';
import type { AgentStatusType } from '@/stores/chat-types';
import type {
  ActiveRoutedAgentMessage,
  BackgroundAgentMessage,
  BackgroundStreamRef,
  HandleBackgroundMessageOptions,
} from './useSocket-background.types';
import { isSchedulerPlaceholderMessage } from './scheduler-placeholder';
import { consumeBackgroundSystemInfo } from './useSocket-background-system-info';

export type {
  ActiveRoutedAgentMessage,
  BackgroundAgentMessage,
  BackgroundStoreLike,
  BackgroundStreamRef,
  BackgroundToastInput,
  HandleBackgroundMessageOptions,
} from './useSocket-background.types';

const STATUS_MAP: Record<string, AgentStatusType> = {
  streaming: 'streaming',
  thinking: 'pending',
  done: 'done',
};

function getStreamKey(msg: Pick<BackgroundAgentMessage, 'threadId' | 'agentId'>): string {
  return `${msg.threadId}::${msg.agentId}`;
}

function resolveAgentDisplayLabel(agentId: string): string {
  return getCachedAgents().find((row) => row.id === agentId)?.displayName ?? agentId;
}

function buildMessageExtra(
  msg: Pick<BackgroundAgentMessage, 'extra'>,
  invocationId?: string | null,
): NonNullable<import('@/stores/chat-types').ChatMessage['extra']> | undefined {
  const extra = {
    ...(msg.extra?.crossPost ? { crossPost: msg.extra.crossPost } : {}),
    ...(msg.extra?.errorFallback ? { errorFallback: msg.extra.errorFallback } : {}),
    ...(invocationId ? { stream: { invocationId } } : {}),
  };
  return Object.keys(extra).length > 0 ? extra : undefined;
}

function getErrorFallback(
  msg: Pick<BackgroundAgentMessage, 'extra'>,
  finalMessage?: { extra?: { errorFallback?: { rawError?: string } } },
): { rawError: string } | null {
  const fb = msg.extra?.errorFallback ?? finalMessage?.extra?.errorFallback;
  if (!fb?.rawError) return null;
  return { rawError: fb.rawError };
}

function findLatestActiveInvocationIdForAgent(
  activeInvocations: Record<string, { agentId: string; mode: string }> | undefined,
  agentId: string,
): string | undefined {
  if (!activeInvocations) return undefined;
  const entries = Object.entries(activeInvocations);
  for (let i = entries.length - 1; i >= 0; i--) {
    const [invocationId, info] = entries[i]!;
    if (info.agentId === agentId) return invocationId;
  }
  return undefined;
}

function shouldClearBackgroundRefOnActiveEvent(msg: ActiveRoutedAgentMessage): boolean {
  if (!msg.threadId) return false;
  if (msg.type === 'done') return true;
  if (msg.type === 'error') return msg.isFinal === true;
  if (msg.type === 'text' && msg.isFinal) return true;
  return false;
}

function getThreadInvocationId(
  msg: Pick<BackgroundAgentMessage, 'threadId' | 'agentId'>,
  options: HandleBackgroundMessageOptions,
): string | undefined {
  const threadState = options.store.getThreadState(msg.threadId);
  return (
    threadState.agentInvocations[msg.agentId]?.invocationId ??
    findLatestActiveInvocationIdForAgent(threadState.activeInvocations, msg.agentId)
  );
}

export function clearBackgroundStreamRefForActiveEvent(
  msg: ActiveRoutedAgentMessage,
  bgStreamRefs: Map<string, BackgroundStreamRef>,
): void {
  if (!shouldClearBackgroundRefOnActiveEvent(msg) || !msg.threadId) return;
  bgStreamRefs.delete(`${msg.threadId}::${msg.agentId}`);
}

function stopTrackedStream(
  streamKey: string,
  msg: BackgroundAgentMessage,
  options: HandleBackgroundMessageOptions,
): BackgroundStreamRef | undefined {
  const existing = options.bgStreamRefs.get(streamKey);
  if (!existing) return undefined;
  options.store.setThreadMessageStreaming(msg.threadId, existing.id, false);
  // #586 follow-up: Record finalized bubble ID so callback can find it
  // after bgStreamRefs is cleared and isStreaming is false.
  options.finalizedBgRefs.set(streamKey, existing.id);
  options.bgStreamRefs.delete(streamKey);
  return existing;
}

function markBackgroundErrorToastShown(streamKey: string, options: HandleBackgroundMessageOptions): void {
  options.backgroundErrorToastsShown.add(streamKey);
}

function hasShownBackgroundErrorToast(streamKey: string, options: HandleBackgroundMessageOptions): boolean {
  return options.backgroundErrorToastsShown.has(streamKey);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function safeJsonPreview(value: unknown, maxLength: number): string {
  try {
    return truncate(JSON.stringify(value), maxLength);
  } catch {
    return '[unserializable input]';
  }
}

function toolUseDetail(toolName: string | undefined, toolInput: unknown): string | undefined {
  if (toolInput === null || toolInput === undefined) return undefined;
  if (toolName === 'send_file_to_user') {
    try {
      return JSON.stringify(toolInput);
    } catch {
      return safeJsonPreview(toolInput, 200);
    }
  }
  return safeJsonPreview(toolInput, 200);
}

function addBackgroundSystemMessage(
  msg: BackgroundAgentMessage,
  options: HandleBackgroundMessageOptions,
  content: string,
  variant: 'info' | 'warning' | 'a2a_followup' = 'info',
): void {
  options.store.addMessageToThread(msg.threadId, {
    id: `bg-sys-${msg.timestamp}-${msg.agentId}-${options.nextBgSeq()}`,
    type: 'system',
    variant,
    agentId: msg.agentId,
    content,
    timestamp: msg.timestamp,
  });
}

/**
 * Recover an existing streaming assistant message from the thread state.
 * This handles the active→background transition: when the user switches threads,
 * activeRefs are cleared but the streaming message still exists in the store.
 * Instead of creating a duplicate bubble, we adopt the existing one into bgStreamRefs.
 */
function recoverStreamingMessage(
  msg: BackgroundAgentMessage,
  streamKey: string,
  options: HandleBackgroundMessageOptions,
): string | undefined {
  const threadMessages = options.store.getThreadState(msg.threadId).messages;
  for (let i = threadMessages.length - 1; i >= 0; i--) {
    const m = threadMessages[i];
    if (m.type === 'assistant' && m.agentId === msg.agentId && m.isStreaming) {
      options.bgStreamRefs.set(streamKey, { id: m.id, threadId: msg.threadId, agentId: msg.agentId });
      recordDebugEvent({
        event: 'bubble_lifecycle',
        threadId: msg.threadId,
        timestamp: msg.timestamp,
        action: 'recover',
        reason: 'background_ref_lost',
        agentId: msg.agentId,
        messageId: m.id,
        invocationId: m.extra?.stream?.invocationId,
        origin: 'stream',
      });
      return m.id;
    }
  }
  return undefined;
}

function findBackgroundCallbackReplacementTarget(
  msg: BackgroundAgentMessage,
  options: HandleBackgroundMessageOptions,
): { id: string; invocationId: string | null } | null {
  const invocationId = msg.invocationId ?? getThreadInvocationId(msg, options);

  const threadMessages = options.store.getThreadState(msg.threadId).messages;

  // Try invocationId-based match first
  if (invocationId) {
    for (let i = threadMessages.length - 1; i >= 0; i -= 1) {
      const m = threadMessages[i];
      if (
        m?.type === 'assistant' &&
        m.agentId === msg.agentId &&
        m.origin === 'stream' &&
        m.extra?.stream?.invocationId === invocationId
      ) {
        return { id: m.id, invocationId };
      }
    }
  }

  // #586 Bug 1: Fallback — find invocationless stream placeholder from the same agent.
  // Background system-info creates bg-rich/bg-think placeholders without invocationId;
  // without this fallback, callback creates a duplicate bubble alongside the placeholder.
  // #586 P1-2 fix: Return real invocationId (may be null) — callers must guard
  // against null before writing to replacedInvocations. Using a pseudo ID would
  // cause shouldSuppressLateBackgroundStreamChunk to permanently drop future
  // invocationless stream chunks.
  // First pass: actively-streaming invocationless placeholder
  for (let i = threadMessages.length - 1; i >= 0; i -= 1) {
    const m = threadMessages[i];
    if (
      m?.type === 'assistant' &&
      m.agentId === msg.agentId &&
      m.origin === 'stream' &&
      m.isStreaming &&
      !m.extra?.stream?.invocationId
    ) {
      return { id: m.id, invocationId: invocationId ?? null };
    }
  }
  // #586 follow-up: Check finalizedBgRefs — the done handler records the exact
  // message ID of the just-finalized stream bubble. This avoids the greedy scan
  // that could match arbitrary historical messages (P1 from review).
  const streamKey = `${msg.threadId}::${msg.agentId}`;
  const finalizedId = options.finalizedBgRefs.get(streamKey);
  if (finalizedId) {
    const finalized = threadMessages.find(
      (m) => m.id === finalizedId && m.type === 'assistant' && m.agentId === msg.agentId && m.origin === 'stream',
    );
    if (finalized) {
      return { id: finalized.id, invocationId: invocationId ?? null };
    }
  }

  return null;
}

function shouldSuppressLateBackgroundStreamChunk(
  msg: BackgroundAgentMessage,
  streamKey: string,
  options: HandleBackgroundMessageOptions,
): boolean {
  const replacedInvocationId = options.replacedInvocations.get(streamKey);
  if (!replacedInvocationId) return false;

  const currentInvocationId = msg.invocationId ?? getThreadInvocationId(msg, options);
  if (currentInvocationId && currentInvocationId !== replacedInvocationId) {
    options.replacedInvocations.delete(streamKey);
    return false;
  }

  recordDebugEvent({
    event: 'bubble_lifecycle',
    threadId: msg.threadId,
    timestamp: msg.timestamp,
    action: 'drop',
    reason: 'late_stream_after_callback_replace',
    agentId: msg.agentId,
    invocationId: replacedInvocationId,
    origin: 'stream',
  });
  return true;
}

function ensureBackgroundAssistantMessage(
  msg: BackgroundAgentMessage,
  streamKey: string,
  existing: BackgroundStreamRef | undefined,
  options: HandleBackgroundMessageOptions,
): string {
  if (existing?.id) {
    if (msg.metadata) {
      options.store.setThreadMessageMetadata(msg.threadId, existing.id, msg.metadata);
    }
    return existing.id;
  }

  // Active→background transition recovery: find existing streaming bubble
  const recoveredId = recoverStreamingMessage(msg, streamKey, options);
  if (recoveredId) {
    if (msg.metadata) {
      options.store.setThreadMessageMetadata(msg.threadId, recoveredId, msg.metadata);
    }
    return recoveredId;
  }

  const messageId = `bg-tool-${msg.timestamp}-${msg.agentId}-${options.nextBgSeq()}`;
  const invocationId = getThreadInvocationId(msg, options);
  options.bgStreamRefs.set(streamKey, { id: messageId, threadId: msg.threadId, agentId: msg.agentId });
  options.store.addMessageToThread(msg.threadId, {
    id: messageId,
    type: 'assistant',
    agentId: msg.agentId,
    content: '',
    ...(msg.metadata ? { metadata: msg.metadata } : {}),
    ...(invocationId ? { extra: { stream: { invocationId } } } : {}),
    timestamp: msg.timestamp,
    isStreaming: true,
    origin: 'stream',
  });
  return messageId;
}

function markThreadInvocationActive(msg: BackgroundAgentMessage, options: HandleBackgroundMessageOptions): void {
  const threadState = options.store.getThreadState(msg.threadId);
  if (!threadState.isLoading) {
    options.store.setThreadLoading(msg.threadId, true);
  }
  // F108: slot-aware — register specific invocation if ID available
  if (msg.invocationId) {
    options.store.addThreadActiveInvocation(msg.threadId, msg.invocationId, msg.agentId, 'execute');
  } else if (!threadState.hasActiveInvocation) {
    options.store.setThreadHasActiveInvocation(msg.threadId, true);
  }
}

function markThreadInvocationComplete(msg: BackgroundAgentMessage, options: HandleBackgroundMessageOptions): void {
  options.store.setThreadLoading(msg.threadId, false);
  options.store.setThreadAgentInvocation(msg.threadId, msg.agentId, { invocationId: undefined });
  // F108: slot-aware — remove specific invocation if ID available.
  // Cancel fallback: find and remove only this agent's latest active slot to avoid
  // clearing other agents' slots during concurrent dispatch.
  if (msg.invocationId) {
    options.store.removeThreadActiveInvocation(msg.threadId, msg.invocationId);
  } else {
    const threadState = options.store.getThreadState(msg.threadId);
    const activeInvocationSlot = findLatestActiveInvocationIdForAgent(threadState.activeInvocations, msg.agentId);
    if (activeInvocationSlot) {
      options.store.removeThreadActiveInvocation(msg.threadId, activeInvocationSlot);
    } else {
      options.store.setThreadHasActiveInvocation(msg.threadId, false);
    }
  }
}

export function handleBackgroundAgentMessage(
  msg: BackgroundAgentMessage,
  options: HandleBackgroundMessageOptions,
): void {
  if (isSchedulerPlaceholderMessage(msg)) {
    return;
  }

  const streamKey = getStreamKey(msg);
  const existing = options.bgStreamRefs.get(streamKey);

  if (msg.type === 'text' && msg.content) {
    const isCallbackText = msg.origin === 'callback';
    if (!isCallbackText) {
      markThreadInvocationActive(msg, options);
    }
    // Track the final message ID for toast preview (must capture before deleting bgStreamRefs)
    let finalMsgId: string | undefined;

    if (msg.origin === 'callback') {
      const replacementTarget = findBackgroundCallbackReplacementTarget(msg, options);
      if (replacementTarget) {
        const cbId = msg.messageId ?? replacementTarget.id;
        if (cbId !== replacementTarget.id) {
          options.store.replaceThreadMessageId(msg.threadId, replacementTarget.id, cbId);
        }
        options.store.patchThreadMessage(msg.threadId, cbId, {
          content: msg.content,
          origin: 'callback',
          isStreaming: false,
          ...(msg.metadata ? { metadata: msg.metadata } : {}),
          ...(buildMessageExtra(msg, replacementTarget.invocationId)
            ? { extra: buildMessageExtra(msg, replacementTarget.invocationId) }
            : {}),
          ...(msg.mentionsUser ? { mentionsUser: true } : {}),
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
        });
        options.bgStreamRefs.delete(streamKey);
        // Consume finalized ref — callback successfully replaced
        options.finalizedBgRefs.delete(streamKey);
        // #586 P1-2 fix: Only set replacedInvocations when we have a real invocationId.
        // Fallback matches return null — writing a pseudo ID would permanently suppress
        // future invocationless stream chunks via shouldSuppressLateBackgroundStreamChunk.
        if (replacementTarget.invocationId) {
          options.replacedInvocations.set(streamKey, replacementTarget.invocationId);
        }
        finalMsgId = cbId;
      } else {
        const cbId = msg.messageId ?? `bg-cb-${msg.timestamp}-${msg.agentId}-${options.nextBgSeq()}`;
        const bgInvocationId = msg.invocationId ?? getThreadInvocationId(msg, options);
        options.store.addMessageToThread(msg.threadId, {
          id: cbId,
          type: 'assistant',
          agentId: msg.agentId,
          content: msg.content,
          ...(msg.metadata ? { metadata: msg.metadata } : {}),
          ...(buildMessageExtra(msg, bgInvocationId) ? { extra: buildMessageExtra(msg, bgInvocationId) } : {}),
          ...(msg.mentionsUser ? { mentionsUser: true } : {}),
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
          timestamp: msg.timestamp,
          origin: 'callback',
        });
        // #586 Bug 1 (TD112): Callback created new bubble without finding a stream
        // placeholder. Mark invocation as replaced so late background stream chunks
        // are suppressed instead of spawning a duplicate bubble.
        if (bgInvocationId) {
          options.replacedInvocations.set(streamKey, bgInvocationId);
        }
        finalMsgId = cbId;
      }
    } else {
      if (shouldSuppressLateBackgroundStreamChunk(msg, streamKey, options)) {
        return;
      }
      // CLI stream text (thinking): merge into existing stream bubble
      let messageId = existing?.id;
      // Active→background transition recovery: find existing streaming bubble
      if (!messageId) {
        messageId = recoverStreamingMessage(msg, streamKey, options);
      }
      if (messageId) {
        const errorFallback = getErrorFallback(msg);
        // HOT PATH: batch content + metadata + streaming + catStatus into ONE set()
        // to prevent React update-depth overflow during high-frequency streaming.
        options.store.batchStreamChunkUpdate({
          threadId: msg.threadId,
          messageId,
          agentId: msg.agentId,
          content: msg.content,
          metadata: msg.metadata,
          streaming: !msg.isFinal,
          nextAgentStatus: errorFallback ? 'error' : msg.isFinal ? 'done' : 'streaming',
        });
        if (msg.replyTo || msg.replyPreview || errorFallback) {
          options.store.patchThreadMessage(msg.threadId, messageId, {
            ...(buildMessageExtra(msg) ? { extra: buildMessageExtra(msg) } : {}),
            ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
            ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
          });
        }
        if (msg.isFinal) {
          options.bgStreamRefs.delete(streamKey);
        }
      } else {
        messageId = `bg-${msg.timestamp}-${msg.agentId}-${options.nextBgSeq()}`;
        const invocationId = getThreadInvocationId(msg, options);
        options.bgStreamRefs.set(streamKey, { id: messageId, threadId: msg.threadId, agentId: msg.agentId });
        options.store.addMessageToThread(msg.threadId, {
          id: messageId,
          type: 'assistant',
          agentId: msg.agentId,
          content: msg.content,
          ...(msg.metadata ? { metadata: msg.metadata } : {}),
          ...(buildMessageExtra(msg, invocationId) ? { extra: buildMessageExtra(msg, invocationId) } : {}),
          ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
          ...(msg.replyPreview ? { replyPreview: msg.replyPreview } : {}),
          timestamp: msg.timestamp,
          isStreaming: !msg.isFinal,
          origin: 'stream',
        });
        // Cat status for new message (not batched — fires once per stream start)
        options.store.updateThreadAgentStatus(
          msg.threadId,
          msg.agentId,
          msg.extra?.errorFallback ? 'error' : msg.isFinal ? 'done' : 'streaming',
        );
        if (msg.isFinal) {
          options.bgStreamRefs.delete(streamKey);
        }
      }

      finalMsgId = messageId;
    }

    // Callback-only: update agent status on isFinal (non-callback handled by batch/new-message above)
    const errorFallback = getErrorFallback(msg);
    if (isCallbackText && msg.isFinal) {
      options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, errorFallback ? 'error' : 'done');
    }
    if (msg.isFinal) {
      // #80 fix-C: Clear timeout guard for text(isFinal) path
      options.clearDoneTimeout?.(msg.threadId);
      const finalMessage = finalMsgId
        ? options.store.getThreadState(msg.threadId).messages.find((m) => m.id === finalMsgId)
        : undefined;
      const preview = finalMessage?.content ?? msg.content;
      const agentLabel = resolveAgentDisplayLabel(msg.agentId);
      markThreadInvocationComplete(msg, options);

      // 任务完成通知（C#侧判断窗口状态）
      const notificationType = errorFallback ? 'error' : 'success';
      const notificationTitle = errorFallback ? `${agentLabel} 出错` : `${agentLabel} 完成`;
      const notificationBody = preview.slice(0, 80) + (preview.length > 80 ? '...' : '');
      options.notifyTaskComplete?.(notificationTitle, notificationBody, notificationType, msg.threadId);

      if (errorFallback) {
        const toast = getAgentErrorToastContent({
          agentId: msg.agentId,
          agentDisplayName: agentLabel,
          error: errorFallback.rawError,
          errorCode: msg.errorCode,
        });
        options.addToast({
          type: 'error',
          title: toast.title,
          message: preview || toast.message,
          threadId: msg.threadId,
          threadTitle: options.getThreadTitle?.(msg.threadId) ?? undefined,
          duration: 8000,
        });
        markBackgroundErrorToastShown(streamKey, options);
        return;
      }
      options.addToast({
        type: 'success',
        title: `${agentLabel} 完成`,
        message: preview.slice(0, 80) + (preview.length > 80 ? '...' : ''),
        threadId: msg.threadId,
        threadTitle: options.getThreadTitle?.(msg.threadId) ?? undefined,
        duration: 5000,
      });
    }
    return;
  }

  if (msg.type === 'error') {
    console.warn('[useSocket-background] Received raw error event in background:', {
      agentId: msg.agentId,
      threadId: msg.threadId,
    });

    markThreadInvocationActive(msg, options);
    stopTrackedStream(streamKey, msg, options);

    recordDebugEvent({
      event: 'agent_message',
      threadId: msg.threadId,
      timestamp: msg.timestamp,
      agentId: msg.agentId,
      invocationId: msg.invocationId,
      reason: msg.error ?? 'Unknown error',
      action: 'error_fallback_background_degradation',
      origin: msg.origin,
    });

    options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, 'error');

    if (msg.isFinal) {
      options.clearDoneTimeout?.(msg.threadId);
      markThreadInvocationComplete(msg, options);
      const agentLabel = resolveAgentDisplayLabel(msg.agentId);
      options.notifyTaskComplete?.(`${agentLabel} 出错`, msg.error ?? 'Unknown error', 'error', msg.threadId);
    }

    // Toast 通知（降级）
    const toast = getAgentErrorToastContent({
      ...msg,
      agentDisplayName: resolveAgentDisplayLabel(msg.agentId),
    });
    options.addToast({
      type: 'error',
      title: toast.title,
      message: toast.message,
      threadId: msg.threadId,
      threadTitle: options.getThreadTitle?.(msg.threadId) ?? undefined,
      duration: 8000,
    });
    markBackgroundErrorToastShown(streamKey, options);
    return;
  }

  if (msg.type === 'done') {
    stopTrackedStream(streamKey, msg, options);
    const currentStatus = options.store.getThreadState(msg.threadId).agentStatuses[msg.agentId];
    const latestAssistantMessage = options.store
      .getThreadState(msg.threadId)
      .messages.filter((m) => m.type === 'assistant' && m.agentId === msg.agentId)
      .at(-1);
    const messageErrorFallback = latestAssistantMessage?.extra?.errorFallback;
    const agentLabel = resolveAgentDisplayLabel(msg.agentId);

    if (String(currentStatus) === 'error' || messageErrorFallback) {
      options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, 'error');
      options.notifyTaskComplete?.(
        `${agentLabel} 出错`,
        latestAssistantMessage?.content ?? 'Unknown error',
        'error',
        msg.threadId,
      );
      if (String(currentStatus) !== 'error' && messageErrorFallback && !hasShownBackgroundErrorToast(streamKey, options)) {
        const toast = getAgentErrorToastContent({
          agentId: msg.agentId,
          agentDisplayName: agentLabel,
          error: messageErrorFallback.rawError,
          errorCode: msg.errorCode,
        });
        options.addToast({
          type: 'error',
          title: toast.title,
          message: latestAssistantMessage?.content || toast.message,
          threadId: msg.threadId,
          threadTitle: options.getThreadTitle?.(msg.threadId) ?? undefined,
          duration: 8000,
        });
        markBackgroundErrorToastShown(streamKey, options);
      }
      options.backgroundErrorToastsShown.delete(streamKey);
      if (msg.isFinal) {
        options.clearDoneTimeout?.(msg.threadId);
        markThreadInvocationComplete(msg, options);
      }
      return;
    }
    if (String(currentStatus) !== 'error') {
      options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, 'done');
      options.notifyTaskComplete?.(`${agentLabel} 完成`, `${agentLabel} 已完成处理`, 'success', msg.threadId);
      options.addToast({
        type: 'success',
        title: `${agentLabel} 完成`,
        message: `${agentLabel} 已完成处理`,
        threadId: msg.threadId,
        threadTitle: options.getThreadTitle?.(msg.threadId) ?? undefined,
        duration: 5000,
      });
    }
    options.backgroundErrorToastsShown.delete(streamKey);
    if (msg.isFinal) {
      options.clearDoneTimeout?.(msg.threadId);
      markThreadInvocationComplete(msg, options);
    }
    return;
  }

  if (msg.type === 'status') {
    const mapped = STATUS_MAP[msg.content ?? ''] ?? 'streaming';
    options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, mapped);
    return;
  }

  if (msg.type === 'tool_use') {
    markThreadInvocationActive(msg, options);
    const toolName = msg.toolName ?? 'unknown';
    const detail = toolUseDetail(toolName, msg.toolInput);
    const messageId = ensureBackgroundAssistantMessage(msg, streamKey, existing, options);
    options.store.appendToolEventToThread(msg.threadId, messageId, {
      id: msg.toolCallId ?? `bg-tool-use-${msg.timestamp}-${options.nextBgSeq()}`,
      type: 'tool_use',
      label: `${msg.agentId} → ${toolName}`,
      ...(detail ? { detail } : {}),
      ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
      timestamp: msg.timestamp,
    });
    options.store.setThreadMessageStreaming(msg.threadId, messageId, true);
    options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, 'streaming');
    return;
  }

  if (msg.type === 'tool_result') {
    markThreadInvocationActive(msg, options);
    const messageId = ensureBackgroundAssistantMessage(msg, streamKey, existing, options);
    options.store.appendToolEventToThread(msg.threadId, messageId, {
      id: msg.toolCallId ?? `bg-tool-result-${msg.timestamp}-${options.nextBgSeq()}`,
      type: 'tool_result',
      label: `${msg.agentId} ← result`,
      detail: msg.content ?? '',
      ...(msg.toolCallId ? { toolCallId: msg.toolCallId } : {}),
      timestamp: msg.timestamp,
    });
    options.store.setThreadMessageStreaming(msg.threadId, messageId, true);
    options.store.updateThreadAgentStatus(msg.threadId, msg.agentId, 'streaming');
    return;
  }

  if (msg.type === 'system_info') {
    if (!msg.content) return;

    const result = consumeBackgroundSystemInfo(msg, existing, options);
    if (!result.consumed) {
      addBackgroundSystemMessage(msg, options, result.content, result.variant);
    }
  }
}
