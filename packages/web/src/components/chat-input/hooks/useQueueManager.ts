/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

﻿import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';

interface QueueMessageBlock {
  type: string;
  fileName?: string;
}

interface QueueMessage {
  id: string;
  contentBlocks?: QueueMessageBlock[];
}

interface ToastPayload {
  type: 'error' | 'success' | 'info';
  title: string;
  message: string;
  duration?: number;
}

interface UseQueueManagerParams {
  threadId?: string;
  hasActiveInvocation?: boolean;
  addToast: (toast: ToastPayload) => void;
}

export function useQueueManager({ threadId, hasActiveInvocation, addToast }: UseQueueManagerParams) {
  const setQueue = useChatStore((s) => s.setQueue);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const activeQueueThreadId = threadId ?? currentThreadId;

  const queue = useChatStore(
    useCallback(
      (s) => {
        if (!activeQueueThreadId || activeQueueThreadId === s.currentThreadId) return s.queue;
        return s.threadStates[activeQueueThreadId]?.queue ?? [];
      },
      [activeQueueThreadId],
    ),
  );

  const queueMessages = useChatStore(
    useCallback(
      (s) => {
        if (!activeQueueThreadId || activeQueueThreadId === s.currentThreadId) return s.messages as QueueMessage[];
        return (s.threadStates[activeQueueThreadId]?.messages ?? []) as QueueMessage[];
      },
      [activeQueueThreadId],
    ),
  );

  const queuedEntries = useMemo(() => queue.filter((entry) => entry.status === 'queued'), [queue]);
  const queueAttachmentNamesByEntryId = useMemo(() => {
    const messageById = new Map(queueMessages.map((msg) => [msg.id, msg] as const));
    const result: Record<string, string[]> = {};
    for (const entry of queuedEntries) {
      if (entry.attachmentNames && entry.attachmentNames.length > 0) {
        result[entry.id] = [...entry.attachmentNames];
        continue;
      }
      const ids = [entry.messageId, ...entry.mergedMessageIds].filter(Boolean) as string[];
      if (ids.length === 0) continue;
      const names: string[] = [];
      for (const msgId of ids) {
        const msg = messageById.get(msgId);
        const fileNames =
          msg?.contentBlocks
            ?.filter((block) => block.type === 'file')
            .map((block) => block.fileName)
            .filter(Boolean) ?? [];
        names.push(...fileNames);
      }
      if (names.length > 0) result[entry.id] = names;
    }
    return result;
  }, [queueMessages, queuedEntries]);

  const queueCount = queuedEntries.length;
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueHighlightedEntryId, setQueueHighlightedEntryId] = useState<string | null>(null);
  const queueHighlightTimerRef = useRef<number | null>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const previousQueueCountRef = useRef(queueCount);
  const previousQueueExpandedRef = useRef(queueExpanded);

  useEffect(() => {
    if (hasActiveInvocation && queueCount > 0) setQueueExpanded(true);
  }, [hasActiveInvocation, queueCount]);

  useEffect(() => {
    const queueCountIncreased = queueCount > previousQueueCountRef.current;
    const queueJustExpanded = queueExpanded && !previousQueueExpandedRef.current;
    if (queueExpanded && (queueCountIncreased || queueJustExpanded)) {
      const listEl = queueListRef.current;
      if (listEl) {
        requestAnimationFrame(() => {
          listEl.scrollTop = listEl.scrollHeight;
        });
      }
    }
    previousQueueCountRef.current = queueCount;
    previousQueueExpandedRef.current = queueExpanded;
  }, [queueCount, queueExpanded]);

  useEffect(
    () => () => {
      if (queueHighlightTimerRef.current !== null) window.clearTimeout(queueHighlightTimerRef.current);
    },
    [],
  );

  const highlightQueueEntry = useCallback((entryId: string) => {
    setQueueHighlightedEntryId(entryId);
    if (queueHighlightTimerRef.current !== null) window.clearTimeout(queueHighlightTimerRef.current);
    queueHighlightTimerRef.current = window.setTimeout(() => {
      setQueueHighlightedEntryId(null);
      queueHighlightTimerRef.current = null;
    }, 900);
  }, []);

  const persistQueuePromote = useCallback(
    async (entryId: string) => {
      if (!activeQueueThreadId) throw new Error('队列线程不存在');
      const res = await apiFetch(`/api/threads/${activeQueueThreadId}/queue/${entryId}/steer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'promote' }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? '置顶失败');
      }
    },
    [activeQueueThreadId],
  );

  const applyLocalQueueReorder = useCallback(
    (sourceIndex: number, targetIndex: number) => {
      if (sourceIndex === targetIndex) return;
      const nextQueued = [...queuedEntries];
      const [moved] = nextQueued.splice(sourceIndex, 1);
      if (!moved) return;
      nextQueued.splice(targetIndex, 0, moved);
      const queuedOrder = new Map(nextQueued.map((entry, idx) => [entry.id, idx]));
      const nextQueue = [...queue].sort((a, b) => {
        const aOrder = queuedOrder.get(a.id);
        const bOrder = queuedOrder.get(b.id);
        if (aOrder == null && bOrder == null) return 0;
        if (aOrder == null) return 1;
        if (bOrder == null) return -1;
        return aOrder - bOrder;
      });
      setQueue(activeQueueThreadId, nextQueue);
    },
    [activeQueueThreadId, queue, queuedEntries, setQueue],
  );

  const handleQueueDelete = useCallback(
    async (entryId: string) => {
      if (!activeQueueThreadId) return;
      const prevQueue = queue;
      setQueue(activeQueueThreadId, prevQueue.filter((entry) => entry.id !== entryId));
      try {
        const res = await apiFetch(`/api/threads/${activeQueueThreadId}/queue/${entryId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
      } catch {
        setQueue(activeQueueThreadId, prevQueue);
        addToast({ type: 'error', title: '删除失败', message: '队列消息删除失败，请重试', duration: 2400 });
      }
    },
    [activeQueueThreadId, addToast, queue, setQueue],
  );

  const handleQueueExtractForEdit = useCallback(
    async (entryId: string) => {
      if (!activeQueueThreadId) return null;
      const queuedEntry = queuedEntries.find((entry) => entry.id === entryId);
      if (!queuedEntry || queuedEntry.status !== 'queued') return null;
      const prevQueue = queue;
      setQueue(activeQueueThreadId, prevQueue.filter((entry) => entry.id !== entryId));
      try {
        const res = await apiFetch(`/api/threads/${activeQueueThreadId}/queue/${entryId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('删除失败');
        return queuedEntry;
      } catch {
        setQueue(activeQueueThreadId, prevQueue);
        addToast({ type: 'error', title: '编辑失败', message: '队列消息提取失败，请重试', duration: 2400 });
        return null;
      }
    },
    [activeQueueThreadId, addToast, queue, queuedEntries, setQueue],
  );

  const handleQueueClear = useCallback(async () => {
    if (!activeQueueThreadId) return;
    if (queuedEntries.length === 0) return;
    const prevQueue = queue;
    setQueue(activeQueueThreadId, queue.filter((entry) => entry.status !== 'queued'));
    try {
      const res = await apiFetch(`/api/threads/${activeQueueThreadId}/queue`, { method: 'DELETE' });
      if (!res.ok) throw new Error('清空失败');
    } catch {
      setQueue(activeQueueThreadId, prevQueue);
      addToast({ type: 'error', title: '清空失败', message: '队列清空失败，请重试', duration: 2400 });
    }
  }, [activeQueueThreadId, addToast, queue, queuedEntries.length, setQueue]);

  const handleQueuePinToTop = useCallback(
    async (entryId: string) => {
      if (!activeQueueThreadId) return;
      const sourceIndex = queuedEntries.findIndex((entry) => entry.id === entryId);
      if (sourceIndex <= 0) return;
      const prevQueue = queue;
      applyLocalQueueReorder(sourceIndex, 0);
      setQueueBusy(true);
      try {
        await persistQueuePromote(entryId);
        highlightQueueEntry(entryId);
      } catch (error) {
        setQueue(activeQueueThreadId, prevQueue);
        addToast({
          type: 'error',
          title: '置顶失败',
          message: error instanceof Error ? error.message : '队列置顶失败，请重试',
          duration: 2400,
        });
      } finally {
        setQueueBusy(false);
      }
    },
    [activeQueueThreadId, addToast, applyLocalQueueReorder, highlightQueueEntry, persistQueuePromote, queue, queuedEntries, setQueue],
  );

  const handleQueueMoveToIndex = useCallback(
    async (entryId: string, targetIndex: number) => {
      if (!activeQueueThreadId) return;
      const sourceIndex = queuedEntries.findIndex((entry) => entry.id === entryId);
      if (sourceIndex < 0) return;
      const maxIndex = Math.max(0, queuedEntries.length - 1);
      const clampedTarget = Math.max(0, Math.min(targetIndex, maxIndex));
      if (sourceIndex === clampedTarget) return;
      const prevQueue = queue;
      applyLocalQueueReorder(sourceIndex, clampedTarget);
      setQueueBusy(true);
      try {
        const direction = clampedTarget < sourceIndex ? 'up' : 'down';
        const steps = Math.abs(clampedTarget - sourceIndex);
        for (let i = 0; i < steps; i += 1) {
          const res = await apiFetch(`/api/threads/${activeQueueThreadId}/queue/${entryId}/move`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction }),
          });
          if (!res.ok) {
            const payload = await res.json().catch(() => null);
            throw new Error(payload?.error ?? '重排失败');
          }
        }
      } catch (error) {
        setQueue(activeQueueThreadId, prevQueue);
        addToast({
          type: 'error',
          title: '重排失败',
          message: error instanceof Error ? error.message : '队列重排失败，请重试',
          duration: 2400,
        });
      } finally {
        setQueueBusy(false);
      }
    },
    [activeQueueThreadId, addToast, applyLocalQueueReorder, queue, queuedEntries, setQueue],
  );

  return {
    activeQueueThreadId,
    queue,
    queuedEntries,
    queueAttachmentNamesByEntryId,
    queueCount,
    queueExpanded,
    setQueueExpanded,
    queueBusy,
    queueHighlightedEntryId,
    queueListRef,
    handleQueueDelete,
    handleQueueExtractForEdit,
    handleQueueClear,
    handleQueuePinToTop,
    handleQueueMoveToIndex,
  };
}
