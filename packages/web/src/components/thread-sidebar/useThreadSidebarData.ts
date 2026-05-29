/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuthorizationPendingStore } from '@/stores/authorizationPendingStore';
import type { ThreadState } from '@/stores/chat-types';
import { type Thread, useChatStore } from '@/stores/chatStore';
import { API_URL, apiFetch } from '@/utils/api-client';
import { getUserId } from '@/utils/userId';
import { FILTER_OPTION_LABELS, MAX_SIDEBAR_RESTORE_FRAMES, type ThreadFilterOption } from './thread-sidebar-constants';
import {
  getThreadLastActiveAtMs,
  normalizeThreadSearchQuery,
  readSidebarScrollTop,
  writeSidebarScrollTop,
} from './thread-sidebar-utils';
import { normalizeStoredThreadTitleOrNull } from './thread-title';
import { getProjectPaths, type ThreadGroup } from './thread-utils';
import { useCollapseState } from './useCollapseState';
import { useProjectPins } from './useProjectPins';

export interface UseThreadSidebarDataParams {
  searchQuery: string;
  filterOption: ThreadFilterOption;
}

export interface UseThreadSidebarDataResult {
  pathname: string;
  threads: Thread[];
  currentThreadId: string;
  isLoadingThreads: boolean;
  getThreadState: (threadId: string) => ThreadState | undefined;
  scrollRegionRef: RefObject<HTMLDivElement>;
  normalizedQuery: string;
  displayThreadGroups: ThreadGroup[];
  collapsedThreadItems: Thread[];
  showNoResults: boolean;
  activeThreadIdFromRoute: string | null;
  existingProjects: string[];
  govHealth: Record<string, string>;
  pinnedProjects: Set<string>;
  isCollapsed: (groupKey: string) => boolean;
  toggleGroup: (groupKey: string) => void;
  toggleProjectPin: (projectPath: string) => void;
  loadThreads: () => Promise<void>;
  showTrash: boolean;
  trashedThreads: Thread[];
  isLoadingTrash: boolean;
  loadTrash: () => Promise<void>;
  toggleTrashVisibility: () => void;
  restoreThread: (threadId: string) => Promise<void>;
  isMarkingAllRead: boolean;
  handleMarkAllRead: () => Promise<void>;
}

interface PendingAuthorizationSummary {
  threadId?: string;
  requestId?: string;
}

