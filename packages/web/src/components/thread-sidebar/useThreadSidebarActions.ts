/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Thread, useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { createToggleWithReconcile } from './toggle-with-reconcile';
import { MAX_SESSIONS } from './thread-sidebar-constants';
import { closeSidebarOnMobile, countNonDefaultThreads, writeSidebarScrollTop } from './thread-sidebar-utils';

interface ThreadSidebarActionParams {
  pathname: string;
  currentThreadId: string;
  threads: Thread[];
  showTrash: boolean;
  trashedThreads: Thread[];
  loadThreads: () => Promise<void>;
  loadTrash: () => Promise<void>;
  resetSearchAndFilter: () => void;
  onClose?: () => void;
  onThreadSelect?: () => void;
  getThreadState: (threadId: string) => { hasActiveInvocation?: boolean } | undefined;
  scrollRegionRef: RefObject<HTMLDivElement>;
}

export interface ThreadSidebarActionResult {
  isCreating: boolean;
  showPicker: boolean;
  bindWarning: string | null;
  deleteTarget: Thread | null;
  deleteWorkspace: boolean;
  deleteTargetSharedCount: number;
  deleteTargetIsShared: boolean;
  handleNewChat: () => void;
  handleMenuNavigate: (path: string) => void;
  createInProject: (opts: {
    projectPath?: string;
    preferredAgentIds?: string[];
    title?: string;
    pinned?: boolean;
    backlogItemId?: string;
    sessionBindings?: Array<{ agentId: string; cliSessionId: string }>;
  }) => Promise<void>;
  handleDeleteRequest: (threadId: string) => void;
  handleDeleteConfirm: () => Promise<void>;
  handleRename: (threadId: string, title: string) => Promise<void>;
  handleTogglePin: (threadId: string, pinned: boolean) => void;
  handleToggleFavorite: (threadId: string, favorited: boolean) => void;
  handleUpdatePreferredAgents: (threadId: string, agentIds: string[]) => Promise<void>;
  handleSelect: (threadId: string) => void;
  setShowPicker: (value: boolean) => void;
  setDeleteWorkspace: (value: boolean) => void;
  closePicker: () => void;
  closeDeleteDialog: () => void;
}

