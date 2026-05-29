/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import type { DeliveryMode } from '@/stores/chat-types';
import type { SendMessageOptions, WhisperOptions } from '@/hooks/useSendMessage';
import { useChatStore } from '@/stores/chatStore';
import { useToastStore } from '@/stores/toastStore';
import { apiFetch } from '@/utils/api-client';
import { ChatEmptyState } from './ChatEmptyState';
import { MAIN_PANEL_MIN_WIDTH } from "@/shared/constants";
import { ChatInput } from '../components/chat-input/ChatInput';
import { DirectoryBrowserModal } from './DirectoryBrowserModal';
import { getProjectPaths } from './thread-sidebar/thread-utils';

const HOME_DRAFT_THREAD_ID = '__new__';
const MAX_SESSIONS = 200;

function getFolderNameFromPath(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function getCreateThreadErrorMessage(status: number, detail?: unknown): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  return `Failed to create thread (HTTP ${status})`;
}

export function NewThreadContainer() {
  const navigate = useNavigate();
  const setCurrentThread = useChatStore((s) => s.setCurrentThread);
  const threads = useChatStore((s) => s.threads);
  const setPendingNewThreadSend = useChatStore((s) => s.setPendingNewThreadSend);
  const attachPendingNewThreadTarget = useChatStore((s) => s.attachPendingNewThreadTarget);
  const clearPendingNewThreadSend = useChatStore((s) => s.clearPendingNewThreadSend);
  const { addToast } = useToastStore();
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [isFolderBrowserOpen, setIsFolderBrowserOpen] = useState(false);
  const [cwdPath, setCwdPath] = useState<string | null>(null);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [selectedFolderTitle, setSelectedFolderTitle] = useState<string | null>(null);

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
    setIsFolderBrowserOpen(false);
  }, []);

  const handleSelectEmptyWorkspace = useCallback(() => {
    setSelectedFolderPath(null);
    setSelectedFolderName(null);
    setSelectedFolderTitle(null);
  }, []);

  const handleSelectExistingWorkspace = useCallback((path: string) => {
    setSelectedFolderPath(path);
    setSelectedFolderName(getFolderNameFromPath(path));
    setSelectedFolderTitle(path);
  }, []);

  const handleOpenFolderPicker = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects/cwd');
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.path === 'string' && data.path.trim()) {
          setCwdPath(data.path);
        }
        if (typeof data?.workspacePath === 'string' && data.workspacePath.trim()) {
          setDefaultWorkspacePath(data.workspacePath);
        } else {
          setDefaultWorkspacePath(null);
        }
      }
    } catch {
    } finally {
      setIsFolderBrowserOpen(true);
    }
  }, []);

  useEffect(() => {
    setCurrentThread('default');
  }, [setCurrentThread]);

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
        sendOptions,
        createdAt: Date.now(),
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
    <>
      <div className="h-full w-full flex flex-col" style={{ minWidth: MAIN_PANEL_MIN_WIDTH }}>
        <main
          className="ui-shell-surface flex flex-1 min-h-0 flex-col overflow-y-auto p-4"
          data-testid="new-thread-main"
        >
          <div className="flex flex-1 items-center justify-center">
            <ChatEmptyState
              onAgentsClick={() => navigate('/agents')}
              onChannelsClick={() => navigate('/channels')}
              fillAvailableHeight
            />
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

      <DirectoryBrowserModal
        open={isFolderBrowserOpen}
        title="选择文件夹"
        initialPath={selectedFolderPath ?? defaultWorkspacePath ?? cwdPath ?? undefined}
        activeProjectPath={selectedFolderPath ?? defaultWorkspacePath ?? undefined}
        onSelect={handleFolderSelect}
        onClose={() => setIsFolderBrowserOpen(false)}
      />
    </>
  );
}