export function useThreadSidebarData({
  searchQuery,
  filterOption,
}: UseThreadSidebarDataParams): UseThreadSidebarDataResult {
  const { pathname } = useLocation();
  const { threads, currentThreadId, setThreads, isLoadingThreads, setLoadingThreads, getThreadState } = useChatStore();
  const [showTrash, setShowTrash] = useState(false);
  const [trashedThreads, setTrashedThreads] = useState<Thread[]>([]);
  const [isLoadingTrash, setIsLoadingTrash] = useState(false);
  const [govHealth, setGovHealth] = useState<Record<string, string>>({});
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const normalizedQuery = normalizeThreadSearchQuery(searchQuery);

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await apiFetch('/api/threads');
      if (!res.ok) return;
      const data = await res.json();
      const nextThreads = (data.threads ?? []).map((thread: Thread) => ({
        ...thread,
        title: normalizeStoredThreadTitleOrNull(thread.title),
      }));
      setThreads(nextThreads);
      const initThreadUnread = useChatStore.getState().initThreadUnread;
      if (typeof initThreadUnread === 'function') {
        for (const thread of nextThreads) {
          initThreadUnread(thread.id, thread.unreadCount ?? 0, !!thread.hasUserMention);
        }
      }
    } catch {
      // Silently ignore
    } finally {
      setLoadingThreads(false);
    }
  }, [setLoadingThreads, setThreads]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await apiFetch('/api/authorization/pending');
        if (!res.ok) return;
        const data = (await res.json()) as { pending?: PendingAuthorizationSummary[] };
        if (cancelled) return;
        useAuthorizationPendingStore.getState().syncAllPending(data.pending ?? []);
      } catch {
        // Best effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refresh = () => void loadThreads();
    window.addEventListener('office-claw:threads-refresh', refresh);
    return () => window.removeEventListener('office-claw:threads-refresh', refresh);
  }, [loadThreads]);

  useEffect(() => {
    const userId = getUserId();
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      auth: { userId },
    });

    socket.on('connect', () => {
      socket.emit('join_room', `user:${userId}`);
    });

    socket.on('thread_created', (data: { threadId: string; source?: string }) => {
      if (data.source === 'connector_auto') {
        void loadThreads();
      }
    });

    socket.on('connector_message', (data: { threadId: string; message?: { timestamp?: number } }) => {
      const store = useChatStore.getState();
      const threadExists = store.threads.some((thread) => thread.id === data.threadId);
      if (!threadExists) {
        void loadThreads();
        return;
      }
      store.updateThreadLastActive?.(data.threadId, data.message?.timestamp ?? Date.now());
    });

    return () => {
      socket.disconnect();
    };
  }, [loadThreads]);

  const cancelPendingScrollRestore = useCallback(() => {
    if (restoreFrameRef.current !== null) {
      cancelAnimationFrame(restoreFrameRef.current);
      restoreFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const element = scrollRegionRef.current;
    if (!element) return;
    const handleScroll = () => {
      writeSidebarScrollTop(element.scrollTop);
    };
    element.addEventListener('scroll', handleScroll, { passive: true });
    return () => element.removeEventListener('scroll', handleScroll);
  }, []);

  const scheduleScrollRestore = useCallback(
    (targetTop: number) => {
      cancelPendingScrollRestore();
      if (!Number.isFinite(targetTop) || targetTop <= 0) return;

      let framesRemaining = MAX_SIDEBAR_RESTORE_FRAMES;
      const apply = () => {
        const element = scrollRegionRef.current;
        if (!element) {
          restoreFrameRef.current = null;
          return;
        }

        const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
        const clampedTop = Math.min(targetTop, maxTop);
        element.scrollTop = clampedTop;

        const canSettle = maxTop >= targetTop;
        const reachedTarget = Math.abs(element.scrollTop - clampedTop) <= 1;
        if ((canSettle && reachedTarget) || framesRemaining <= 0) {
          writeSidebarScrollTop(element.scrollTop);
          restoreFrameRef.current = null;
          return;
        }

        framesRemaining -= 1;
        restoreFrameRef.current = requestAnimationFrame(apply);
      };

      apply();
    },
    [cancelPendingScrollRestore],
  );

  useLayoutEffect(() => {
    scheduleScrollRestore(readSidebarScrollTop());
    return cancelPendingScrollRestore;
  }, [threads.length, isLoadingThreads, pathname, scheduleScrollRestore, cancelPendingScrollRestore]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch('/api/governance/health');
        if (!res.ok) return;
        const data = (await res.json()) as { projects: { projectPath: string; status: string }[] };
        const nextHealth: Record<string, string> = {};
        for (const project of data.projects) {
          nextHealth[project.projectPath] = project.status;
        }
        setGovHealth(nextHealth);
      } catch {
        // Best effort
      }
    })();
  }, []);

  const loadTrash = useCallback(async () => {
    setIsLoadingTrash(true);
    try {
      const res = await apiFetch('/api/threads?deleted=true');
      if (!res.ok) return;
      const data = await res.json();
      setTrashedThreads(data.threads ?? []);
    } catch {
      // Silently ignore
    } finally {
      setIsLoadingTrash(false);
    }
  }, []);

  const toggleTrashVisibility = useCallback(() => {
    setShowTrash((prev) => {
      const next = !prev;
      if (next) void loadTrash();
      return next;
    });
  }, [loadTrash]);

  const restoreThread = useCallback(
    async (threadId: string) => {
      try {
        const res = await apiFetch(`/api/threads/${threadId}/restore`, { method: 'POST' });
        if (!res.ok) return;
        await loadThreads();
        await loadTrash();
      } catch {
        // Silently ignore
      }
    },
    [loadThreads, loadTrash],
  );

  const filteredThreads = useMemo(() => {
    let result = threads;
    if (normalizedQuery) {
      result = result.filter((thread) => {
        const title = (thread.title?.trim() || (thread.id === 'default' ? '大厅' : '未命名会话')).toLowerCase();
        return title.includes(normalizedQuery);
      });
    }
    if (filterOption !== 'all') {
      const now = Date.now();
      const days = filterOption === '1m' ? 30 : filterOption === '3m' ? 90 : 180;
      const threshold = now - days * 24 * 60 * 60 * 1000;
      result = result.filter((thread) => getThreadLastActiveAtMs(thread) >= threshold);
    }
    return result;
  }, [filterOption, normalizedQuery, threads]);

  const threadGroups = useMemo<ThreadGroup[]>(() => {
    const sortable = filteredThreads.filter((thread) => thread.id !== 'default');
    const sortedAll = [...sortable].sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    const sortedPinned = sortedAll.filter((thread) => thread.pinned);
    const sortedUnpinned = sortedAll.filter((thread) => !thread.pinned);
    const groups: ThreadGroup[] = [];
    if (sortedPinned.length > 0) {
      groups.push({ type: 'pinned', label: '置顶', threads: sortedPinned });
    }
    groups.push({ type: 'recent', label: FILTER_OPTION_LABELS[filterOption], threads: sortedUnpinned });
    return groups;
  }, [filterOption, filteredThreads]);

  const displayThreadGroups = useMemo(() => threadGroups, [threadGroups]);
  const collapsedThreadItems = useMemo(
    () =>
      displayThreadGroups.flatMap((group) =>
        group.type === 'archived-container'
          ? (group.archivedGroups?.flatMap((subgroup) => subgroup.threads) ?? group.threads)
          : group.threads,
      ),
    [displayThreadGroups],
  );
  const hasVisibleThreads = useMemo(
    () => displayThreadGroups.some((group) => (group.threads?.length ?? 0) > 0),
    [displayThreadGroups],
  );
  const showDefaultThread = normalizedQuery.length === 0 || '大厅'.includes(normalizedQuery);
  const showNoResults =
    !hasVisibleThreads && !showDefaultThread && (normalizedQuery.length > 0 || filterOption !== 'all');
  const { pinnedProjects, toggleProjectPin } = useProjectPins();
  const { isCollapsed, toggleGroup } = useCollapseState({
    threadGroups,
    searchQuery: normalizedQuery,
    currentThreadId,
  });

  const activeThreadIdFromRoute = pathname.startsWith('/thread/') ? pathname.slice('/thread/'.length) : null;
  const existingProjects = useMemo(() => getProjectPaths(threads), [threads]);

  const handleMarkAllRead = useCallback(async () => {
    setIsMarkingAllRead(true);
    try {
      const res = await apiFetch('/api/threads/read/mark-all', { method: 'POST' });
      if (res.ok) {
        useChatStore.getState().clearAllUnread?.();
      }
    } catch (err) {
      console.debug('[F072] mark-all-read failed:', err);
    } finally {
      setIsMarkingAllRead(false);
    }
  }, []);

  return {
    pathname,
    threads,
    currentThreadId,
    isLoadingThreads,
    getThreadState,
    scrollRegionRef,
    normalizedQuery,
    displayThreadGroups,
    collapsedThreadItems,
    showNoResults,
    activeThreadIdFromRoute,
    existingProjects,
    govHealth,
    pinnedProjects,
    isCollapsed,
    toggleGroup,
    toggleProjectPin,
    loadThreads,
    showTrash,
    trashedThreads,
    isLoadingTrash,
    loadTrash,
    toggleTrashVisibility,
    restoreThread,
    isMarkingAllRead,
    handleMarkAllRead,
  };
}