export function useThreadSidebarActions({
  pathname,
  currentThreadId,
  threads,
  showTrash,
  trashedThreads,
  loadThreads,
  loadTrash,
  resetSearchAndFilter,
  onClose,
  onThreadSelect,
  getThreadState,
  scrollRegionRef,
}: ThreadSidebarActionParams): ThreadSidebarActionResult {
  const navigate = useNavigate();
  const { addToast } = useToastStore();
  const {
    setCurrentThread,
    setCurrentProject,
    updateThreadTitle,
  } = useChatStore();
  const [isCreating, setIsCreating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [bindWarning, setBindWarning] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  const [deleteWorkspace, setDeleteWorkspace] = useState(false);
  const bindWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinSeqMap = useRef(new Map<string, number>());
  const favSeqMap = useRef(new Map<string, number>());
  const pinToggle = useRef<ReturnType<typeof createToggleWithReconcile>>();
  const favToggle = useRef<ReturnType<typeof createToggleWithReconcile>>();

  if (!pinToggle.current) {
    pinToggle.current = createToggleWithReconcile({
      fetch: apiFetch,
      onUpdate: (threadId, value) => useChatStore.getState().updateThreadPin(threadId, value),
      field: 'pinned',
      seqMap: pinSeqMap.current,
      siblingSeqMap: favSeqMap.current,
      onUpdateSibling: (threadId, value) => useChatStore.getState().updateThreadFavorite(threadId, value),
      siblingField: 'favorited',
    });
  }

  if (!favToggle.current) {
    favToggle.current = createToggleWithReconcile({
      fetch: apiFetch,
      onUpdate: (threadId, value) => useChatStore.getState().updateThreadFavorite(threadId, value),
      field: 'favorited',
      seqMap: favSeqMap.current,
      siblingSeqMap: pinSeqMap.current,
      onUpdateSibling: (threadId, value) => useChatStore.getState().updateThreadPin(threadId, value),
      siblingField: 'pinned',
    });
  }

  useEscapeKey({
    enabled: deleteTarget !== null,
    onEscape: () => setDeleteTarget(null),
  });

  useEffect(() => {
    if (deleteTarget) setDeleteWorkspace(false);
  }, [deleteTarget]);

  const deleteTargetSharedCount = useMemo(() => {
    if (!deleteTarget?.projectPath) return 0;
    const relatedThreads = [...threads, ...trashedThreads];
    const sharedThreadIds = new Set(
      relatedThreads
        .filter((thread) => thread.id !== deleteTarget.id && thread.projectPath === deleteTarget.projectPath)
        .map((thread) => thread.id),
    );
    return sharedThreadIds.size;
  }, [deleteTarget, threads, trashedThreads]);

  const deleteTargetIsShared = deleteTargetSharedCount > 0;

  useEffect(() => {
    if (deleteTargetIsShared) setDeleteWorkspace(false);
  }, [deleteTargetIsShared]);

  useEffect(() => {
    return () => {
      if (bindWarningTimerRef.current) {
        clearTimeout(bindWarningTimerRef.current);
      }
    };
  }, []);

  const clearBindWarningLater = useCallback((message: string) => {
    setBindWarning(message);
    if (bindWarningTimerRef.current) {
      clearTimeout(bindWarningTimerRef.current);
    }
    bindWarningTimerRef.current = setTimeout(() => {
      setBindWarning(null);
      bindWarningTimerRef.current = null;
    }, 6000);
  }, []);

  const navigateToThread = useCallback(
    (threadId: string) => {
      navigate(threadId === 'default' ? '/' : `/thread/${threadId}`, { preventScrollReset: true });
    },
    [navigate],
  );

  const handleNewChat = useCallback(() => {
    const actualThreadCount = countNonDefaultThreads(threads);
    if (actualThreadCount >= MAX_SESSIONS) {
      addToast({
        type: 'error',
        title: '会话数量已达上限',
        message: `当前会话数量已达到 ${MAX_SESSIONS} 个上限，请删除一些会话后再创建新会话。`,
        duration: 5000,
      });
      return;
    }

    resetSearchAndFilter();
    setCurrentThread('default');
    setCurrentProject('default');
    navigateToThread('default');
    closeSidebarOnMobile(onClose);
  }, [
    addToast,
    navigateToThread,
    onClose,
    resetSearchAndFilter,
    setCurrentProject,
    setCurrentThread,
    threads,
  ]);

  const createInProject = useCallback(
    async (opts: {
      projectPath?: string;
      preferredAgentIds?: string[];
      title?: string;
      pinned?: boolean;
      backlogItemId?: string;
      sessionBindings?: Array<{ agentId: string; cliSessionId: string }>;
    }) => {
      const actualThreadCount = countNonDefaultThreads(threads);
      if (actualThreadCount >= MAX_SESSIONS) {
        addToast({
          type: 'error',
          title: '会话数量已达上限',
          message: `当前会话数量已达到 ${MAX_SESSIONS} 个上限，请删除一些会话后再创建新会话。`,
          duration: 5000,
        });
        return;
      }

      setIsCreating(true);
      setShowPicker(false);
      try {
        const res = await apiFetch('/api/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(opts.projectPath ? { projectPath: opts.projectPath } : {}),
            ...(opts.preferredAgentIds?.length ? { preferredAgentIds: opts.preferredAgentIds } : {}),
            ...(opts.title ? { title: opts.title } : {}),
            ...(opts.pinned ? { pinned: opts.pinned } : {}),
            ...(opts.backlogItemId ? { backlogItemId: opts.backlogItemId } : {}),
          }),
        });
        if (!res.ok) return;
        const thread: Thread = await res.json();

        if (opts.sessionBindings?.length) {
          const results = await Promise.allSettled(
            opts.sessionBindings.map(({ agentId, cliSessionId }) =>
              apiFetch(`/api/threads/${thread.id}/sessions/${agentId}/bind`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cliSessionId }),
              }),
            ),
          );
          const failed = results.filter((result) => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.ok));
          if (failed.length > 0) {
            clearBindWarningLater(`Session 绑定部分失败（${failed.length}/${results.length}），可在 Session 面板重试`);
          }
        }

        if (opts.projectPath) setCurrentProject(opts.projectPath);
        navigateToThread(thread.id);
        closeSidebarOnMobile(onClose);
        await loadThreads();
      } catch {
        // Silently ignore
      } finally {
        setIsCreating(false);
      }
    },
    [addToast, loadThreads, navigateToThread, onClose, setCurrentProject, threads, clearBindWarningLater],
  );

  const handleDeleteRequest = useCallback(
    (threadId: string) => {
      const threadState = getThreadState(threadId);
      if (threadState?.hasActiveInvocation) return;
      const thread = threads.find((item) => item.id === threadId);
      if (thread) setDeleteTarget(thread);
    },
    [getThreadState, threads],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    const threadId = deleteTarget.id;
    const sharedCountAtDelete = deleteTargetSharedCount;
    const shouldDeleteWorkspace = deleteWorkspace && !deleteTargetIsShared;
    setDeleteTarget(null);
    try {
      const query = shouldDeleteWorkspace ? '?deleteWorkspace=true' : '';
      const res = await apiFetch(`/api/threads/${threadId}${query}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) return;
      if (shouldDeleteWorkspace) {
        const workspaceDeleteSucceeded = res.headers.get('x-office-claw-workspace-delete-succeeded') === 'true';
        const workspaceDeleteReason = res.headers.get('x-office-claw-workspace-delete-reason');
        const workspaceWasShared = res.headers.get('x-office-claw-workspace-delete-shared') === 'true';
        const workspaceSharedCount = Number(res.headers.get('x-office-claw-workspace-delete-shared-count') ?? sharedCountAtDelete);
        const memoryPreserved = res.headers.get('x-office-claw-memory-preserved') === 'true';

        if (workspaceDeleteSucceeded) {
          if (memoryPreserved) {
            addToast({
              type: 'success',
              title: '工作目录已删除',
              message: '工作目录内容已删除，memory 目录已保留（包含 agent 索引缓存）。如需彻底清理可手动删除。',
              duration: 5000,
            });
          } else if (workspaceWasShared) {
            addToast({
              type: 'info',
              title: '工作目录删除成功',
              message: `工作目录已删除。该目录在删除前被 ${workspaceSharedCount} 个其他会话共享，其他会话可能异常。`,
              duration: 5000,
            });
          } else {
            addToast({
              type: 'success',
              title: '工作目录已删除',
              message: '工作目录已完全删除。',
              duration: 5000,
            });
          }
        } else {
          const workspaceSharedSkip = workspaceDeleteReason === 'shared_workspace';
          const reasonMessage =
            workspaceSharedSkip
              ? '该工作目录正在被其他会话共享，系统已保留，避免影响其他会话。'
              : workspaceDeleteReason === 'unsafe_root'
                ? '系统判定该路径过于危险，已跳过删除。'
                : workspaceDeleteReason === 'not_directory'
                  ? '该路径不是目录，已跳过删除。'
                  : workspaceDeleteReason === 'path_resolution_failed'
                    ? '目录路径解析失败，请检查目录是否仍然存在。'
                    : workspaceDeleteReason === 'delete_failed'
                      ? '目录删除失败，可能是文件占用或权限不足。'
                      : '工作目录未删除，请手动检查。';

          addToast({
            type: workspaceSharedSkip ? 'info' : 'error',
            title: workspaceSharedSkip ? '工作目录已保留' : '工作目录未删除',
            message: reasonMessage,
            duration: 6000,
          });
        }
      }
      if (threadId === currentThreadId) {
        navigateToThread('default');
      }
      await loadThreads();
      if (showTrash) void loadTrash();
    } catch {
      // Silently ignore
    }
  }, [
    addToast,
    currentThreadId,
    deleteTarget,
    deleteTargetIsShared,
    deleteTargetSharedCount,
    deleteWorkspace,
    loadThreads,
    loadTrash,
    navigateToThread,
    showTrash,
  ]);

  const handleRename = useCallback(
    async (threadId: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      try {
        const res = await apiFetch(`/api/threads/${threadId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: nextTitle }),
        });
        if (!res.ok) return;
        const updated = await res.json();
        updateThreadTitle(threadId, updated.title ?? nextTitle);
      } catch {
        // Silently ignore
      }
    },
    [updateThreadTitle],
  );

  const handleTogglePin = useCallback(
    (threadId: string, pinned: boolean) => void pinToggle.current?.toggle(threadId, pinned),
    [],
  );

  const handleToggleFavorite = useCallback(
    (threadId: string, favorited: boolean) => void favToggle.current?.toggle(threadId, favorited),
    [],
  );

  const handleUpdatePreferredAgents = useCallback(async (threadId: string, agentIds: string[]) => {
    const res = await apiFetch(`/api/threads/${threadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredAgentIds: agentIds }),
    });
    if (!res.ok) throw new Error('保存失败');
    useChatStore.getState().updateThreadPreferredAgents(threadId, agentIds);
  }, []);

  const handleSelect = useCallback(
    (threadId: string) => {
      onThreadSelect?.();
      const scrollRegion = scrollRegionRef.current;
      if (scrollRegion) {
        writeSidebarScrollTop(scrollRegion.scrollTop);
      }
      const isAlreadyOnThreadRoute = (threadId === 'default' && pathname === '/') || pathname === `/thread/${threadId}`;
      if (threadId === currentThreadId && isAlreadyOnThreadRoute) return;
      const target = threads.find((thread) => thread.id === threadId);
      setCurrentProject(target?.projectPath ?? 'default');
      setCurrentThread(threadId);
      navigateToThread(threadId);
      closeSidebarOnMobile(onClose);
    },
    [currentThreadId, navigateToThread, onClose, onThreadSelect, pathname, scrollRegionRef, setCurrentProject, setCurrentThread, threads],
  );

  const handleMenuNavigate = useCallback(
    (path: string) => {
      navigate(path);
      closeSidebarOnMobile(onClose);
    },
    [onClose, navigate],
  );

  return {
    isCreating,
    showPicker,
    bindWarning,
    deleteTarget,
    deleteWorkspace,
    deleteTargetSharedCount,
    deleteTargetIsShared,
    handleNewChat,
    handleMenuNavigate,
    createInProject,
    handleDeleteRequest,
    handleDeleteConfirm,
    handleRename,
    handleTogglePin,
    handleToggleFavorite,
    handleUpdatePreferredAgents,
    handleSelect,
    setShowPicker,
    setDeleteWorkspace,
    closePicker: () => setShowPicker(false),
    closeDeleteDialog: () => setDeleteTarget(null),
  };
}
