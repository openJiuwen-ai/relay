/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { ConnectorConfigTab } from './channels-panel/components/ConnectorConfigTab';
import { HubIcon } from './icons/HubIcon';
import { formatRelativeTime } from './thread-sidebar/thread-utils';

const CONNECTOR_LABELS: Record<string, string> = {
  feishu: '飞书',
  wechat: '微信',
  slack: 'Slack',
  discord: 'Discord',
  'wecom-bot': '企业微信',
  'wecom-agent': '企微自建应用',
};

type HubTab = 'threads' | 'config';

interface HubThreadSummary {
  id: string;
  title?: string;
  connectorId?: string;
  externalChatId?: string;
  createdAt?: number;
  lastCommandAt?: number;
}

interface HubListModalProps {
  open: boolean;
  onClose: () => void;
  currentThreadId?: string;
}

export function HubListModal({ open, onClose, currentThreadId }: HubListModalProps) {
  const navigate = useNavigate();
  const [hubThreads, setHubThreads] = useState<HubThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<HubTab>('threads');

  const fetchHubThreads = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/connector/hub-threads');
      if (!res.ok) return;
      const data = await res.json();
      setHubThreads(data.threads ?? []);
    } catch {
      // fall through
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchHubThreads();
      setActiveTab('threads');
    }
  }, [open, fetchHubThreads]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleNavigate = (threadId: string) => {
    navigate(`/thread/${threadId}`);
    onClose();
  };

  const grouped = new Map<string, HubThreadSummary[]>();
  for (const t of hubThreads) {
    const key = t.connectorId ?? 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-backdrop-strong)]" data-testid="hub-list-modal">
      <div className="flex w-[520px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-[var(--modal-border)] bg-[var(--modal-surface)] shadow-[var(--modal-shadow)]">
        <div className="flex items-center justify-between border-b border-[var(--modal-divider)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <HubIcon className="w-5 h-5 text-[var(--modal-accent-text)]" />
            <span className="text-lg font-semibold text-[var(--modal-title-text)]">IM Hub</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--modal-close-icon)] transition-colors hover:bg-[var(--modal-close-hover-bg)] hover:text-[var(--modal-close-icon-hover)]"
            data-testid="hub-list-close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-[var(--modal-divider)] px-6" data-testid="hub-tabs">
          <button
            type="button"
            onClick={() => setActiveTab('threads')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === 'threads' ? 'text-[var(--modal-accent-text)]' : 'text-[var(--modal-text-muted)] hover:text-[var(--modal-text)]'
            }`}
            data-testid="hub-tab-threads"
          >
            系统对话中心
            {activeTab === 'threads' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--modal-accent-text)]" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === 'config' ? 'text-[var(--modal-accent-text)]' : 'text-[var(--modal-text-muted)] hover:text-[var(--modal-text)]'
            }`}
            data-testid="hub-tab-config"
          >
            平台配置
            {activeTab === 'config' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--modal-accent-text)]" />
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'threads' ? (
            <div className="space-y-4">
              {isLoading ? (
                <p className="py-8 text-center text-sm text-[var(--modal-empty-text)]">加载中...</p>
              ) : hubThreads.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--modal-empty-text)]">
                  还没有 IM Hub。从飞书等 IM 渠道发送消息建立绑定后，命令将自动路由到专用 Hub thread。
                </p>
              ) : (
                Array.from(grouped.entries()).map(([connectorId, threads]) => (
                  <div key={connectorId}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--modal-text-muted)]">
                      {CONNECTOR_LABELS[connectorId] ?? connectorId} Hub
                    </div>
                    <div className="space-y-2">
                      {threads.map((t) => {
                        const isCurrent = t.id === currentThreadId;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleNavigate(t.id)}
                            disabled={isCurrent}
                            className={`w-full rounded-xl border p-3 text-left transition-colors ${
                              isCurrent
                                ? 'cursor-default border-[var(--modal-selected-border)] bg-[var(--modal-selected-surface)] opacity-60'
                                : 'border-[var(--modal-muted-border)] bg-[var(--modal-muted-surface)] hover:bg-[var(--modal-muted-surface-hover)]'
                            }`}
                            data-testid={`hub-item-${t.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[15px] font-medium text-[var(--modal-text)]">
                                {t.title ?? `${CONNECTOR_LABELS[connectorId] ?? connectorId} IM Hub`}
                              </span>
                              {isCurrent && (
                                <span className="rounded-full bg-[var(--modal-selected-surface)] px-2.5 py-1 text-xs font-medium text-[var(--modal-accent-text)]">
                                  当前
                                </span>
                              )}
                            </div>
                            {t.externalChatId && (
                              <div className="mt-1 truncate text-xs text-[var(--modal-text-subtle)]">{t.externalChatId}</div>
                            )}
                            {t.lastCommandAt && (
                              <div className="mt-0.5 text-xs text-[var(--modal-text-subtle)]">
                                最近命令 {formatRelativeTime(t.lastCommandAt)}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <ConnectorConfigTab />
          )}
        </div>
      </div>
    </div>
  );
}
