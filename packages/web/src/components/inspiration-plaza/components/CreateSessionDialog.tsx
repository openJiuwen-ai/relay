/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppModal } from '@/components/AppModal';
import { Button } from '@/components/shared/Button';
import { SearchInput } from '@/components/shared/SearchInput';
import { formatRelativeTime } from '@/components/thread-sidebar/thread-utils';
import { useAgentData } from '@/hooks/useAgentData';
import type { Thread } from '@/stores/chat-types';
import { apiFetch } from '@/utils/api-client';
import { SessionAvatarGroup } from './SessionAvatarGroup';

const HOME_DRAFT_THREAD_ID = '__new__';

interface SessionItem {
  id: string;
  title: string | null;
  lastActiveAt: number;
  participants: string[];
}

interface CreateSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreateNew: (threadId: string) => void;
  onSelectExisting: (threadId: string) => void;
}

function normalizeStoredThreadTitleOrNull(title: string | null | undefined): string | null {
  if (!title) return null;
  const trimmed = title.trim();
  return trimmed === '' ? null : trimmed;
}

function getSessionTitle(session: SessionItem): string {
  return session.title ?? (session.id === 'default' ? '大厅' : '未命名会话');
}

function getSessionDescription(session: SessionItem): string {
  const count = session.participants.length;
  if (count <= 0) return '暂无参与智能体';
  return `${count} 个参与智能体`;
}

export function CreateSessionDialog({
  open,
  onClose,
  onCreateNew,
  onSelectExisting,
}: CreateSessionDialogProps) {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { getAgentById } = useAgentData();

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/threads');
      if (!res.ok) return;
      const data = await res.json();
      const nextSessions = ((data.threads ?? []) as Thread[])
        .map((thread) => ({
          id: thread.id,
          title: normalizeStoredThreadTitleOrNull(thread.title),
          lastActiveAt: thread.lastActiveAt,
          participants: thread.participants ?? [],
        }))
        .filter((session) => session.id !== 'default')
        .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
      setSessions(nextSessions);
    } catch {
      // Keep the existing list visible when refresh fails.
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setSearchKeyword('');
    void loadSessions();
  }, [loadSessions, open]);

  const filteredSessions = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter((session) => {
      const title = getSessionTitle(session).toLowerCase();
      return title.includes(keyword);
    });
  }, [searchKeyword, sessions]);

  const handleNewSession = () => {
    onCreateNew(HOME_DRAFT_THREAD_ID);
    onClose();
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    onSelectExisting(selectedId);
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      disableBackdropClose
      title="选择会话"
      panelClassName="w-[560px]"
      bodyClassName="p-0"
      zIndexClassName="z-[120]"
    >
      <div className="flex flex-col">
        <div className="flex items-center gap-2 pt-4 pb-3">
          <SearchInput
            value={searchKeyword}
            onChange={(value) => setSearchKeyword(value)}
            onClear={() => setSearchKeyword('')}
            placeholder="搜索会话"
            wrapperClassName="flex-1"
          />
          <Button
            variant="default"
            size="md"
            onlyIcon
            hasBorder
            aria-label="刷新会话列表"
            className="shrink-0"
            iconLeft={<img src="/icons/icon-refresh.svg" alt="" className="h-4 w-4" />}
            onClick={() => void loadSessions()}
            loading={isLoading}
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto pb-3">
          {isLoading && sessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-secondary)]">加载会话中...</div>
          ) : null}
          {!isLoading && sessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-secondary)]">暂无会话，可新建会话</div>
          ) : null}
          {!isLoading && sessions.length > 0 && filteredSessions.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-secondary)]">暂无匹配会话</div>
          ) : null}
          <div className="space-y-2">
            {filteredSessions.map((session) => {
              const displayTitle = getSessionTitle(session);
              const isSelected = selectedId === session.id;
              return (
                <button
                  key={session.id}
                  type="button"
                  data-testid={`session-option-${session.id}`}
                  onClick={() => setSelectedId(session.id)}
                  className={[
                    'flex w-full items-stretch gap-2 rounded-lg border px-6 py-3 text-left transition-colors',
                    isSelected ? 'border-[#1476FF]' : 'border-[#F0F0F0]',
                    'bg-[#FAFAFA] hover:bg-[var(--surface-hover)]',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <SessionAvatarGroup participants={session.participants} getAgentById={getAgentById} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--text-primary)]" title={displayTitle}>
                        {displayTitle}
                      </div>
                      <div className="truncate text-xs text-[var(--text-secondary)]" title={getSessionDescription(session)}>
                        {getSessionDescription(session)}
                      </div>
                    </div>
                  </div>
                  <div className="self-end whitespace-nowrap text-xs text-[var(--text-tertiary)]">
                    {formatRelativeTime(session.lastActiveAt, true)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div
          data-testid="create-session-dialog-actions"
          className="flex items-center justify-end gap-2 px-4 py-3"
        >
          <Button variant="default" size="md" onClick={onClose}>
            取消
          </Button>
          <Button variant="default" size="md" onClick={handleNewSession}>
            新建会话
          </Button>
          <Button variant="major" size="md" onClick={handleConfirm} disabled={!selectedId}>
            确定
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
