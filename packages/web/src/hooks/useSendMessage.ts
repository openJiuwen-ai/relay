/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useState } from 'react';
import { getMentionToAgentId } from '@/lib/mention-highlight';
import type { PptMessageContext } from '@/components/ppt-studio/ppt-studio-types';
import { sanitizeThreadTitleOrNull } from '@/components/thread-sidebar/thread-title';
import { useChatCommands } from '@/hooks/useChatCommands';
import type { DeliveryMode, WhisperOptions as SharedWhisperOptions } from '@/stores/chat-types';
import { type ChatMessage as ChatMessageData, useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

export type UploadStatus = 'idle' | 'uploading' | 'failed';
export type WhisperOptions = SharedWhisperOptions;

export interface MentionRef {
  catId: string;
  mention: string;
}

export interface SendMessageOptions {
  resumeAgentId?: string;
  interactiveAsk?: boolean;
  pptContext?: PptMessageContext;
  pptTemplateId?: string;
  mentionRefs?: MentionRef[];
  clientDraftId?: string;
  /** Callback for queue-mode send result. */
  onQueueResult?: (result: { status?: string; entryId?: string; merged?: boolean }) => void;
}

export interface UseSendMessageOptions {
  resetRefs?: () => void;
}

const AUTO_THREAD_TITLE_MAX_LENGTH = 30;
const AUTO_THREAD_TITLE_PLACEHOLDERS = new Set(['未命名会话', '未命名对话']);

function buildAutoThreadTitle(rawContent: string): string | null {
  const knownAliases = new Set(Object.keys(getMentionToAgentId()).map((alias) => alias.toLowerCase()));
  const sanitized = sanitizeThreadTitleOrNull(rawContent, knownAliases);
  if (!sanitized) return null;
  return sanitized.length > AUTO_THREAD_TITLE_MAX_LENGTH
    ? `${sanitized.slice(0, AUTO_THREAD_TITLE_MAX_LENGTH)}...`
    : sanitized;
}

function shouldAutoTitleThread(threadId: string, title: string | null | undefined): boolean {
  if (!threadId || threadId === 'default') return false;
  const trimmed = title?.trim() ?? '';
  return trimmed.length === 0 || AUTO_THREAD_TITLE_PLACEHOLDERS.has(trimmed);
}

/**
 * Hook for sending messages (text + optional attachments + optional whisper).
 * Handles both JSON and multipart form data modes.
 */
export function useSendMessage(activeThreadId?: string, options?: UseSendMessageOptions) {
  const {
    addMessage,
    addMessageToThread,
    removeMessage,
    removeThreadMessage,
    replaceThreadMessageId,
    updateThreadLastActive,
    setLoading,
    setHasActiveInvocation,
    setThreadLoading,
    setThreadHasActiveInvocation,
  } = useChatStore();
  const { processCommand } = useChatCommands();
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const resetRefs = options?.resetRefs;

  const maybeAutoTitleThread = useCallback(async (threadId: string, content: string) => {
    const nextTitle = buildAutoThreadTitle(content);
    if (!nextTitle) return;

    const store = useChatStore.getState();
    const thread = (store.threads ?? []).find((item) => item.id === threadId);

    if (!thread) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('office-claw:threads-refresh'));
      }
      return;
    }

    if (!shouldAutoTitleThread(threadId, thread.title)) return;

    store.updateThreadTitle(threadId, nextTitle);

    try {
      const res = await apiFetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      if (!res.ok) return;
      const updated = await res.json().catch(() => null);
      const resolvedTitle =
        typeof updated?.title === 'string' && updated.title.trim().length > 0 ? updated.title : nextTitle;
      useChatStore.getState().updateThreadTitle(threadId, resolvedTitle);
    } catch {
      // Keep optimistic title when persistence fails.
    }
  }, []);

  const createClientId = useCallback((): string => {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    const randomHex = (length: number) =>
      Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');

    return [
      randomHex(8),
      randomHex(4),
      `4${randomHex(3)}`,
      `${['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]}${randomHex(3)}`,
      randomHex(12),
    ].join('-');
  }, []);

  const handleSend = useCallback(
    async (
      content: string,
      images?: File[],
      overrideThreadId?: string,
      whisper?: WhisperOptions,
      deliveryMode?: DeliveryMode,
      sendOptions?: SendMessageOptions,
    ) => {
      const activeThread = activeThreadId ?? useChatStore.getState().currentThreadId;
      const threadId = overrideThreadId ?? activeThread;
      const hasAttachments = Boolean(images && images.length > 0);
      const isQueueSend = deliveryMode === 'queue';

      // Queue sends don't reset refs — cat is still streaming
      if (!isQueueSend) resetRefs?.();
      setUploadError(null);
      setUploadStatus(hasAttachments ? 'uploading' : 'idle');

      const wasCommand = await processCommand(content, threadId);
      if (wasCommand) return;

      const clientMessageId = createClientId();
      const optimisticMessageId = `user-${clientMessageId}`;
      const sentAt = Date.now();

      // Keep the sidebar order stable and responsive: sending in an old thread
      // should immediately bump that thread to the top before list refresh.
      updateThreadLastActive(threadId, sentAt);

      // Create user message
      const userMsg: ChatMessageData = {
        id: optimisticMessageId,
        type: 'user',
        content,
        timestamp: sentAt,
        ...(whisper ? { visibility: whisper.visibility, whisperTo: whisper.whisperTo } : {}),
      };
      if (images && images.length > 0) {
        userMsg.contentBlocks = [
          { type: 'text' as const, text: content },
          ...images.map((file) => {
            const previewUrl = URL.createObjectURL(file);
            if (file.type.startsWith('image/')) {
              return {
                type: 'image' as const,
                url: previewUrl,
              };
            }
            return {
              type: 'file' as const,
              url: previewUrl,
              fileName: file.name,
              mimeType: file.type,
              fileSize: file.size,
            };
          }),
        ];
      }
      // F117: Queue sends skip optimistic insert — bubble appears only on messages_delivered
      // (prevents queued message from showing in chat timeline before delivery)
      if (!isQueueSend) {
        if (threadId !== activeThread) {
          addMessageToThread(threadId, userMsg);
        } else {
          addMessage(userMsg);
        }
      }

      // F39: Queue sends don't flip loading/invocation flags — cat is already running,
      // and queue_updated WS event will surface the entry in QueuePanel.
      if (!isQueueSend) {
        if (threadId !== activeThread) {
          setThreadLoading(threadId, true);
          setThreadHasActiveInvocation(threadId, true);
        } else {
          setLoading(true);
          setHasActiveInvocation(true);
        }
      }

      const reconcileQueuedResponse = (
        body: { status?: string; userMessageId?: string; gameThreadId?: string } | null,
      ) => {
        // Game started in independent thread — remove optimistic message from source
        // and clear loading/invocation flags (game runs in its own thread, source is idle).
        // Always use thread-scoped APIs here: by the time the HTTP response arrives,
        // the user may have navigated to the game thread (via game:thread_created),
        // so the source thread may no longer be active. Thread-scoped APIs check
        // currentThreadId at call-time, correctly targeting flat or background state.
        if (body?.status === 'game_started' && body.gameThreadId) {
          removeThreadMessage(threadId, optimisticMessageId);
          setThreadLoading(threadId, false);
          setThreadHasActiveInvocation(threadId, false);
          return true;
        }
        if (body?.status !== 'queued' || isQueueSend) return false;
        if (threadId !== activeThread) {
          removeThreadMessage(threadId, optimisticMessageId);
        } else {
          removeMessage(optimisticMessageId);
        }
        return true;
      };

      const reconcileQueueFallbackToImmediate = (
        body: { status?: string; userMessageId?: string } | null,
      ): boolean => {
        // When frontend thinks thread is active, we send deliveryMode='queue'.
        // If backend already considers thread idle, it degrades to immediate processing.
        // Queue-mode sends skip optimistic insert, so we must add the bubble manually.
        if (!isQueueSend) return false;
        if (!body || body.status === 'queued' || body.status === 'duplicate' || body.status === 'game_started') {
          return false;
        }
        const persistedId = body.userMessageId?.trim();
        const fallbackMessage: ChatMessageData = persistedId ? { ...userMsg, id: persistedId } : userMsg;
        if (threadId !== activeThread) {
          addMessageToThread(threadId, fallbackMessage);
        } else {
          addMessage(fallbackMessage);
        }
        return true;
      };

      try {
        const deliveryModePayload = deliveryMode ? { deliveryMode } : {};

        if (images && images.length > 0) {
          const formData = new FormData();
          formData.append('content', content);
          formData.append('threadId', threadId);
          formData.append('idempotencyKey', clientMessageId);
          if (deliveryMode) formData.append('deliveryMode', deliveryMode);
          if (sendOptions?.resumeAgentId) formData.append('resumeAgentId', sendOptions.resumeAgentId);
          if (sendOptions?.interactiveAsk) {
            formData.append('interactive_ask', 'true');
          }
          if (sendOptions?.pptContext) formData.append('pptContext', JSON.stringify(sendOptions.pptContext));
          if (sendOptions?.pptTemplateId) formData.append('pptTemplateId', sendOptions.pptTemplateId);
          if (sendOptions?.mentionRefs?.length) {
            formData.append('mentionRefs', JSON.stringify(sendOptions.mentionRefs));
          }
          if (whisper) {
            formData.append('visibility', whisper.visibility);
            for (const agentId of whisper.whisperTo) {
              formData.append('whisperTo', agentId);
            }
          }
          for (const file of images) {
            formData.append(file.type.startsWith('image/') ? 'images' : 'attachments', file);
          }
          const res = await apiFetch('/api/messages', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.detail ?? `Server error: ${res.status}`);
          }
          const body = await res.json().catch(() => null);
          if (isQueueSend) {
            sendOptions?.onQueueResult?.({
              status: body?.status,
              entryId: body?.entryId,
              merged: body?.merged,
            });
          }
          const queueFallbackHandled = reconcileQueueFallbackToImmediate(body);
          if (!queueFallbackHandled && !reconcileQueuedResponse(body) && body?.userMessageId) {
            replaceThreadMessageId(threadId, optimisticMessageId, body.userMessageId);
          }
        } else {
          const res = await apiFetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content,
              threadId,
              idempotencyKey: clientMessageId,
              ...(whisper ? { visibility: whisper.visibility, whisperTo: whisper.whisperTo } : {}),
              ...deliveryModePayload,
              ...(sendOptions?.resumeAgentId ? { resumeAgentId: sendOptions.resumeAgentId } : {}),
              ...(sendOptions?.interactiveAsk ? { interactive_ask: true } : {}),
              ...(sendOptions?.pptContext ? { pptContext: sendOptions.pptContext } : {}),
              ...(sendOptions?.pptTemplateId ? { pptTemplateId: sendOptions.pptTemplateId } : {}),
              ...(sendOptions?.mentionRefs?.length ? { mentionRefs: sendOptions.mentionRefs } : {}),
            }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.detail ?? `Server error: ${res.status}`);
          }
          const body = await res.json().catch(() => null);
          if (isQueueSend) {
            sendOptions?.onQueueResult?.({
              status: body?.status,
              entryId: body?.entryId,
              merged: body?.merged,
            });
          }
          const queueFallbackHandled = reconcileQueueFallbackToImmediate(body);
          if (!queueFallbackHandled && !reconcileQueuedResponse(body) && body?.userMessageId) {
            replaceThreadMessageId(threadId, optimisticMessageId, body.userMessageId);
          }
        }
        await maybeAutoTitleThread(threadId, content);
        setUploadStatus('idle');
        setUploadError(null);
      } catch (err) {
        if (isQueueSend) {
          sendOptions?.onQueueResult?.({ status: 'failed' });
        }
        // F39: Only clear invocation flags for normal (non-queue, non-force) sends.
        // Queue sends never set them. Force sends target a thread where a cat is
        // already running — if the force request fails (network/server error), the
        // original invocation is still active; clearing flags would hide stop/queue UI.
        const shouldClearFlags = !isQueueSend && deliveryMode !== 'force';
        if (shouldClearFlags) {
          setThreadLoading(threadId, false);
          setThreadHasActiveInvocation(threadId, false);
        }
        const errorMessage = err instanceof Error ? err.message : 'Unknown';
        if (hasAttachments) {
          setUploadStatus('failed');
          setUploadError(errorMessage);
        } else {
          setUploadStatus('idle');
        }
        const errorMessagePayload: ChatMessageData = {
          id: `err-${Date.now()}`,
          type: 'system',
          variant: 'error',
          content: `Failed to send message: ${errorMessage}`,
          timestamp: Date.now(),
        };
        if (threadId !== activeThread) {
          addMessageToThread(threadId, errorMessagePayload);
        } else {
          addMessage(errorMessagePayload);
        }
      }
    },
    [
      resetRefs,
      processCommand,
      addMessage,
      addMessageToThread,
      removeMessage,
      removeThreadMessage,
      replaceThreadMessageId,
      updateThreadLastActive,
      setLoading,
      setHasActiveInvocation,
      setThreadLoading,
      setThreadHasActiveInvocation,
      activeThreadId,
      createClientId,
      maybeAutoTitleThread,
    ],
  );

  return { handleSend, uploadStatus, uploadError };
}
