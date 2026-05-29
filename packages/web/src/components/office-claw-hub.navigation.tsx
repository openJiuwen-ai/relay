/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

'use client';

import { ChevronIcon, HubIcon } from './hub-icons';

export type HubTabId = string;

interface HubTab {
  id: HubTabId;
  label: string;
  icon: string;
}

export interface HubGroup {
  id: string;
  label: string;
  icon: string;
  color: string;
  preview: string;
  tabs: HubTab[];
}

export const HUB_GROUPS: HubGroup[] = [
  {
    id: 'agents',
    label: '成员协作',
    icon: 'users',
    color: 'var(--color-opus-primary)',
    preview: '总览 · 能力 · 配额 · 技能',
    tabs: [
      { id: 'agents', label: '总览', icon: 'users' },
      { id: 'capabilities', label: '能力中心', icon: 'sparkles' },
      { id: 'routing', label: '配额看板', icon: 'chart-pie' },
      { id: 'skills', label: '技能扩展', icon: 'sparkles' },
    ],
  },
  {
    id: 'settings',
    label: '系统配置',
    icon: 'settings',
    color: 'var(--color-cocreator-primary)',
    preview: '账号 · 语音 · 通知',
    tabs: [
      { id: 'system', label: '系统配置', icon: 'settings' },
      { id: 'env', label: '环境 & 文件', icon: 'folder' },
      { id: 'provider-profiles', label: '账号配置', icon: 'user-cog' },
      { id: 'voice', label: '语音设置', icon: 'mic' },
      { id: 'notify', label: '通知', icon: 'bell' },
    ],
  },
  {
    id: 'monitor',
    label: '监控与治理',
    icon: 'activity',
    color: 'var(--color-gemini-primary)',
    preview: '治理 · 救援 · 命令速查',
    tabs: [
      { id: 'governance', label: '治理看板', icon: 'shield' },
      { id: 'rescue', label: '通用智能体救援', icon: 'activity' },
      { id: 'commands', label: '命令速查', icon: 'terminal' },
    ],
  },
];

export const ALL_TABS = HUB_GROUPS.flatMap((group) => group.tabs);

export function findGroupForTab(tabId: string): HubGroup | undefined {
  return HUB_GROUPS.find((group) => group.tabs.some((tab) => tab.id === tabId));
}

export function resolveRequestedHubTab(requestedTab: string, getAgentById: (agentId: string) => unknown): HubTabId {
  if (requestedTab === 'quota') return 'routing';
  if (requestedTab === 'cats') return 'agents';
  if (requestedTab === 'strategy') return 'agents';
  if (getAgentById(requestedTab)) return 'agents';
  return requestedTab;
}

export function AccordionSection({
  group,
  expanded,
  activeTab,
  onToggle,
  onSelectTab,
}: {
  group: HubGroup;
  expanded: boolean;
  activeTab: HubTabId;
  onToggle: () => void;
  onSelectTab: (tabId: HubTabId) => void;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-panel)] shadow-[var(--card-shadow)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-[var(--overlay-item-hover-bg)]"
      >
        <span className="flex-shrink-0" style={{ color: group.color }}>
          <HubIcon name={group.icon} className="h-5 w-5" />
        </span>
        <span className="text-sm font-semibold text-[var(--text-primary)]">{group.label}</span>
        <span className="flex-1" />
        {!expanded ? (
          <span className="hidden max-w-[180px] truncate text-xs text-[var(--text-label-secondary)] sm:inline">
            {group.preview}
          </span>
        ) : null}
        <span
          className="min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-xs font-medium"
          style={{ color: group.color, backgroundColor: `color-mix(in srgb, ${group.color} 14%, transparent)` }}
        >
          {group.tabs.length}
        </span>
        <ChevronIcon expanded={expanded} className="h-4 w-4 flex-shrink-0 text-[var(--text-label-secondary)]" />
      </button>

      {expanded ? (
        <div className="px-2 pb-2">
          {group.tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm transition-colors"
                style={
                  isActive
                    ? {
                        backgroundColor: `color-mix(in srgb, ${group.color} 10%, transparent)`,
                        color: group.color,
                      }
                    : {}
                }
              >
                <span style={isActive ? { color: group.color } : { color: 'var(--text-label-secondary)' }}>
                  <HubIcon name={tab.icon} className="h-4 w-4" />
                </span>
                <span className={isActive ? 'font-medium' : 'text-[var(--text-secondary)]'}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
