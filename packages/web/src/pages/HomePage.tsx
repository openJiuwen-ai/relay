/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatEmptyState } from '@/components/ChatEmptyState';
import { MAIN_PANEL_MIN_WIDTH } from '@/shared/constants';
import { ChatInput } from '@/components/chat-input/ChatInput';
import { getProjectPaths } from '@/components/thread-sidebar/thread-utils';
import type { SendMessageOptions, WhisperOptions } from '@/hooks/useSendMessage';
import { useSocket } from '@/hooks/useSocket';
import type { DeliveryMode } from '@/stores/chat-types';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';

const HOME_DRAFT_THREAD_ID = '__new__';
const MAX_SESSIONS = 200;

function getFolderNameFromPath(path: string): string {
  const normalized = path.replace(/[/\\]+$/, '');
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function getCreateThreadErrorMessage(status: number, detail?: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  return `Failed to create thread (HTTP ${status})`;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export default function HomePage() {
  const navigate = useNavigate();
  const setCurrentThread = useChatStore((s) => s.setCurrentThread);
  const threads = useChatStore((s) => s.threads);
  const setPendingNewThreadSend = useChatStore((s) => s.setPendingNewThreadSend);
  const attachPendingNewThreadTarget = useChatStore((s) => s.attachPendingNewThreadTarget);
  const clearPendingNewThreadSend = useChatStore((s) => s.clearPendingNewThreadSend);
  const { addToast } = useToastStore();
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [selectedFolderTitle, setSelectedFolderTitle] = useState<string | null>(null);
  const activeFolderPickerAbortRef = useRef<AbortController | null>(null);
  const socketCallbacks = useMemo(
    () => ({
      onMessage: () => {},
      onThreadCreated: () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('office-claw:threads-refresh'));
        }
      },
    }),
    [],
  );
  const watchedThreadIds = useMemo(() => threads.map((thread) => thread.id), [threads]);
  useSocket(socketCallbacks, undefined, watchedThreadIds);

  const workspaceOptions = useMemo(
    () =>
      getProjectPaths(threads).map((path) => ({
        path,
        name: getFolderNameFromPath(path),
        title: path,
      })),
    [threads],
  );

  const handleFolderSelect = useCallback((path: string) => {
    setSelectedFolderPath(path);
    setSelectedFolderName(getFolderNameFromPath(path));
    setSelectedFolderTitle(path);
  }, []);

  const abortActiveFolderPicker = useCallback(() => {
    activeFolderPickerAbortRef.current?.abort();
  }, []);

  const handleSelectEmptyWorkspace = useCallback(() => {
    abortActiveFolderPicker();
    setSelectedFolderPath(null);
    setSelectedFolderName(null);
    setSelectedFolderTitle(null);
  }, [abortActiveFolderPicker]);

  const handleSelectExistingWorkspace = useCallback((path: string) => {
    abortActiveFolderPicker();
    handleFolderSelect(path);
  }, [abortActiveFolderPicker, handleFolderSelect]);

  const handleOpenFolderPicker = useCallback(async () => {
    abortActiveFolderPicker();
    const controller = new AbortController();
    activeFolderPickerAbortRef.current = controller;

    try {
      let pickerRequest: {
        method: 'POST';
        headers?: { 'Content-Type': 'application/json' };
        body?: string;
        signal: AbortSignal;
      } = {
        method: 'POST',
        signal: controller.signal,
      };

      if (selectedFolderPath && selectedFolderPath.trim()) {
        pickerRequest = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initialPath: selectedFolderPath }),
          signal: controller.signal,
        };
      } else {
        const cwdRes = await apiFetch('/api/projects/cwd', { signal: controller.signal });
        if (cwdRes.ok) {
          const cwdData = await cwdRes.json().catch(() => null);
          if (typeof cwdData?.workspacePath === 'string' && cwdData.workspacePath.trim()) {
            pickerRequest = {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ initialDirectory: cwdData.workspacePath }),
              signal: controller.signal,
            };
          }
        }
      }

      const res = await apiFetch('/api/projects/pick-directory', pickerRequest);
      if (res.status === 204) {
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = typeof data?.error === 'string' && data.error.trim() ? data.error : '打开系统目录选择失败，请重试';
        addToast({
          type: 'error',
          title: '选择文件夹失败',
          message,
          duration: 3000,
        });
        return;
      }
      const data = await res.json().catch(() => null);
      if (typeof data?.path === 'string' && data.path.trim()) {
        handleFolderSelect(data.path);
        return;
      }
      addToast({
        type: 'error',
        title: '选择文件夹失败',
        message: '系统目录选择未返回有效路径',
        duration: 3000,
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        return;
      }
      addToast({
        type: 'error',
        title: '选择文件夹失败',
        message: '无法连接到后端服务，请稍后重试',
        duration: 3000,
      });
    } finally {
      if (activeFolderPickerAbortRef.current === controller) {
        activeFolderPickerAbortRef.current = null;
      }
    }
  }, [abortActiveFolderPicker, addToast, handleFolderSelect, selectedFolderPath]);

  useEffect(() => {
    setCurrentThread('default');
  }, [setCurrentThread]);

  useEffect(() => {
    return () => {
      activeFolderPickerAbortRef.current?.abort();
      activeFolderPickerAbortRef.current = null;
    };
  }, []);

  const handleSend = useCallback(
    async (
      content: string,
      images?: File[],
      whisper?: WhisperOptions,
      deliveryMode?: DeliveryMode,
      sendOptions?: SendMessageOptions,
    ) => {
      if (isCreatingThread) return;

      const actualThreadCount = threads.filter((t) => t.id !== 'default').length;
      if (actualThreadCount >= MAX_SESSIONS) {
        addToast({
          type: 'error',
          title: '会话数量已达上限',
          message: `当前会话数量已达到 ${MAX_SESSIONS} 个上限，请删除一些会话后再创建新会话。`,
          duration: 5000,
        });
        return;
      }

      setIsCreatingThread(true);
      setPendingNewThreadSend({
        requestId: globalThis.crypto?.randomUUID?.() ?? `pending-${Date.now()}`,
        content,
        images,
        whisper,
        deliveryMode,
        createdAt: Date.now(),
        sendOptions,
      });

      try {
        const createThreadPayload = selectedFolderPath ? { projectPath: selectedFolderPath } : {};
        const response = await apiFetch('/api/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createThreadPayload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(getCreateThreadErrorMessage(response.status, data?.detail));
        }

        const thread = await response.json();
        if (!thread?.id) {
          throw new Error('Failed to create thread');
        }

        attachPendingNewThreadTarget(thread.id);
        navigate(`/thread/${thread.id}`);
      } catch (err) {
        clearPendingNewThreadSend();
        console.error(err instanceof Error ? err.message : 'Failed to create thread');
      } finally {
        setIsCreatingThread(false);
      }
    },
    [
      addToast,
      attachPendingNewThreadTarget,
      clearPendingNewThreadSend,
      isCreatingThread,
      navigate,
      selectedFolderPath,
      setPendingNewThreadSend,
      threads,
    ],
  );

  return (
    <div className="chat-layout-container min-w-0 flex-1 h-full flex flex-col" style={{ minWidth: MAIN_PANEL_MIN_WIDTH }}>
      <main className="ui-shell-surface flex flex-1 min-h-0 flex-col overflow-y-auto px-0 py-4" data-testid="new-thread-main">
        <div className="flex w-full flex-1 flex-col gap-4">
          <div className="flex flex-1 items-center justify-center">
            <ChatEmptyState
              onAgentsClick={() => navigate('/agents')}
              onChannelsClick={() => navigate('/channels')}
              fillAvailableHeight
            />
          </div>
        </div>
      </main>
      <ChatInput
        threadId={HOME_DRAFT_THREAD_ID}
        onSend={handleSend}
        disabled={isCreatingThread}
        folderSelectionEnabled
        selectedFolderName={selectedFolderName}
        selectedFolderTitle={selectedFolderTitle}
        workspaceOptions={workspaceOptions}
        onSelectEmptyWorkspace={handleSelectEmptyWorkspace}
        onSelectExistingWorkspace={handleSelectExistingWorkspace}
        onOpenFolderPicker={() => void handleOpenFolderPicker()}
      />
    </div>
  );
}
