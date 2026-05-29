/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useState, useMemo } from 'react';
import { AppModal } from '../../AppModal';
import { useChatStore } from '@/stores/chatStore';
import { normalizeStoredThreadTitleOrNull } from '@/components/thread-sidebar/thread-title';
import { formatRelativeTime } from '@/components/thread-sidebar/thread-utils';
import { useAgentData } from '@/hooks/useAgentData';
import { useExpertCatalog } from '@/hooks/useExpertCatalog';
import { Button } from '@/components/shared/Button';
import type { SelectSessionModalProps } from '../types/session';

const FALLBACK_AVATAR = '/avatars/codex.png';

function resolveAvatarUrl(rawAvatar?: string): string | null {
  const avatar = rawAvatar?.trim();
  if (!avatar) return null;
  if (avatar.startsWith('/uploads/')) return `/uploads/${avatar.replace('/uploads/', '')}`;
  if (avatar.startsWith('/')) return avatar;
  return null;
}

export function SelectSessionModal({ open, onClose, expertId, expertMentionPattern, onConfirm, onCreateNew }: SelectSessionModalProps) {
  const threads = useChatStore((s) => s.threads);
  const { agents } = useAgentData();
  const { getExpertById } = useExpertCatalog();
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredThreads = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.id !== 'default' &&
        (!query ||
          (normalizeStoredThreadTitleOrNull(t.title)?.toLowerCase() ?? '').includes(query) ||
          t.id.toLowerCase().includes(query))
    );
  }, [threads, searchQuery]);

  const displayOptions = useMemo(() => {
    return filteredThreads.map((thread) => {
      const participants = Array.isArray(thread.participants) ? thread.participants : [];
      const isInvited = participants.includes(expertId);
      const participantNames = participants
        .map((participantId) => agentById.get(participantId)?.displayName ?? getExpertById(participantId)?.displayName ?? participantId)
        .filter((name) => !!name.trim());
      const subtitle = participantNames.length > 0 ? participantNames.join('，') : '通用助手';
      const avatarSources = participants.slice(0, 4).map(
        (participantId) =>
          resolveAvatarUrl(agentById.get(participantId)?.avatar ?? getExpertById(participantId)?.avatar) ?? FALLBACK_AVATAR,
      );
      return {
        id: thread.id,
        label: normalizeStoredThreadTitleOrNull(thread.title) ?? '未命名对话',
        subtitle,
        avatarSources,
        timeText: formatRelativeTime(Number(thread.lastActiveAt) || 0, true),
        isInvited,
      };
    });
  }, [filteredThreads, agentById, expertId, getExpertById]);

  const handleConfirm = () => {
    if (selectedId) {
      onConfirm(selectedId);
      onClose();
    }
  };

  const handleCreateNew = () => {
    onCreateNew();
    onClose();
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="选择会话"
      panelStyle={{ width: 680 }}
      panelClassName="rounded-2xl"
      bodyClassName="p-0"
    >
      <div className="flex flex-col gap-5 mt-4">
        {/* Controls Row */}
        <div className="flex items-center gap-3">
          {/* Channel Select - hidden for now */}
          <div className="hidden w-[176px] h-7 px-3 rounded-[6px] border border-[#D7DEE8] bg-white cursor-pointer">
            <span className="text-xs font-medium text-[#2D3643]">全部渠道</span>
            <svg className="w-4 h-4 text-[#8D97A6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>

          {/* Search Box */}
          <div className="flex-1 flex items-center gap-2 h-7 px-3 rounded-[6px] border border-[#D7DEE8] bg-white">
            <svg className="w-3.5 h-3.5 text-[#A4ADBA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索会话名称或描述"
              className="flex-1 text-xs text-[#A4ADBA] bg-transparent outline-none"
            />
          </div>
        </div>

        {/* Session List */}
        <div className="flex flex-col gap-2 overflow-y-auto max-h-[340px]">
          {displayOptions.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-[#667085] text-sm">
              暂无相关会话
            </div>
          ) : (
            displayOptions.map((option) => {
              const selected = option.id === selectedId;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedId(option.id)}
                  className={[
                    'flex w-full items-start gap-3 rounded-[8px] px-6 transition',
                    selected
                      ? 'border-[1.5px] border-[rgba(20,118,255,1)] bg-white'
                      : 'border border-[rgba(240,240,240,1)] bg-[rgba(250,250,250,1)] hover:border-[var(--connector-tab-border-hover)] hover:bg-[var(--connector-tab-bg-hover)]',
                  ].join(' ')}
                  style={{ height: '68px', paddingTop: 12, paddingBottom: 12 }}
                >
                  {/* Avatar */}
                  <div className="relative h-8 w-8 shrink-0">
                    {option.avatarSources.length <= 1 ? (
                      <img
                        src={option.avatarSources[0] ?? FALLBACK_AVATAR}
                        alt=""
                        aria-hidden="true"
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : option.avatarSources.length === 2 ? (
                      <>
                        <img
                          src={option.avatarSources[0] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-[1px] top-[6px] h-5 w-5 rounded-full object-cover"
                        />
                        <img
                          src={option.avatarSources[1] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-[11px] top-[6px] h-5 w-5 rounded-full object-cover"
                        />
                      </>
                    ) : option.avatarSources.length === 3 ? (
                      <>
                        <img
                          src={option.avatarSources[0] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-[8px] top-0 h-4 w-4 rounded-full object-cover"
                        />
                        <img
                          src={option.avatarSources[1] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-0 top-[16px] h-4 w-4 rounded-full object-cover"
                        />
                        <img
                          src={option.avatarSources[2] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-[16px] top-[16px] h-4 w-4 rounded-full object-cover"
                        />
                      </>
                    ) : (
                      <>
                        <img
                          src={option.avatarSources[0] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-0 top-0 h-4 w-4 rounded-full object-cover"
                        />
                        <img
                          src={option.avatarSources[1] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-[16px] top-0 h-4 w-4 rounded-full object-cover"
                        />
                        <img
                          src={option.avatarSources[2] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-0 top-[16px] h-4 w-4 rounded-full object-cover"
                        />
                        <img
                          src={option.avatarSources[3] ?? FALLBACK_AVATAR}
                          alt=""
                          aria-hidden="true"
                          className="absolute left-[16px] top-[16px] h-4 w-4 rounded-full object-cover"
                        />
                      </>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col items-start min-w-0 flex-1 self-start">
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="block min-w-0 truncate text-[14px] font-semibold leading-5 text-[#344054]">
                        {option.label}
                      </span>
                      <span className="shrink-0 text-[14px] leading-5 text-[#344054]">{option.timeText}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[12px] leading-5 text-[#667085]">{option.subtitle}</div>
                      {option.isInvited && (
                        <span className="shrink-0 text-[12px] leading-5 text-[#16A34A] font-medium">已邀请</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pb-6">
          <Button variant="default" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="default" size="sm" onClick={handleCreateNew}>
            新建会话
          </Button>
          <Button variant="major" size="sm" onClick={handleConfirm} disabled={!selectedId}>
            确定
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
