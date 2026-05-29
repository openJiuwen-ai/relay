/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExpertCardGrid } from './components/ExpertCardGrid';
import { SelectSessionModal } from './components/SelectSessionModal';
import { useExperts } from './hooks/useExperts';
import { useChatStore } from '@/stores/chatStore';
import { apiFetch } from '@/utils/api-client';
import { EXPERT_CATEGORIES, type Expert } from './types/expert';
import { SearchInput } from '@/components/shared/SearchInput';
import { RefreshButton } from '@/components/shared/RefreshButton';
import { buildResolvedMention } from '@/components/chat-input/utils/helpers';

interface ExpertsPanelProps {
  onAddExpert?: (expert: Expert) => void;
}

export function ExpertsPanel({ onAddExpert }: ExpertsPanelProps = {}) {
  const navigate = useNavigate();
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const { experts, allExperts, category, setCategory, invitedExpertIds, isLoading, fetchExperts, inviteExpert, searchQuery, setSearchQuery } =
    useExperts({ threadId: currentThreadId });

  const setCurrentThread = useChatStore((s) => s.setCurrentThread);
  const setPendingChatInsert = useChatStore((s) => s.setPendingChatInsert);

  useEffect(() => {
    void fetchExperts();
  }, [fetchExperts]);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedExpertId, setSelectedExpertId] = useState<string | null>(null);
  const [selectedExpertMention, setSelectedExpertMention] = useState<string | null>(null);

  const handleInvoke = (expertId: string) => {
    const expert = experts.find((e) => e.expertId === expertId);
    setSelectedExpertId(expertId);
    setSelectedExpertMention(expert ? buildResolvedMention(expert) : null);
    setModalOpen(true);
  };

  const handleConfirm = (threadId: string) => {
    if (selectedExpertId) {
      void inviteExpert(selectedExpertId, threadId).then((ok) => {
        if (ok && selectedExpertMention) {
          setPendingChatInsert({
            threadId,
            text: `${selectedExpertMention} `,
            replaceTrailingMentionTrigger: true,
            suppressMentionMenu: true,
            mentionRefs: [{ catId: selectedExpertId, mention: selectedExpertMention }],
          });
          setCurrentThread(threadId);
          navigate(`/thread/${threadId}`);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('office-claw:threads-refresh'));
          }
        }
      });
    }
    setModalOpen(false);
  };

  const handleCreateNew = async () => {
    if (!selectedExpertId || !selectedExpertMention) return;
    try {
      const response = await apiFetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error('Failed to create thread');
      const thread = await response.json();
      const newThreadId = thread.id;
      const ok = await inviteExpert(selectedExpertId, newThreadId);
      if (ok) {
        setPendingChatInsert({
          threadId: newThreadId,
          text: `${selectedExpertMention} `,
          replaceTrailingMentionTrigger: true,
          suppressMentionMenu: true,
          mentionRefs: [{ catId: selectedExpertId, mention: selectedExpertMention }],
        });
        setCurrentThread(newThreadId);
        navigate(`/thread/${newThreadId}`);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('office-claw:threads-refresh'));
        }
      }
    } catch (err) {
      console.error('Failed to create thread:', err);
    }
    setModalOpen(false);
  };

  const handleAdd = (expert: Expert) => {
    onAddExpert?.(expert);
  };

  return (
    <div className="ui-page-shell gap-6 overflow-hidden">
      <div className="flex flex-col gap-4">
        <div className="ui-page-header-inline items-start">
          <div className="flex flex-wrap items-center gap-4">
            {EXPERT_CATEGORIES.map((catItem) => {
              return (
                <div key={catItem.id} className="flex items-center">
                  {catItem.id !== 'all' ? (
                    <div aria-hidden="true" className="mr-4 h-4 w-px self-center bg-[#dbdbdb]" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setCategory(catItem.id)}
                    className={`inline-flex min-h-7 items-center leading-none text-sm transition-colors ${
                      category === catItem.id
                        ? 'font-semibold text-[var(--text-primary)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {catItem.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="ui-page-title">智能体广场({allExperts.length})</h1>
        </div>

        <div className="flex items-center gap-3">
          <SearchInput
            value={searchQuery}
            onChange={(value) => setSearchQuery(value)}
            onClear={() => setSearchQuery('')}
            placeholder="搜索专家名称、职责或技能"
            aria-label="搜索专家"
            clearAriaLabel="清除搜索"
            wrapperClassName="flex-1"
          />
          <RefreshButton
            onClick={() => { void fetchExperts(); }}
            disabled={isLoading}
            aria-label="刷新专家列表"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[var(--text-muted)]">加载中...</span>
          </div>
        ) : (
          <ExpertCardGrid
            experts={experts}
            onInvoke={handleInvoke}
            onAdd={handleAdd}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
          />
        )}
      </div>

      <SelectSessionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        expertId={selectedExpertId || ''}
        expertMentionPattern={selectedExpertMention || undefined}
        onConfirm={handleConfirm}
        onCreateNew={handleCreateNew}
      />
    </div>
  );
}
